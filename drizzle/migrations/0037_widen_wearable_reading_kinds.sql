-- The stored kinds must match the shared list Echo already accepts and shows
-- (_shared/bodyKinds.ts). The old five-kind check silently rejected weight,
-- blood pressure, temperature and the rest at the door.
alter table public.wearable_readings drop constraint if exists wearable_readings_kind_check;

alter table public.wearable_readings
  add constraint wearable_readings_kind_check check (kind = any (array[
    'heart_rate','resting_heart_rate','hrv','spo2','respiratory_rate','temperature',
    'weight','body_fat','bp_systolic','bp_diastolic','pulse',
    'steps','stand','workout','active_minutes','calories','distance_walk','distance_cycle',
    'sleep'
  ]));