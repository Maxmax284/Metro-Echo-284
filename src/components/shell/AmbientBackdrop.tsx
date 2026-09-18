// AmbientBackdrop — one fixed layer behind the whole app.
//
// Static by design. Every skin is the same five layers with different weights,
// so there is one ambient system rather than five backgrounds. Layers are
// decorative and inert: pointer-events none, aria-hidden, no data, no motion.
// The old room scan and nav light-throw passes were removed — full-screen
// animated layers over painted walls read as flicker on mobile.
// One painted wall per room — heavy artwork, bundled with the app.
// index.css owns every visual consequence — this only hands over the URLs.
import todayWall from "@/assets/wall-today-dawn.jpg";
import workWall from "@/assets/wall-work-railyard.jpg";
import askWall from "@/assets/wall-ask-alley.jpg";
import receiptsWall from "@/assets/wall-receipts-pasteup.jpg";
import settingsWall from "@/assets/wall-settings-door.jpg";
/* City walls — the district you are standing in, layered behind the room's own
   tag at low opacity. They shift only when the recorded place shifts. */
import taipeiWall from "@/assets/place-wall-taipei.jpg";
import bangkokWall from "@/assets/place-wall-bangkok.jpg";
import tokyoWall from "@/assets/place-wall-tokyo.jpg";

export function AmbientBackdrop() {
  return (
    <div
      className="vanta-backdrop"
      aria-hidden
      style={
        {
          "--bd-wall-today": `url(${todayWall})`,
          "--bd-wall-work": `url(${workWall})`,
          "--bd-wall-ask": `url(${askWall})`,
          "--bd-wall-receipts": `url(${receiptsWall})`,
          "--bd-wall-settings": `url(${settingsWall})`,
          "--bd-place-taipei": `url(${taipeiWall})`,
          "--bd-place-bangkok": `url(${bangkokWall})`,
          "--bd-place-tokyo": `url(${tokyoWall})`,
        } as React.CSSProperties
      }
    >
      {/* Warm every wall once so switching rooms never waits on a download. */}
      {[todayWall, workWall, askWall, receiptsWall, settingsWall].map((src) => (
        <img key={src} src={src} alt="" width={1} height={1} decoding="async" className="sr-only" />
      ))}
      <div className="vanta-bd-wash" />
      {/* One painted wall per room — static, edge-weighted, behind everything. */}
      <div className="vanta-bd-wall" />
      {/* The district. Only present when the recorded place has a kept wall. */}
      <div className="vanta-bd-place" />
      <div className="vanta-bd-grid" />
      <div className="vanta-bd-streaks" />
      <div className="vanta-bd-traces" />
      <div className="vanta-bd-sheen" />
      <div className="vanta-bd-grain" />
      {/* Contrast floor for operational text — artwork stays, readability wins. */}
      <div className="vanta-bd-scrim" />
    </div>
  );
}
