import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyRoomSwapPrefs } from "./lib/motionPrefs";

// Room-swap motion knobs are CSS variables; set them before first paint so the
// very first surface animates at the user's chosen speed.
applyRoomSwapPrefs();

createRoot(document.getElementById("root")!).render(<App />);
