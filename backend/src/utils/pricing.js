// Pricing calculation utilities for Belgium (21% VAT)
const VAT_RATE = 0.21;
const DISCOUNT_TYPES = ['percentage', 'fixed'];

// Returns an error message if the inputs are unsafe to price, or null if they're valid.
export function validatePricingInputs(basePrice, accessoriesPrice, discountType, discountValue) {
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return 'basePrice must be a non-negative number';
  }
  if (!Number.isFinite(accessoriesPrice) || accessoriesPrice < 0) {
    return 'accessoriesPrice must be a non-negative number';
  }
  if (!DISCOUNT_TYPES.includes(discountType)) {
    return 'discountType must be "percentage" or "fixed"';
  }
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return 'discountValue must be a non-negative number';
  }
  if (discountType === 'percentage' && discountValue > 100) {
    return 'discountValue must be between 0 and 100 for a percentage discount';
  }
  return null;
}

// basePrice and accessoriesPrice are Belgian consumer prices (adviesprijzen) as published by
// Geely, which are already VAT-inclusive — so the excl-VAT amount is derived by dividing back
// out the VAT rate, not by adding VAT on top of it.
//
// discountType is either 'percentage' (discountValue is 0-100) or 'fixed' (discountValue is a
// flat euro amount, e.g. a campaign discount) — a fixed discount is capped at the pre-discount
// discountable amount so a quote can never go negative.
//
// nonDiscountableAccessoriesPrice is the portion of accessoriesPrice that's excluded from
// the discount — a mandatory fee (e.g. the delivery pack) or a "true accessory" bolted on
// separately (e.g. a towing hook), as opposed to a negotiable configuration choice (paint,
// upholstery). It's still included in subtotalBeforeDiscount and the final total like
// everything else, just not in what the discount percentage/amount is calculated against —
// matching how the dealership's other quoting tool treats these: a discount reduces the
// vehicle price and its configuration options, never a flat fee or bolt-on accessory.
export function calculatePricing(basePrice, accessoriesPrice = 0, discountType = 'percentage', discountValue = 0, nonDiscountableAccessoriesPrice = 0) {
  const subtotalBeforeDiscount = basePrice + accessoriesPrice; // incl. BTW
  const discountableAmount = Math.max(0, subtotalBeforeDiscount - nonDiscountableAccessoriesPrice);
  const discountAmount = discountType === 'fixed'
    ? Math.min(discountValue, discountableAmount)
    : (discountableAmount * discountValue) / 100;
  const totalInclVat = subtotalBeforeDiscount - discountAmount;
  const totalExclVat = totalInclVat / (1 + VAT_RATE);
  const vat = totalInclVat - totalExclVat;

  return {
    basePrice: parseFloat(basePrice.toFixed(2)),
    accessoriesPrice: parseFloat(accessoriesPrice.toFixed(2)),
    subtotalBeforeDiscount: parseFloat(subtotalBeforeDiscount.toFixed(2)),
    discountType,
    discountValue,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    subtotal: parseFloat(totalExclVat.toFixed(2)), // total excl. BTW, after discount
    vat: parseFloat(vat.toFixed(2)),
    vatRate: VAT_RATE,
    total: parseFloat(totalInclVat.toFixed(2)) // total incl. BTW, after discount
  };
}

// Above these, a discount needs a sales manager/admin's sign-off before the quote can
// be sent or accepted — tune freely, these are just sensible starting points for a
// dealership selling €30-45k cars. A discount applied BY a manager/admin never needs
// this (they're the approver), regardless of size.
export const DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE = 15;
export const DISCOUNT_APPROVAL_THRESHOLD_FIXED = 3000;

export function discountNeedsApproval(discountType, discountValue) {
  if (!discountValue) return false;
  return discountType === 'fixed'
    ? discountValue > DISCOUNT_APPROVAL_THRESHOLD_FIXED
    : discountValue > DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE;
}

export function getDiscountTier(quantity) {
  if (quantity >= 10) return 15;
  if (quantity >= 5) return 10;
  if (quantity >= 3) return 5;
  return 0;
}

export function formatPrice(price) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR'
  }).format(price);
}
