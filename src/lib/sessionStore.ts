"use client";

/**
 * Thin, failure-tolerant wrapper over `sessionStorage`.
 *
 * Used to mirror the in-progress observation draft so that a backgrounded tab
 * or an accidental reload in the field does not lose the engineer's notes.
 * Private browsing and locked-down browsers can make every access throw, so
 * every call is guarded - losing the mirror is a degraded experience, never an
 * error the engineer has to see.
 */

export function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled. The draft still lives in React
    // state for this page view; only reload-survival is lost.
  }
}

export function clearSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing useful to do.
  }
}
