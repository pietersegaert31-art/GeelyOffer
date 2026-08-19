import React from 'react'
import { formatPrice } from '../utils/api'
import { SINGLE_SELECT_CATEGORIES } from '../utils/constants'

function AccessoriesSelector({ accessories, selectedAccessories, onSelectAccessory, vehicleModel }) {
  const availableAccessories = accessories.filter(
    acc => !acc.vehicleModels || acc.vehicleModels.includes(vehicleModel)
  )
  const categories = [...new Set(availableAccessories.map(a => a.category))]

  return (
    <div className="option-list">
      {categories.map(category => {
        const isSingleSelect = SINGLE_SELECT_CATEGORIES.includes(category)
        return (
          <div key={category} className="option-category">
            <h4 className="option-category-title">
              {category.charAt(0).toUpperCase() + category.slice(1)}
              {isSingleSelect && <span className="option-category-hint"> — kies max. 1</span>}
            </h4>
            <div className="option-category-list">
              {availableAccessories
                .filter(acc => acc.category === category)
                .map(acc => {
                  // Mandatory accessories (e.g. the delivery pack) are always included and
                  // can't be unchecked — shown as a locked, always-selected row instead of
                  // an interactive one so it's clear it's not optional.
                  const selected = acc.mandatory || selectedAccessories.some(a => a.id === acc.id)

                  return (
                    <label
                      key={acc.id}
                      className={`option-item ${selected ? 'selected' : ''} ${acc.mandatory ? 'option-item-locked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={acc.mandatory}
                        onChange={() => onSelectAccessory(acc)}
                      />
                      {acc.colorHex && (
                        <span className="option-color-swatch" style={{ backgroundColor: acc.colorHex }} title={acc.colorHex} />
                      )}
                      <div className="option-copy">
                        <div className="option-title">{acc.name}</div>
                        {acc.mandatory && <div className="option-mandatory-note">Altijd inbegrepen</div>}
                      </div>
                      <div className="option-price">{formatPrice(acc.price)}</div>
                    </label>
                  )
                })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default AccessoriesSelector
