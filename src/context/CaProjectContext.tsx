"use client";

import { createContext, useContext } from "react";

import type { CaProject } from "@/types/ca";

/**
 * The open CA project, loaded once by the project layout and shared with its
 * tabs (Capture, Reports, Site Route), so switching tabs never refetches it.
 */
type CaProjectContextValue = {
  projectNumber: string;
  project: CaProject;
  setProject: (project: CaProject) => void;
};

export const CaProjectContext = createContext<CaProjectContextValue | null>(null);

export function useCaProject(): CaProjectContextValue {
  const value = useContext(CaProjectContext);
  if (!value) {
    throw new Error("useCaProject must be used inside a CA project layout.");
  }
  return value;
}
