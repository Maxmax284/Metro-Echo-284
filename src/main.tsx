import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyRoomSwapPrefs } from "./lib/motionPrefs";
import { applySkinPrefs } from "./lib/skins";
import { armAudioOnFirstGesture } from "./lib/streetSound";

// Room-swap motion knobs are CSS variables; set them before first paint so the
// very first surface animates at the user's chosen speed.
applyRoomSwapPrefs();
// Same for the skin: the background should never flash the default first.
applySkinPrefs();
// Street sound needs no switch: the first touch anywhere wakes the audio.
armAudioOnFirstGesture();

createRoot(document.getElementById("root")!).render(<App />);
