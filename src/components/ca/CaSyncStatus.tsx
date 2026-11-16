"use client";

import { Button, Spinner } from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import {
  LuCircleCheck,
  LuCloudOff,
  LuKeyRound,
  LuRefreshCw,
  LuTriangleAlert,
  LuUpload,
} from "react-icons/lu";

import { caSync, useCaSyncStatus } from "@/lib/ca/offline/appSync";
import { retryBlocked } from "@/lib/ca/offline/photoStore";
import type { SyncSnapshot } from "@/lib/ca/offline/syncEngine";

type Look = {
  label: string;
  icon: React.ReactNode;
  bg: string;
  color: string;
  action: "sync" | "retry" | "signin";
};

export function describeSync(s: SyncSnapshot): Look {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (s.phase === "auth") {
    return { label: "Sign in to sync", icon: <LuKeyRound />, bg: "orange.500", color: "white", action: "signin" };
  }
  if (s.phase === "offline") {
    return s.pending > 0
      ? { label: `Offline — ${n(s.pending, "item")} saved on this device`, icon: <LuCloudOff />, bg: "gray.800", color: "white", action: "sync" }
      : { label: "Offline", icon: <LuCloudOff />, bg: "gray.800", color: "white", action: "sync" };
  }
  if (s.phase === "syncing") {
    return { label: s.pending > 0 ? `Syncing ${n(s.pending, "item")}…` : "Syncing…", icon: <Spinner size="xs" />, bg: "blue.600", color: "white", action: "sync" };
  }
  if (s.blocked > 0) {
    return { label: `${n(s.blocked, "item")} failed — tap to retry`, icon: <LuTriangleAlert />, bg: "red.700", color: "white", action: "retry" };
  }
  if (s.pending > 0) {
    return { label: `${n(s.pending, "item")} waiting to upload`, icon: <LuUpload />, bg: "orange.500", color: "white", action: "sync" };
  }
  return { label: "All synced", icon: <LuCircleCheck />, bg: "green.700", color: "white", action: "sync" };
}

/**
 * Always-visible sync state, in words rather than an icon alone, with
 * high-contrast colours that stay readable in sunlight. Tapping it does the
 * obvious thing: sync now, retry failures, or go sign in.
 */
export function CaSyncStatus() {
  const status = useCaSyncStatus();
  const look = describeSync(status);
  const returnTo = usePathname() ?? "/field-reports";

  function onClick() {
    if (look.action === "retry") void retryBlocked().then(() => caSync.syncNow());
    else if (look.action === "sync") void caSync.syncNow();
  }

  const pill = (
    <Button
      asChild={look.action === "signin"}
      data-testid="ca-sync-status"
      data-phase={status.phase}
      data-print="hide"
      onClick={look.action === "signin" ? undefined : onClick}
      size="md"
      minH="44px"
      borderRadius="full"
      bg={look.bg}
      color={look.color}
      _hover={{ opacity: 0.92, bg: look.bg }}
      aria-live="polite"
      title={status.lastError ?? "Tap to sync now"}
      px="4"
      fontWeight="semibold"
      whiteSpace="normal"
      textAlign="left"
    >
      {look.action === "signin" ? (
        // Sign-in is a full navigation to the identity provider; the captured
        // data stays on the device and syncs once the session is back.
        <a href={`/api/saml/login?returnTo=${encodeURIComponent(returnTo)}`}>
          {look.icon}
          {look.label}
        </a>
      ) : (
        <>
          {look.icon}
          {look.label}
          {look.action === "sync" && status.phase !== "syncing" && status.pending > 0 && <LuRefreshCw />}
        </>
      )}
    </Button>
  );
  return pill;
}
