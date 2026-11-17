"use client";

import { track } from "@vercel/analytics";
import type { ComponentProps } from "react";

/** A link that records one analytics event when tapped. */
export function TrackedLink({ event, ...props }: ComponentProps<"a"> & { event: string }) {
  return (
    <a
      {...props}
      onClick={(click) => {
        track(event);
        props.onClick?.(click);
      }}
    />
  );
}
