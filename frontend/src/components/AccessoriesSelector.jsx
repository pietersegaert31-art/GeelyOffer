import React from 'react'
import { formatPrice } from '../utils/api'

function AccessoriesSelector({ accessories, selectedAccessories, onSelectAccessory, vehicleModel }) {
  const availableAccessories = accessories.filter(
    acc => !acc.vehicleModels || acc.vehicleModels.includes(vehicleModel)
  )
  const categories = [...new Set(availableAccessories.map(a => a.category))]

  return (
    <div className="option-list">
      {categories.map(category => (
        <div key={category} className="option-category">
          <h4 className="option-category-title">
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </h4>
          <div className="option-category-list">
            {availableAccessories
              .filter(acc => acc.category === category)
              .map(acc => {
                const selected = selectedAccessories.some(a => a.id === acc.id)

                return (
                  <label
                    key={acc.id}
                    className={`option-item ${selected ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onSelectAccessory(acc)}
                    />
                    <div className="option-copy">
                      <div className="option-title">{acc.name}</div>
                    </div>
                    <div className="option-price">{formatPrice(acc.price)}</div>
                  </label>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default AccessoriesSelector
