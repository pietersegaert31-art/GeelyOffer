import express from 'express';
import { calculatePricing, getDiscountTier, validatePricingInputs } from '../utils/pricing.js';
import { requireAuth, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

// Calculate pricing
router.post('/calculate', (req, res) => {
  try {
    const { basePrice, accessoriesPrice = 0, discountType = 'percentage', discountValue = 0, nonDiscountableAccessoriesPrice = 0 } = req.body;

    // validatePricingInputs already requires a finite, non-negative basePrice below — no
    // separate `!basePrice` pre-check here, since that would also reject a legitimate
    // basePrice of 0 (falsy but valid), unlike every other entry point into this same
    // validation (e.g. routes/quotes.js has no such extra guard).
    const validationError = validatePricingInputs(basePrice, accessoriesPrice, discountType, discountValue);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const pricing = calculatePricing(basePrice, accessoriesPrice, discountType, discountValue, nonDiscountableAccessoriesPrice);
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get discount tier based on quantity
router.get('/discount-tier/:quantity', (req, res) => {
  try {
    const quantity = parseInt(req.params.quantity, 10);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative integer' });
    }
    const discount = getDiscountTier(quantity);
    res.json({ quantity, discountPercentage: discount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
