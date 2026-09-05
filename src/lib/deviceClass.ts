// Which body Echo is speaking through right now.
//
// Coarse on purpose: enough to say less on a small screen, never enough to
// fingerprint a device. Pure read of what the browser already tells us.
import type { DeviceClass } from "@/lib/awareness";
import { isNative } from "@/lib/native";

export function detectDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const w = window.innerWidth || 0;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  if (/Watch/i.test(ua)) return "wearable";
  if (/CarPlay|Android Auto/i.test(ua)) return "vehicle";
  if (/iPad|Tablet/i.test(ua) || (coarse && w >= 700)) return "tablet";
  if (/iPhone|Android|Mobile/i.test(ua) || (coarse && w < 700)) return "phone";
  if (isNative()) return "phone";
  if (w > 0) return "desk";
  return "unknown";
}

export const DEVICE_LABEL: Record<DeviceClass, string> = {
  desk: "Desk",
  phone: "Phone",
  tablet: "Tablet",
  wearable: "Watch",
  earbuds: "Earbuds",
  vehicle: "In a vehicle",
  ambient: "Ambient",
  unknown: "Unknown device",
};
