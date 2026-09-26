// signalBars — the connectivity dial, pure.
//
// The device's own report, mapped to bars and a plain word. No ping, no
// fetch: Echo never spends a packet to learn whether packets would flow.
// The words stay honest — a phone can claim a line that carries nothing,
// and the dial says whose word it is.

export type SignalRead = {
  bars: 0 | 1 | 2 | 3 | 4;
  word: string;
  sub: string;
};

export function signalRead(
  online: boolean,
  effectiveType?: string | null,
  rttMs?: number | null,
): SignalRead {
  if (!online) {
    return { bars: 0, word: "Offline", sub: "the cabinet still reads — it's all on-device" };
  }
  const rtt = Number.isFinite(rttMs) ? `~${Math.round(Number(rttMs))}ms` : null;
  switch (effectiveType) {
    case "slow-2g":
    case "2g":
      return { bars: 1, word: "Thin line", sub: rtt ? `2g or worse · ${rtt}` : "2g or worse — patience" };
    case "3g":
      return { bars: 2, word: "Fair line", sub: rtt ? `3g · ${rtt}` : "3g — enough, barely" };
    case "4g":
      return { bars: 4, word: "Good line", sub: rtt ? `4g · ${rtt}` : "4g" };
    default:
      return { bars: 3, word: "Online", sub: "the device's word — a dead line can still claim one" };
  }
}
