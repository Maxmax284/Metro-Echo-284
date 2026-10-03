// Mirror of looksLikeWeather in supabase/functions/_shared/weatherRead.ts —
// the exact test that decides "this is a sky question, not a news question".
// Client-side uses (the radar slip's weather card) must agree with the
// server's routing, so the same regex lives here for the browser.
const WEATHER_WORDS =
  /\b(weather|forecast|raining|rain|storm|thunderstorm|sunny|cloud(y|s)|overcast|temperature|how hot|how cold|humid|wind(y)?|sea (state|conditions)|ferry|ferries|speedboat|beach day|swim|outside like|what'?s it like out)\b/i;

export function looksLikeWeather(text: string): boolean {
  return WEATHER_WORDS.test(text ?? "");
}
