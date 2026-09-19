// useNetworkReach — whether this device can reach anything right now.
//
// Doctrine:
//   - Once the doors shut, no signal is the normal case, not a fault. Echo says
//     so once, quietly, and stops asking the airline until there are bars again.
//   - It reports the browser's own reading. It never pings a server to find out,
//     because a probe on a dead network is the same silence with a cost.
import { useEffect, useState } from "react";

/** What Echo does when the bars go. Said once, in one place. */
export const QUIET_SKY =
  "No signal, so Echo has stopped asking the airline. Everything on this card runs on your device's clock and the times already on record. It picks the feed back up on its own when you are back on a network.";

export function useNetworkReach(): { online: boolean } {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return { online };
}
