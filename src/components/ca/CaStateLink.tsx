"use client";

import { forwardRef } from "react";

import { caNavigate } from "@/lib/ca/routes";

/**
 * A real link (so it can be opened in a new tab or copied) that, on a plain
 * click, moves within the Reports tab with `history.pushState` instead of a
 * Next.js navigation. That keeps report screens working offline, including
 * reports that have never reached the server.
 */
export const CaStateLink = forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
  function CaStateLink({ href, onClick, ...rest }, ref) {
    return (
      <a
        ref={ref}
        href={href}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }
          event.preventDefault();
          caNavigate(href);
        }}
        {...rest}
      />
    );
  },
);
