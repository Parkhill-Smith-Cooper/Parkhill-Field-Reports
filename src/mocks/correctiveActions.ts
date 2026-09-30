import "server-only";

import type { SuggestionRequest } from "@/types";

/**
 * Placeholder corrective actions for the first build.
 *
 * Imported only by `src/app/api/corrective-actions/route.ts`. Unlike the cause
 * mock, this one keys off the causes the engineer *selected* on Step 2, so the
 * workflow demonstrably carries the engineer's decisions forward rather than
 * restarting from the raw observation.
 */

type ActionSet = {
  keywords: string[];
  actions: string[];
};

const GENERAL_ACTIONS = [
  "Contractor to correct the installation to match the approved submittal and notify the commissioning agent when ready for retest",
  "Contractor to provide corrected as-built documentation reflecting the field condition",
  "Re-test the affected sequence with the commissioning agent present and record the results",
  "Return all equipment to automatic control and confirm no overrides remain in place",
];

const ACTION_SETS: ActionSet[] = [
  {
    keywords: ["damper", "actuator", "stroke", "economizer", "outside air"],
    actions: [
      "Controls contractor to adjust actuator stroke and confirm full closure and full open positions",
      "Verify damper end switches and command-to-position feedback across the full range",
      "Re-commission the economizer changeover setpoint for the project climate zone",
    ],
  },
  {
    keywords: ["vfd", "fan", "speed", "static", "airflow", "belt", "filter"],
    actions: [
      "Reset the VFD minimum speed to the value required for design minimum airflow",
      "Test and balance contractor to re-verify airflow at the terminal units and record readings",
      "Reset the duct static pressure setpoint using a static pressure reset strategy",
      "Replace loaded filters and record the clean-filter pressure drop as a baseline",
    ],
  },
  {
    keywords: ["valve", "flow", "balanc", "strainer", "purge", "air", "pump", "water"],
    actions: [
      "Balancing contractor to set the circuit to design flow and record the final valve position",
      "Purge air from the affected coil and riser, then re-verify differential pressure",
      "Clean the strainer and document the condition of the debris found",
      "Verify the control valve closes fully and holds against system pressure",
    ],
  },
  {
    keywords: ["sensor", "calibrat", "reading", "temperature", "humidity"],
    actions: [
      "Calibrate the sensor against a traceable reference instrument and record both readings",
      "Relocate the sensor to the location shown on the drawings, away from local influences",
      "Verify the controller input scaling matches the sensor range",
    ],
  },
  {
    keywords: ["sequence", "control", "point", "graphic", "schedule", "alarm", "trend"],
    actions: [
      "Controls contractor to revise the programming to match the current sequence of operations",
      "Correct the point mapping at the controller and re-verify command and feedback",
      "Set alarm limits to the specified values and demonstrate each alarm in the field",
      "Enable trend logs at the specified interval for the verification period",
      "Align occupied and unoccupied schedules with the owner's operating hours",
    ],
  },
  {
    keywords: ["submittal", "design", "document", "drawing", "as-built"],
    actions: [
      "Submit an RFI to the design team to confirm the intended configuration before correcting",
      "Provide a revised submittal for review prior to reinstallation",
    ],
  },
  {
    keywords: ["incomplete", "prerequisite", "trade", "override", "hand"],
    actions: [
      "Complete the outstanding prerequisite work and re-notify for commissioning",
      "Remove all hand and override commands and confirm the system runs in automatic",
    ],
  },
];

function matches(set: ActionSet, haystack: string): boolean {
  return set.keywords.some((keyword) => haystack.includes(keyword));
}

export function buildMockActions(request: SuggestionRequest): string[] {
  const haystack = [
    // The selected causes lead, because the corrective action should follow
    // from the cause the engineer accepted, not from the raw observation.
    ...(request.selectedCauses ?? []),
    request.equipment,
    request.system,
    request.observation,
  ]
    .join(" ")
    .toLowerCase();

  const matched = ACTION_SETS.filter((set) => matches(set, haystack)).flatMap(
    (set) => set.actions,
  );

  const combined = [...matched, ...GENERAL_ACTIONS];

  return Array.from(new Set(combined)).slice(0, 7);
}
