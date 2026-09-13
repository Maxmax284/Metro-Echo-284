-- Echo can now be pointed at a first-party product to make an approved change.
-- Adding the executor kind only; nothing is enabled by this migration.
ALTER TYPE public.executor_kind ADD VALUE IF NOT EXISTS 'first_party';