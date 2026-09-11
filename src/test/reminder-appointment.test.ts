import { describe, expect, it } from "vitest";
import { looksLikeAppointment } from "../../supabase/functions/_shared/reminderParse";
describe("appointment shape", () => {
  it("spots people and places", () => {
    expect(looksLikeAppointment("Meet up with Dani at One Loudoun")).toBe(true);
    expect(looksLikeAppointment("ADHD appointment")).toBe(true);
  });
  it("leaves plain nudges alone", () => {
    expect(looksLikeAppointment("take out the trash")).toBe(false);
    expect(looksLikeAppointment("stretch at 6pm")).toBe(false);
  });
});
