// Mirror of looksLikeWeather in supabase/functions/_shared/weatherRead.ts —
// the exact word list that decides "this is a sky question, not a news
// question". Client-side uses (the radar slip's weather card) must agree with
// the server's routing, so the list lives here once for the browser.
const WEATHER_WORDS = [
  "weather", "forecast", "rain", "storm", "temperature", "wind", "snow",
  "heatwave", "heat wave", "cyclone", "typhoon", "hurricane", "monsoon",
  "flood", "sky", "sea ", "ferry", "marine", "tide",
];

export function looksLikeWeather(text: string): boolean {
  const hay = ` ${text.toLowerCase()} `;
  return WEATHER_WORDS.some((w) => hay.includes(w));
}
