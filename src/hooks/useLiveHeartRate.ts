// useLiveHeartRate — one live Bluetooth heart-rate connection, shared.
//
// Doctrine:
//   - A user gesture opens it; nothing connects on its own.
//   - The live number on screen is for you. One reading a minute is kept, and
//     only when heart rate is switched on. Nothing here approves or runs
//     anything.
//   - When the browser can't talk to a device, say so instead of showing a dead
//     button.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { vantaToast } from "@/lib/vantaVoice";
import {
  bluetoothAvailable,
  bluetoothUnavailableReason,
  startHeartRate,
  type HeartRateSession,
} from "@/lib/wearableBluetooth";

export interface LiveHeartRate {
  /** Beats per minute as they arrive, or null when nothing is connected. */
  bpm: number | null;
  /** The device the beats are coming from, as it named itself. */
  device: string | null;
  connecting: boolean;
  connected: boolean;
  /** False when this browser has no Bluetooth door at all. */
  supported: boolean;
  unsupportedReason: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * @param consented Heart rate must be switched on before a reading is stored.
 * @param onStored Called after a reading is written, so a panel can refresh.
 */
export function useLiveHeartRate(
  consented: boolean,
  onStored?: () => void,
): LiveHeartRate {
  const { user } = useAuth();
  const { withScope } = useScope();
  const [bpm, setBpm] = useState<number | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const session = useRef<HeartRateSession | null>(null);
  const lastStored = useRef(0);
  const stored = useRef(onStored);
  stored.current = onStored;

  /* Never leave a device connected behind a closed page. */
  useEffect(() => {
    return () => {
      void session.current?.stop();
      session.current = null;
    };
  }, []);

  const connect = useCallback(async () => {
    if (!consented) {
      vantaToast.info({
        title: "Heart rate is switched off",
        description: "Turn it on under your senses, then connect.",
      });
      return;
    }
    setConnecting(true);
    try {
      const s = await startHeartRate((beat) => {
        setBpm(beat);
        /* One stored reading a minute. The live number is for you; the record
           is for Echo, and it doesn't need every beat. */
        const now = Date.now();
        if (now - lastStored.current < 60_000) return;
        lastStored.current = now;
        if (!user) return;
        void supabase
          .from("wearable_readings")
          .insert(
            withScope({
              user_id: user.id,
              kind: "heart_rate",
              value: beat,
              unit: "bpm",
              measured_at: new Date().toISOString(),
              source: "bluetooth",
            }) as never,
          )
          .then(() => stored.current?.());
      });
      session.current = s;
      setDevice(s.deviceName);
      vantaToast.success({
        title: `Reading ${s.deviceName}`,
        description: "One reading is kept a minute, while this page stays open.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The device didn't connect.";
      vantaToast.error({
        title: "No watch connected",
        description: /cancel|user/i.test(msg) ? "Nothing was picked, so nothing changed." : msg,
      });
    } finally {
      setConnecting(false);
    }
  }, [consented, user, withScope]);

  const disconnect = useCallback(async () => {
    await session.current?.stop();
    session.current = null;
    setBpm(null);
    setDevice(null);
    vantaToast.info({
      title: "Watch disconnected",
      description: "Nothing is being read. What was already stored stays.",
    });
  }, []);

  return {
    bpm,
    device,
    connecting,
    connected: device !== null,
    supported: bluetoothAvailable(),
    unsupportedReason: bluetoothUnavailableReason(),
    connect,
    disconnect,
  };
}
