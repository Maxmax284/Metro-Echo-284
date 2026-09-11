// Plain word reading for approvals — no clients, no env, safe to import anywhere.

/** A short, typed reply that means "go ahead" — nothing longer or hedged. */
export function readsAsApproval(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (t.length > 42) return false;
  return /^(y|ya|yes|yep|yup|yeah|ok|okay|sure|approve[d]?|approve it|do it|go|go ahead|send it|confirm(ed)?|please do|yes please|that's right|correct)$/.test(t);
}

/** A short, typed reply that means "drop it". */
export function readsAsRejection(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (t.length > 42) return false;
  return /^(n|no|nope|nah|cancel|cancel it|don't|dont|do not|drop it|scrap it|forget it|never mind|nevermind)$/.test(t);
}
