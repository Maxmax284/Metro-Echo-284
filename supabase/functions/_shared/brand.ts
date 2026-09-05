// brand — the single owner of the public product and intelligence names.
//
// Two layers, one identity:
//   PRODUCT_NAME      — the platform/environment the user lives in.
//   INTELLIGENCE_NAME — the part of it that notices, explains and speaks.
//
// Internal engine identifiers (vanta_* columns, vantaVoice, VANTA_IDENTITY,
// X-Vanta-* headers, vanta-converse) intentionally keep their legacy names.
// Nothing here should ever be routed into a database value or a wire header.

export const PRODUCT_NAME = "Metro Echo";
export const INTELLIGENCE_NAME = "Echo";

/** One-line explainer used once in help/about copy, then never repeated. */
export const BRAND_EXPLAINER =
  `${PRODUCT_NAME} is the platform. ${INTELLIGENCE_NAME} is the intelligence inside it — the part that reads the situation and talks to you.`;
