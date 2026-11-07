import { useEffect } from "react";

// The viewer and the gallery are Modals, but React Native still offers their
// touches to what they were opened from. Swipe to reply and the gallery check
// these, so swiping through media doesn't start a reply or close the gallery.
const open = { any: 0, viewer: 0 };

export function useMediaOverlayOpen(kind: "viewer" | "gallery") {
  useEffect(() => {
    open.any++;
    if (kind === "viewer") open.viewer++;
    return () => {
      open.any--;
      if (kind === "viewer") open.viewer--;
    };
  }, [kind]);
}

export function isMediaOverlayOpen() {
  return open.any > 0;
}

export function isViewerOpen() {
  return open.viewer > 0;
}
