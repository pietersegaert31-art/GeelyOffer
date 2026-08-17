// Pricing calculation utilities for Belgium (21% VAT)
const VAT_RATE = 0.21;

// Returns an error message if the inputs are unsafe to price, or null if they're valid.
export function validatePricingInputs(basePrice, accessoriesPrice, discountPercentage) {
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return 'basePrice must be a non-negative number';
  }
  if (!Number.isFinite(accessoriesPrice) || accessoriesPrice < 0) {
    return 'accessoriesPrice must be a non-negative number';
  }
  if (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
    return 'discountPercentage must be a number between 0 and 100';
  }
  return null;
}

// basePrice and accessoriesPrice are Belgian consumer prices (adviesprijzen) as published by
// Geely, which are already VAT-inclusive — so the excl-VAT amount is derived by dividing back
// out the VAT rate, not by adding VAT on top of it.
export function calculatePricing(basePrice, accessoriesPrice = 0, discountPercentage = 0) {
  const subtotalBeforeDiscount = basePrice + accessoriesPrice; // incl. BTW
  const discountAmount = (subtotalBeforeDiscount * discountPercentage) / 100;
  const totalInclVat = subtotalBeforeDiscount - discountAmount;
  const totalExclVat = totalInclVat / (1 + VAT_RATE);
  const vat = totalInclVat - totalExclVat;

  return {
    basePrice: parseFloat(basePrice.toFixed(2)),
    accessoriesPrice: parseFloat(accessoriesPrice.toFixed(2)),
    subtotalBeforeDiscount: parseFloat(subtotalBeforeDiscount.toFixed(2)),
    discountPercentage,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    subtotal: parseFloat(totalExclVat.toFixed(2)), // total excl. BTW, after discount
    vat: parseFloat(vat.toFixed(2)),
    vatRate: VAT_RATE,
    total: parseFloat(totalInclVat.toFixed(2)) // total incl. BTW, after discount
  };
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
