import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePricing, validatePricingInputs, getDiscountTier } from './pricing.js';

describe('calculatePricing', () => {
  test('no accessories, no discount: excl/incl VAT are correctly derived from the VAT-inclusive base price', () => {
    // Regression test for the VAT double-counting bug: basePrice is already VAT-inclusive
    // (it's Geely's published adviesprijs), so it must come back unchanged as `total`.
    const result = calculatePricing(36490, 0, 0);
    assert.equal(result.total, 36490);
    assert.equal(result.subtotal, 30157.02); // matches the official Geely price list's netto figure
    assert.equal(result.vat, 6332.98);
    assert.equal(Math.round((result.subtotal + result.vat) * 100) / 100, result.total);
  });

  test('accessories are added to the VAT-inclusive base before splitting out VAT', () => {
    const result = calculatePricing(37490, 650, 0);
    assert.equal(result.subtotalBeforeDiscount, 38140);
    assert.equal(result.total, 38140);
  });

  test('discount is applied to the VAT-inclusive subtotal, then VAT is re-derived from the discounted total', () => {
    const result = calculatePricing(37490, 650, 10);
    assert.equal(result.discountAmount, 3814); // 10% of 38140
    assert.equal(result.total, 34326); // 38140 - 3814
    assert.equal(result.subtotal, 28368.6); // 34326 / 1.21
    assert.equal(result.vat, 5957.4);
  });

  test('0% discount leaves totals unchanged', () => {
    const result = calculatePricing(10000, 0, 0);
    assert.equal(result.discountAmount, 0);
    assert.equal(result.total, 10000);
  });

  test('100% discount zeroes out the total', () => {
    const result = calculatePricing(10000, 0, 100);
    assert.equal(result.total, 0);
    assert.equal(result.subtotal, 0);
    assert.equal(result.vat, 0);
  });

  test('rounds every monetary field to 2 decimals', () => {
    const result = calculatePricing(33490, 500, 8);
    for (const key of ['basePrice', 'accessoriesPrice', 'subtotalBeforeDiscount', 'discountAmount', 'subtotal', 'vat', 'total']) {
      const value = result[key];
      assert.equal(Math.round(value * 100) / 100, value, `${key} should already be rounded to 2 decimals`);
    }
  });
});

describe('validatePricingInputs', () => {
  test('accepts valid inputs', () => {
    assert.equal(validatePricingInputs(30000, 500, 10), null);
  });

  test('rejects a negative basePrice', () => {
    assert.match(validatePricingInputs(-1, 0, 0), /basePrice/);
  });

  test('rejects a negative accessoriesPrice', () => {
    assert.match(validatePricingInputs(30000, -1, 0), /accessoriesPrice/);
  });

  test('rejects a discount above 100', () => {
    assert.match(validatePricingInputs(30000, 0, 150), /discountPercentage/);
  });

  test('rejects a negative discount', () => {
    assert.match(validatePricingInputs(30000, 0, -10), /discountPercentage/);
  });

  test('rejects non-finite numbers', () => {
    assert.match(validatePricingInputs(NaN, 0, 0), /basePrice/);
    assert.match(validatePricingInputs(30000, Infinity, 0), /accessoriesPrice/);
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
