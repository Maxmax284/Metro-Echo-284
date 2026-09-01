// wearableBluetooth.ts — the only place that touches a real device.
//
// Standard Bluetooth heart-rate service. User gesture only, one device at a
// time, and nothing is stored unless the caller already checked consent. If the
// browser can't do it, we say so instead of showing a dead button.

/** Standard GATT heart-rate service and measurement characteristic. */
const HR_SERVICE = "heart_rate";
const HR_CHARACTERISTIC = "heart_rate_measurement";

export function bluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function bluetoothUnavailableReason(): string {
  if (bluetoothAvailable()) return "";
  return "This browser can't talk to Bluetooth devices. Chrome on Android or a desktop can; Safari and iPhone can't.";
}

function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  /* Bit 0 tells us whether the value is 8-bit or 16-bit. */
  return flags & 0x1 ? value.getUint16(1, true) : value.getUint8(1);
}

export interface HeartRateSession {
  deviceName: string;
  stop: () => Promise<void>;
}

/**
 * Ask for a device, then stream beats per minute until stopped.
 * Must be called from a real user gesture.
 */
export async function startHeartRate(
  onBeat: (bpm: number) => void,
): Promise<HeartRateSession> {
  if (!bluetoothAvailable()) throw new Error(bluetoothUnavailableReason());
  const bt = (navigator as unknown as { bluetooth: any }).bluetooth;
  const device = await bt.requestDevice({ filters: [{ services: [HR_SERVICE] }] });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(HR_SERVICE);
  const characteristic = await service.getCharacteristic(HR_CHARACTERISTIC);

  const handler = (event: Event) => {
    const target = event.target as unknown as { value?: DataView };
    if (!target?.value) return;
    const bpm = parseHeartRate(target.value);
    if (bpm > 0 && bpm < 260) onBeat(bpm);
  };

  characteristic.addEventListener("characteristicvaluechanged", handler);
  await characteristic.startNotifications();

  return {
    deviceName: String(device.name ?? "Unnamed device"),
    stop: async () => {
      try {
        characteristic.removeEventListener("characteristicvaluechanged", handler);
        await characteristic.stopNotifications();
      } catch {
        /* the device may already be gone */
      }
      try {
        device.gatt?.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
