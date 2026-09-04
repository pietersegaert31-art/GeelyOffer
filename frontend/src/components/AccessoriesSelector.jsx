import React from 'react'
import { formatPrice } from '../utils/api'
import { SINGLE_SELECT_CATEGORIES } from '../utils/constants'
import { accessoryAppliesToVehicle } from '../utils/accessoryScope'

function AccessoriesSelector({ accessories, selectedAccessories, onSelectAccessory, vehicle }) {
  // Show only the options scoped to this exact trim — by whole-model name or by trim id
  // (see accessoryAppliesToVehicle / AdminAccessories.jsx's "Beschikbaar voor").
  const applicableAccessories = accessories.filter(acc => accessoryAppliesToVehicle(acc, vehicle))
  // Collapse accessories that share a name and both apply here (e.g. a mandatory "Delivery
  // Pack" that has drifted to also being "all models" alongside the model-specific one),
  // preferring the more specifically scoped row — otherwise it renders as two identical
  // locked rows and gets counted twice. Mirrors resolveMandatoryAccessories in routes/quotes.js.
  const scopeCount = a => (a.vehicleModels?.length || 0) + (a.vehicleTrims?.length || 0)
  const availableAccessories = []
  for (const acc of applicableAccessories) {
    const i = availableAccessories.findIndex(a => a.name === acc.name && a.category === acc.category)
    if (i === -1) availableAccessories.push(acc)
    else if (scopeCount(acc) && !scopeCount(availableAccessories[i])) availableAccessories[i] = acc
  }
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
