import React from 'react'
import { formatPrice } from '../utils/api'
import { SINGLE_SELECT_CATEGORIES } from '../utils/constants'

function AccessoriesSelector({ accessories, selectedAccessories, onSelectAccessory, vehicleModel }) {
  // The API always returns vehicleModels as an array (never null/undefined — see
  // toPublicAccessory in routes/accessories.js), so `!acc.vehicleModels` never actually
  // catches the "applies to every model" case (an empty array, shown as "Alle modellen" in
  // AdminAccessories.jsx) — it has to be checked by length, the same way InventoryPage.jsx
  // already does it correctly. Without this, a universal accessory was never selectable
  // here for any vehicle.
  const applicableAccessories = accessories.filter(
    acc => !acc.vehicleModels?.length || acc.vehicleModels.includes(vehicleModel)
  )
  // Collapse accessories that share a name and both apply here (e.g. a mandatory "Delivery
  // Pack" that has drifted to also being "all models" alongside the model-specific one),
  // preferring the model-specific row — otherwise it renders as two identical locked rows
  // and gets counted twice. Mirrors resolveMandatoryAccessories in routes/quotes.js.
  const availableAccessories = []
  for (const acc of applicableAccessories) {
    const i = availableAccessories.findIndex(a => a.name === acc.name && a.category === acc.category)
    if (i === -1) availableAccessories.push(acc)
    else if (acc.vehicleModels?.length && !availableAccessories[i].vehicleModels?.length) availableAccessories[i] = acc
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
