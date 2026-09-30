import "server-only";

import type { SuggestionRequest } from "@/types";

/**
 * Placeholder failure causes for the first build.
 *
 * This file is imported only by `src/app/api/failure-causes/route.ts`, never by
 * a component, so it deletes cleanly when the real OpenAI call lands.
 *
 * The suggestions are keyed loosely off the equipment and system text so the
 * output visibly responds to what the engineer typed, rather than being a
 * constant list. That matters for evaluating the workflow honestly: a fixed
 * list makes Step 2 feel inert in a way the real feature will not.
 */

type CauseSet = {
  /** Matched case-insensitively against the equipment and system fields. */
  keywords: string[];
  causes: string[];
};

const GENERAL_CAUSES = [
  "Installation does not match the approved submittal or design documents",
  "Control sequence not implemented as described in the sequence of operations",
  "Sensor out of calibration, reporting a value inconsistent with field conditions",
  "Required prerequisite work by another trade is incomplete",
  "Equipment left in hand or override mode following start-up",
];

const CAUSE_SETS: CauseSet[] = [
  {
    keywords: ["ahu", "air handl", "rtu", "rooftop", "fan", "vav", "air"],
    causes: [
      "Supply fan VFD minimum speed set above the design minimum airflow",
      "Outside air damper actuator stroke not adjusted, preventing full closure",
      "Duct static pressure setpoint set higher than required, masking a control issue",
      "Filters loaded beyond final pressure drop, reducing airflow across the coil",
      "Belt tension or sheave alignment out of tolerance on the supply fan",
      "Economizer changeover setpoint incorrect for the local climate zone",
    ],
  },
  {
    keywords: ["chill", "chw", "cooling tower", "condenser", "pump", "hydronic"],
    causes: [
      "Balancing valve not set to the design flow rate for the branch",
      "Air not fully purged from the coil or riser, restricting flow",
      "Differential pressure sensor located away from the design control point",
      "Chilled water reset schedule not enabled as specified",
      "Strainer partially blocked with construction debris",
      "Pump rotation or impeller trim inconsistent with the schedule",
    ],
  },
  {
    keywords: ["boiler", "hhw", "heat", "steam", "reheat"],
    causes: [
      "Hot water reset schedule not programmed to the specified curve",
      "Two-way control valve failing to close fully, allowing continuous flow",
      "Boiler staging setpoints overlap, causing short cycling",
      "Combustion air interlock not proven before burner enable",
      "Mixing valve mis-piped, blending supply and return in the wrong direction",
    ],
  },
  {
    keywords: ["ddc", "bas", "bms", "control", "sequence", "graphic", "point"],
    causes: [
      "Point mapped to the wrong physical input or output at the controller",
      "Sequence of operations implemented from an earlier revision of the drawings",
      "Alarm limits left at controller defaults rather than the specified values",
      "Trend logs not enabled at the interval required for verification",
      "Occupied and unoccupied schedules not aligned with the owner's hours",
    ],
  },
  {
    keywords: ["electric", "panel", "breaker", "generator", "ats", "power", "light"],
    causes: [
      "Circuit fed from a panel other than the one shown on the drawings",
      "Overcurrent device rating does not match the connected load calculation",
      "Transfer switch timing not adjusted to the specified delay",
      "Lighting control zone assignment does not match the room layout",
      "Equipment grounding conductor terminated to the wrong bus",
    ],
  },
  {
    keywords: ["plumb", "domestic water", "dhw", "backflow", "drain", "sanitary"],
    causes: [
      "Mixing valve outlet temperature set above the specified limit",
      "Recirculation pump not running on the specified schedule",
      "Backflow preventer installed at the wrong orientation or elevation",
      "Trap primer not connected to a live water source",
      "Pipe insulation missing at hangers and penetrations",
    ],
  },
];

function matches(set: CauseSet, haystack: string): boolean {
  return set.keywords.some((keyword) => haystack.includes(keyword));
}

export function buildMockCauses(request: SuggestionRequest): string[] {
  const haystack = [
    request.equipment,
    request.system,
    request.activity,
    request.observation,
  ]
    .join(" ")
    .toLowerCase();

  const matched = CAUSE_SETS.filter((set) => matches(set, haystack)).flatMap(
    (set) => set.causes,
  );

  // Always finish with a couple of discipline-agnostic causes so the engineer
  // has something to react to even when nothing matched.
  const combined = [...matched, ...GENERAL_CAUSES];

  return Array.from(new Set(combined)).slice(0, 7);
}
