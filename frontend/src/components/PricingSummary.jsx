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
            Korting ({pricing.discountType === 'fixed' ? formatPrice(pricing.discountValue) : `${pricing.discountValue}%`})
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
