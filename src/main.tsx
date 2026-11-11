import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyRoomSwapPrefs } from "./lib/motionPrefs";
import { applySkinPrefs } from "./lib/skins";
import { armAudioOnFirstGesture } from "./lib/streetSound";
import { startDaylight } from "./lib/daylight";
import { startFlickInertia } from "./lib/flick";
import { registerAppServiceWorker } from "./lib/appSw";

// Room-swap motion knobs are CSS variables; set them before first paint so the
// very first surface animates at the user's chosen speed.
applyRoomSwapPrefs();
// Same for the skin: the background should never flash the default first.
applySkinPrefs();
// Street sound needs no switch: the first touch anywhere wakes the audio.
armAudioOnFirstGesture();
// The light on the wall follows the clock, and keeps following it all day.
startDaylight();
// Thrown lists carry weight: one scroll listener hands velocity to the cards.
startFlickInertia();
// The app-shell worker lets the rooms open with no signal. It registers only
// on the real published app — never in dev or a preview.
registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
