export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined']

export const STATUS_LABELS = {
  draft: 'Concept',
  sent: 'Verzonden',
  accepted: 'Geaccepteerd',
  declined: 'Geweigerd',
}

// Inventory units use a different status vocabulary than quotes above — shared between
// InventoryPage.jsx and AdminAuditLog.jsx so the two can't drift apart (e.g. a status
// renamed in one place silently going stale in the other).
export const INVENTORY_STATUSES = ['in_stock', 'incoming', 'reserved', 'sold']

export const INVENTORY_STATUS_LABELS = {
  in_stock: 'Op voorraad',
  incoming: 'Onderweg',
  reserved: 'Gereserveerd',
  sold: 'Verkocht',
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

// A car can only have one paint color, and only one interior/upholstery, at a time —
// categories listed here are rendered as mutually exclusive in AccessoriesSelector
// (picking one automatically clears any other selection in the same category), instead of
// independent checkboxes. 'interior' is included even though every model currently has
// only one interior option (so it's never actually been ambiguous yet) — once a model gets
// a second one, this is what keeps a customer from ending up with two interiors selected,
// which would otherwise make the stock-match suggestion (QuoteBuilder.jsx) pick an
// arbitrary one of the two via .find().
export const SINGLE_SELECT_CATEGORIES = ['exterior', 'interior']

// Language the customer-facing PDF and e-mail are generated in — see
// backend/src/i18n/translate.js. The app UI itself stays Dutch regardless of this choice.
export const QUOTE_LANGUAGES = ['nl', 'fr']

export const QUOTE_LANGUAGE_LABELS = {
  nl: 'Nederlands',
  fr: 'Français',
}
