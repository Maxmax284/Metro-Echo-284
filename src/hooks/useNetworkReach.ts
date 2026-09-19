// useNetworkReach — whether this device can reach anything right now, and how.
//
// Doctrine:
//   - Once the doors shut, no signal is the normal case, not a fault. Echo says
//     so once, quietly, and stops asking the airline until there are bars again.
//   - Reach is reach. Airport Wi-Fi and a mobile network count the same; neither
//     is treated as the only way back on.
//   - It reports the browser's own reading. It never pings a server to find out,
//     because a probe on a dead network is the same silence with a cost.
import { useEffect, useState } from "react";

/** What Echo does when the bars go. Said once, in one place. */
export const QUIET_SKY =
  "No signal, so Echo has stopped asking the airline. Everything on this card runs on your device's clock and the times already on record. It picks the feed back up on its own the moment you are on Wi-Fi or a mobile network again.";

/** How this device is reaching the world, when the browser will say. */
export type ReachKind = "wifi" | "cellular" | "wired" | "unknown";

type NetInfo = {
  type?: string;
  effectiveType?: string;
  addEventListener?: (t: string, fn: () => void) => void;
  removeEventListener?: (t: string, fn: () => void) => void;
};

function netInfo(): NetInfo | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as unknown as { connection?: NetInfo; mozConnection?: NetInfo; webkitConnection?: NetInfo };
  return n.connection ?? n.mozConnection ?? n.webkitConnection ?? null;
}

/** The kind of link, from whatever the browser exposes. Unknown stays unknown. */
export function reachKind(info: NetInfo | null): ReachKind {
  const t = (info?.type ?? "").toLowerCase();
  if (t === "wifi") return "wifi";
  if (t === "cellular") return "cellular";
  if (t === "ethernet") return "wired";
  /* Some browsers hide the link type and only grade the speed. A graded mobile
     link is still a link, so it counts as reach without being named cellular. */
  return "unknown";
}

/** Reading the browser: offline wins, and a link type of "none" is offline too. */
export function reachNow(): { online: boolean; kind: ReachKind } {
  if (typeof navigator === "undefined") return { online: true, kind: "unknown" };
  const info = netInfo();
  const declaredNone = (info?.type ?? "").toLowerCase() === "none";
  return { online: navigator.onLine !== false && !declaredNone, kind: reachKind(info) };
}

export function useNetworkReach(): { online: boolean; kind: ReachKind } {
  const [reach, setReach] = useState(() => reachNow());

  useEffect(() => {
    const settle = () => setReach(reachNow());
    window.addEventListener("online", settle);
    window.addEventListener("offline", settle);
    /* Swapping cabin Wi-Fi for a mobile network on the ground does not always
       fire online/offline — the link itself changes. Echo listens for that too. */
    const info = netInfo();
    info?.addEventListener?.("change", settle);
    return () => {
      window.removeEventListener("online", settle);
      window.removeEventListener("offline", settle);
      info?.removeEventListener?.("change", settle);
    };
  }, []);

  return reach;
}
