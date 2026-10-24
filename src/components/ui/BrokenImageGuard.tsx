"use client";

import { useEffect } from "react";

// Old player photos point at Discord links that have since expired. Rather than
// show a broken-image icon, hide the image so the initials underneath show.
export function BrokenImageGuard() {
  useEffect(() => {
    const mark = (image: HTMLImageElement) => image.setAttribute("data-broken", "true");
    document.querySelectorAll("img").forEach((image) => {
      if (image.complete && image.naturalWidth === 0 && image.getAttribute("src")) mark(image);
    });

    const onError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) mark(event.target);
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);

  return null;
}
