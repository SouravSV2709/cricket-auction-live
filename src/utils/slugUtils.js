// Utility helpers for working with tournament slugs

/**
 * Normalize a slug for consistent comparisons.
 * Returns a lowercase trimmed string or null when slug is missing.
 */
export const normalizeSlug = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

/**
 * Determine whether an incoming slug matches the slug tied to the current view.
 * Missing incoming slugs only match when the current view also lacks a slug.
 */
export const slugsMatch = (incomingSlug, currentSlug) => {
  const normalizedIncoming = normalizeSlug(incomingSlug);
  const normalizedCurrent = normalizeSlug(currentSlug);

  if (!normalizedIncoming) {
    return normalizedCurrent == null;
  }

  if (!normalizedCurrent) {
    return false;
  }

  return normalizedIncoming === normalizedCurrent;
};
