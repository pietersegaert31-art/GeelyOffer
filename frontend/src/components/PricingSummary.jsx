import React from 'react'
import { formatPrice, calculateMonthlyPayment } from '../utils/api'

function PricingSummary({ pricing, tradeInValue = 0, financing = null }) {
  const financingPrincipal = Math.max(0, pricing.total - tradeInValue)

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

      {financing && financing.terms.length > 0 && (
        <div className="financing-preview">
          <div className="financing-preview-title">Financieringssimulatie</div>
          <div className="financing-preview-terms">
            {financing.terms.map((term) => (
              <div key={term} className="financing-preview-term">
                <span className="financing-preview-amount">
                  {formatPrice(calculateMonthlyPayment(financingPrincipal, financing.annualRatePercent, term))}
                </span>
                <span className="financing-preview-label">per maand · {term} mnd</span>
              </div>
            ))}
          </div>
          <div className="vat-note">
            Indicatieve schatting o.b.v. {financing.annualRatePercent}% jaarrente, geen bindend aanbod.
            Neem contact op met onze financieringspartner voor een persoonlijk voorstel.
          </div>
        </div>
      )}
    </div>
  )
}

export default PricingSummary
