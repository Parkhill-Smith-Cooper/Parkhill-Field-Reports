"use client";

import { createContext, useContext } from "react";

/**
 * The signed-in engineer's display name, read from the session on the server
 * by the CA layout. Used for a new report's "From" line. Display only: every
 * record's `createdBy` / `issuedBy` is stamped by the server, never trusted
 * from the browser.
 */
const CaUserContext = createContext<{ name: string }>({ name: "" });

export function CaUserProvider({ name, children }: { name: string; children: React.ReactNode }) {
  return <CaUserContext.Provider value={{ name }}>{children}</CaUserContext.Provider>;
}

export const useCaUser = () => useContext(CaUserContext);
