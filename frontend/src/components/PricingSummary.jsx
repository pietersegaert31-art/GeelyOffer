import React from 'react'
import { formatPrice } from '../utils/api'

function PricingSummary({ pricing, tradeInValue = 0 }) {
  return (
    <div className="pricing-summary">
      <div className="price-row">
        <span className="price-label">Basisprijs</span>
        <span className="price-value">{formatPrice(pricing.basePrice)}</span>
      </div>
      {pricing.accessoriesPrice > 0 && (
        <div className="price-row">
          <span className="price-label">Opties</span>
          <span className="price-value">{formatPrice(pricing.accessoriesPrice)}</span>
        </div>
      )}
      {pricing.discountAmount > 0 && (
        <div className="price-row">
          <span className="price-label">
            {/* For a fixed discount, discountValue is the raw amount the rep typed — but
                calculatePricing (backend/src/utils/pricing.js) caps discountAmount at the
                discountable subtotal so the price can never go negative, and the two can
                disagree (e.g. a €5000 discount on a €1000 discountable base only actually
                deducts €1000). Showing the raw value here as if it were what got deducted
                would contradict the amount on the very next line, so only the percentage
                case — never capped, always exactly what was entered — gets a number here. */}
            Korting{pricing.discountType === 'fixed' ? '' : ` (${pricing.discountValue}%)`}
          </span>
          <span className="price-value price-value--discount">-{formatPrice(pricing.discountAmount)}</span>
        </div>
      )}

      <div className="price-divider" />

      <div className="price-row">
        <span className="price-label">Totaalprijs excl. BTW</span>
        <span className="price-value">{formatPrice(pricing.subtotal)}</span>
      </div>
      <div className="price-row">
        <span className="price-label">BTW (21%)</span>
        <span className="price-value">{formatPrice(pricing.vat)}</span>
      </div>
      <div className="price-row total">
        <span>Totaalprijs incl. BTW</span>
        <span>{formatPrice(pricing.total)}</span>
      </div>
      {tradeInValue > 0 && (
        <>
          <div className="price-row">
            <span className="price-label">Inruilwaarde (geschat)</span>
            <span className="price-value price-value--discount">-{formatPrice(tradeInValue)}</span>
          </div>
          <div className="price-row total">
            <span>Te betalen na inruil</span>
            <span>{formatPrice(Math.max(0, pricing.total - tradeInValue))}</span>
          </div>
        </>
      )}
      <div className="vat-note">Basisprijs en opties zijn Geely-adviesprijzen, inclusief 21% Belgische BTW.</div>
    </div>
  )
}

export default PricingSummary
