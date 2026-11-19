import { isCaError, type CaProjectSource } from "@/lib/ca/contracts";
import type { CaSourceProject } from "@/types/ca";

/** A project New Project can offer, marked when it already exists here. */
export type CaSourceProjectOffer = CaSourceProject & { alreadyCreated: boolean };

export type CaSourceProjectsResult = {
  /** The source the list came from; null when none is configured or all failed. */
  source: CaSourceProject["source"] | null;
  /** Set when the primary source failed and the list came from the fallback. */
  fellBackFrom?: CaSourceProject["source"];
  /** Why the primary (or every) source failed, safe to show the engineer. */
  notice?: string;
  projects: CaSourceProjectOffer[];
};

const messageOf = (error: unknown) =>
  isCaError(error, "CaNotConfiguredError") ? error.message : "The project list could not be loaded.";

/**
 * The New Project list: the primary source (the CA application), or the
 * fallback (VantagePoint) when the primary fails. Projects already created in
 * Field Reports stay in the list, marked `alreadyCreated`, so the dialog can
 * grey them out instead of silently hiding them.
 *
 * Only a failure of every source reaches the engineer as `source: null`, and
 * the dialog then offers manual entry.
 */
export async function loadSourceProjects(input: {
  primary: CaProjectSource | null;
  fallback: CaProjectSource | null;
  existingProjectNumbers: Iterable<string>;
}): Promise<CaSourceProjectsResult> {
  const taken = new Set(input.existingProjectNumbers);
  const mark = (list: CaSourceProject[]): CaSourceProjectOffer[] =>
    list.map((p) => ({ ...p, alreadyCreated: taken.has(p.projectNumber) }));

  const sources = [input.primary, input.fallback].filter((s): s is CaProjectSource => s !== null);
  if (sources.length === 0) return { source: null, projects: [] };

  let firstFailure: { kind: CaSourceProject["source"]; message: string } | null = null;
  for (const source of sources) {
    try {
      const list = await source.list();
      return {
        source: source.kind,
        ...(firstFailure ? { fellBackFrom: firstFailure.kind, notice: firstFailure.message } : {}),
        projects: mark(list),
      };
    } catch (error) {
      if (!isCaError(error, "CaNotConfiguredError")) console.error(`[CA] Project source ${source.kind} failed:`, error);
      firstFailure ??= { kind: source.kind, message: messageOf(error) };
    }
  }
  return { source: null, notice: firstFailure?.message, projects: [] };
}
