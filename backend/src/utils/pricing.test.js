import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePricing, validatePricingInputs, getDiscountTier } from './pricing.js';

describe('calculatePricing', () => {
  test('no accessories, no discount: excl/incl VAT are correctly derived from the VAT-inclusive base price', () => {
    // Regression test for the VAT double-counting bug: basePrice is already VAT-inclusive
    // (it's Geely's published adviesprijs), so it must come back unchanged as `total`.
    const result = calculatePricing(36490, 0, 'percentage', 0);
    assert.equal(result.total, 36490);
    assert.equal(result.subtotal, 30157.02); // matches the official Geely price list's netto figure
    assert.equal(result.vat, 6332.98);
    assert.equal(Math.round((result.subtotal + result.vat) * 100) / 100, result.total);
  });

  test('accessories are added to the VAT-inclusive base before splitting out VAT', () => {
    const result = calculatePricing(37490, 650, 'percentage', 0);
    assert.equal(result.subtotalBeforeDiscount, 38140);
    assert.equal(result.total, 38140);
  });

  test('discount is applied to the VAT-inclusive subtotal, then VAT is re-derived from the discounted total', () => {
    const result = calculatePricing(37490, 650, 'percentage', 10);
    assert.equal(result.discountAmount, 3814); // 10% of 38140
    assert.equal(result.total, 34326); // 38140 - 3814
    assert.equal(result.subtotal, 28368.6); // 34326 / 1.21
    assert.equal(result.vat, 5957.4);
  });

  test('0% discount leaves totals unchanged', () => {
    const result = calculatePricing(10000, 0, 'percentage', 0);
    assert.equal(result.discountAmount, 0);
    assert.equal(result.total, 10000);
  });

  test('100% discount zeroes out the total', () => {
    const result = calculatePricing(10000, 0, 'percentage', 100);
    assert.equal(result.total, 0);
    assert.equal(result.subtotal, 0);
    assert.equal(result.vat, 0);
  });

  test('rounds every monetary field to 2 decimals', () => {
    const result = calculatePricing(33490, 500, 'percentage', 8);
    for (const key of ['basePrice', 'accessoriesPrice', 'subtotalBeforeDiscount', 'discountAmount', 'subtotal', 'vat', 'total']) {
      const value = result[key];
      assert.equal(Math.round(value * 100) / 100, value, `${key} should already be rounded to 2 decimals`);
    }
  });

  test('a fixed euro discount is capped at the discountable amount, not the full subtotal, when a mandatory fee is present', () => {
    const result = calculatePricing(1000, 0, 'fixed', 5000, 949);
    // Discountable amount is only 1000 - 949 = 51, so the discount can't exceed that,
    // even though the full subtotal (1000) would otherwise "afford" more.
    assert.equal(result.discountAmount, 51);
    assert.equal(result.total, 949);
  });

  describe('mandatory accessories (e.g. the delivery pack) are excluded from the discount base', () => {
    test('regression test for the real E5 PRO+ discrepancy this was reported against', () => {
      // Geely E5 PRO+ (38490) + one paint option (650) + mandatory delivery pack (949),
      // 13% discount — matches the dealership's other quoting tool: (38490 + 650) * 0.87 + 949.
      const result = calculatePricing(38490, 1599, 'percentage', 13, 949);
      assert.equal(result.discountAmount, 5088.2); // 13% of (38490 + 650), not of (38490 + 1599)
      assert.equal(result.total, 35000.8);
    });

    test('with no mandatory portion, behaves exactly as before (discount applies to everything)', () => {
      const result = calculatePricing(37490, 650, 'percentage', 10, 0);
      assert.equal(result.discountAmount, 3814);
      assert.equal(result.total, 34326);
    });
  });
});

describe('validatePricingInputs', () => {
  test('accepts valid inputs', () => {
    assert.equal(validatePricingInputs(30000, 500, 'percentage', 10), null);
  });

  test('rejects a negative basePrice', () => {
    assert.match(validatePricingInputs(-1, 0, 'percentage', 0), /basePrice/);
  });

  test('rejects a negative accessoriesPrice', () => {
    assert.match(validatePricingInputs(30000, -1, 'percentage', 0), /accessoriesPrice/);
  });

  test('rejects a discount above 100', () => {
    assert.match(validatePricingInputs(30000, 0, 'percentage', 150), /discountValue/);
  });

  test('rejects a negative discount', () => {
    assert.match(validatePricingInputs(30000, 0, 'percentage', -10), /discountValue/);
  });

  test('rejects non-finite numbers', () => {
    assert.match(validatePricingInputs(NaN, 0, 'percentage', 0), /basePrice/);
    assert.match(validatePricingInputs(30000, Infinity, 'percentage', 0), /accessoriesPrice/);
  });
});

describe('getDiscountTier', () => {
  test('below 3 units: no discount', () => {
    assert.equal(getDiscountTier(0), 0);
    assert.equal(getDiscountTier(2), 0);
  });

  test('3-4 units: 5%', () => {
    assert.equal(getDiscountTier(3), 5);
    assert.equal(getDiscountTier(4), 5);
  });

  test('5-9 units: 10%', () => {
    assert.equal(getDiscountTier(5), 10);
    assert.equal(getDiscountTier(9), 10);
  });

  test('10+ units: 15%', () => {
    assert.equal(getDiscountTier(10), 15);
    assert.equal(getDiscountTier(100), 15);
  });
});
