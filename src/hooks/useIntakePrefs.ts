import { useCallback } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { DEFAULT_INTAKE_PREFS, type IntakePrefs } from "@/lib/intakeLifecycle";

/**
 * Thin wrapper over useUserPreferences that owns the `intake` block.
 * Lives in profiles.preferences.intake so no new migration is needed.
 */
export function useIntakePrefs() {
  const { prefs, update, loading } = useUserPreferences();
  const raw = (prefs as any).intake as Partial<IntakePrefs> | undefined;
  const intake: IntakePrefs = { ...DEFAULT_INTAKE_PREFS, ...(raw ?? {}) };

  const updateIntake = useCallback(
    async (patch: Partial<IntakePrefs>) => {
      await update({ intake: { ...intake, ...patch } } as any);
    },
    [intake, update],
  );

  return { intake, updateIntake, loading };
}
