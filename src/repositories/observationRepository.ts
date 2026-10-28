import "server-only";

import { cosmosStatus, observationsContainer } from "@/lib/azure/cosmos";
import { currentUser } from "@/lib/currentUser";
import type { SaveObservationInput, SavedObservation } from "@/types";

/** All Cosmos access for observations. */

const OBSERVATION_FIELDS = [
  "c.id",
  "c.projectNumber",
  "c.equipment",
  "c.system",
  "c.location",
  "c.activity",
  "c.observation",
  "c.observedDate",
  "c.photos",
  "c.causes",
  "c.actions",
  "c.status",
  "c.createdAt",
  "c.createdBy",
  "c.updatedAt",
].join(", ");

/**
 * Every observation for one project. Because both containers are partitioned on
 * `/projectNumber`, this is a single-partition query - the app's dominant read
 * and the reason for that partition key choice.
 */
export async function listObservations(
  projectNumber: string,
): Promise<SavedObservation[]> {
  const { resources } = await observationsContainer()
    .items.query<SavedObservation>(
      {
        query: `SELECT ${OBSERVATION_FIELDS} FROM c WHERE c.projectNumber = @projectNumber ORDER BY c.createdAt DESC`,
        parameters: [{ name: "@projectNumber", value: projectNumber }],
      },
      { partitionKey: projectNumber },
    )
    .fetchAll();
  return resources;
}

export async function getObservation(
  projectNumber: string,
  observationId: string,
): Promise<SavedObservation | null> {
  try {
    const { resource } = await observationsContainer()
      .item(observationId, projectNumber)
      .read<SavedObservation>();
    return resource ?? null;
  } catch (error) {
    if (cosmosStatus(error) === 404) return null;
    throw error;
  }
}

/**
 * Writes the finalised observation. The whole record lands in one document in
 * one write, which is why nothing is persisted during Steps 1-3.
 */
export async function saveObservation(
  projectNumber: string,
  input: SaveObservationInput,
): Promise<SavedObservation> {
  const now = new Date().toISOString();
  const observation: SavedObservation = {
    id: input.id,
    projectNumber,
    equipment: input.equipment.trim(),
    system: input.system.trim(),
    location: input.location.trim(),
    activity: input.activity.trim(),
    observation: input.observation.trim(),
    observedDate: input.observedDate,
    photos: input.photos,
    causes: input.causes,
    actions: input.actions,
    status: "final",
    createdAt: now,
    createdBy: await currentUser(),
    updatedAt: now,
  };

  // `upsert` rather than `create`: the observation id is generated when the
  // wizard starts, so a retried save (flaky field connection, double tap on
  // Save) must be idempotent rather than a 409.
  const { resource } = await observationsContainer().items.upsert(observation);
  return (resource as SavedObservation | undefined) ?? observation;
}

/**
 * Replaces the editable content of an existing observation. Who created it and
 * when are carried over from the stored record rather than trusted from the
 * request. Returns `null` when there is no such observation, so an edit can
 * never quietly create one.
 */
export async function updateObservation(
  projectNumber: string,
  input: SaveObservationInput,
): Promise<SavedObservation | null> {
  const existing = await getObservation(projectNumber, input.id);
  if (!existing) return null;

  const observation: SavedObservation = {
    id: existing.id,
    projectNumber,
    equipment: input.equipment.trim(),
    system: input.system.trim(),
    location: input.location.trim(),
    activity: input.activity.trim(),
    observation: input.observation.trim(),
    observedDate: input.observedDate,
    photos: input.photos,
    causes: input.causes,
    actions: input.actions,
    status: "final",
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    updatedAt: new Date().toISOString(),
  };

  const { resource } = await observationsContainer()
    .item(existing.id, projectNumber)
    .replace(observation);
  return (resource as SavedObservation | undefined) ?? observation;
}
