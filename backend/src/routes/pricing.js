import express from 'express';
import { calculatePricing, getDiscountTier, validatePricingInputs } from '../utils/pricing.js';
import { requireAuth, blockPendingPasswordChange } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, blockPendingPasswordChange);

// Calculate pricing
router.post('/calculate', (req, res) => {
  try {
    const { basePrice, accessoriesPrice = 0, discountType = 'percentage', discountValue = 0, mandatoryAccessoriesPrice = 0 } = req.body;

    if (!basePrice) {
      return res.status(400).json({ error: 'Base price is required' });
    }

    const validationError = validatePricingInputs(basePrice, accessoriesPrice, discountType, discountValue);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const pricing = calculatePricing(basePrice, accessoriesPrice, discountType, discountValue, mandatoryAccessoriesPrice);
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
