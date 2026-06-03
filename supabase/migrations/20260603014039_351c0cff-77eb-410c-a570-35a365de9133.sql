-- Per-workspace branding: small, additive. Accent + logo + short code only.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS short_code text,
  ADD COLUMN IF NOT EXISTS accent_hsl text,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Short code: optional 2-6 char tag for the switcher chip (e.g. "GTH", "CAMP").
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_short_code_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_short_code_check
  CHECK (short_code IS NULL OR (char_length(short_code) BETWEEN 2 AND 6));

-- Accent: HSL triplet like "212 95% 60%" so it slots straight into hsl(var(...))
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_accent_hsl_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_accent_hsl_check
  CHECK (accent_hsl IS NULL OR accent_hsl ~ '^\s*\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\s*$');