export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined']

export const STATUS_LABELS = {
  draft: 'Concept',
  sent: 'Verzonden',
  accepted: 'Geaccepteerd',
  declined: 'Geweigerd',
}

export const ROLES = ['admin', 'sales_manager', 'sales']

export const ROLE_LABELS = {
  admin: 'Beheerder',
  sales_manager: 'Sales Manager',
  sales: 'Verkoper',
}

export const DISCOUNT_TYPES = ['percentage', 'fixed']

export const DISCOUNT_TYPE_LABELS = {
  percentage: 'Percentage (%)',
  fixed: 'Vast bedrag (€)',
}

// Mirrors backend/src/utils/pricing.js — display-only, the server is the real gate.
export const DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE = 15
export const DISCOUNT_APPROVAL_THRESHOLD_FIXED = 3000

export const DISCOUNT_APPROVAL_STATUS_LABELS = {
  not_required: null,
  pending: 'Goedkeuring vereist',
  approved: 'Korting goedgekeurd',
  rejected: 'Korting geweigerd',
}

export const DISCOUNT_APPROVAL_BADGE_CLASS = {
  pending: 'expiry-soon',
  approved: 'accepted',
  rejected: 'declined',
}

// A car can only have one paint color at a time — categories listed here are rendered
// as mutually exclusive in AccessoriesSelector (picking one automatically clears any
// other selection in the same category), instead of independent checkboxes.
export const SINGLE_SELECT_CATEGORIES = ['exterior']

// Language the customer-facing PDF and e-mail are generated in — see
// backend/src/i18n/translate.js. The app UI itself stays Dutch regardless of this choice.
export const QUOTE_LANGUAGES = ['nl', 'fr']

export const QUOTE_LANGUAGE_LABELS = {
  nl: 'Nederlands',
  fr: 'Français',
}
