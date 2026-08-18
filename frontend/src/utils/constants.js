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
