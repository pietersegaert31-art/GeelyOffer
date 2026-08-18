import React from 'react'
import { formatPrice, exclVat } from '../utils/api'
import geelyE5 from '../assets/vehicles/geely-e5.jpg'
import starrayEmi from '../assets/vehicles/starray-emi.jpg'

const VEHICLE_IMAGES = {
  'Geely E5': geelyE5,
  'Starray EM-i': starrayEmi,
}

// Same fallback chain as the PDF cover page (backend/src/routes/pdf.js) so the range
// shown here always matches what ends up on the actual offer.
function rangeValue(variant) {
  let specs = {}
  try {
    specs = JSON.parse(variant.specifications || '{}')
  } catch {
    specs = {}
  }
  return specs.range || specs.totalRange || specs.evRange || null
}

function VariantSelector({ vehicles, selectedModel, selectedVariant, onSelect }) {
  // Filter vehicles for selected model
  const variants = vehicles.filter(v => v.name === selectedModel)

  return (
    <div className="vehicles-grid">
      {variants.map(variant => (
        <div
          key={variant.id}
          className={`vehicle-card ${selectedVariant?.id === variant.id ? 'selected' : ''}`}
          onClick={() => onSelect(variant)}
        >
          <div className="vehicle-image">
            <img src={VEHICLE_IMAGES[variant.name]} alt={`${variant.name} ${variant.model}`} />
          </div>
          <div className="vehicle-info">
            <div className="vehicle-caption">Geely</div>
            <div className="vehicle-name">{variant.model}</div>
            <div className="vehicle-badges">
              <span className="vehicle-badge">{variant.fuel}</span>
              {rangeValue(variant) && <span className="vehicle-badge">Actieradius {rangeValue(variant)}</span>}
              {variant.power && <span className="vehicle-badge">{variant.power} pk</span>}
            </div>
            <div className="vehicle-price">Incl. BTW: {formatPrice(variant.basePrice)}</div>
            <div className="vehicle-price-excl">Excl. BTW: {formatPrice(exclVat(variant.basePrice))}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default VariantSelector
