import React from 'react'
import { VEHICLE_IMAGES } from '../utils/vehicleImages'

function VehicleSelector({ vehicles, selectedModel, onSelect }) {
  // Get unique models
  const models = []
  const modelMap = {}

  vehicles.forEach(vehicle => {
    if (!modelMap[vehicle.name]) {
      modelMap[vehicle.name] = vehicle
      models.push(vehicle)
    }
  })

  return (
    <div className="vehicles-grid">
      {models.map(vehicle => {
        const comingSoon = !!vehicle.comingSoon
        return (
          <div
            key={vehicle.name}
            className={`vehicle-card ${selectedModel === vehicle.name ? 'selected' : ''} ${comingSoon ? 'coming-soon' : ''}`}
            onClick={() => { if (!comingSoon) onSelect(vehicle.name) }}
            title={comingSoon ? 'Binnenkort beschikbaar — nog geen prijzen of opties' : undefined}
          >
            {VEHICLE_IMAGES[vehicle.name] ? (
              <div className="vehicle-image">
                <img src={VEHICLE_IMAGES[vehicle.name]} alt={vehicle.name} />
              </div>
            ) : (
              <div className="vehicle-image-placeholder">{comingSoon ? 'Coming soon' : vehicle.name}</div>
            )}
            <div className="vehicle-info">
              <div className="vehicle-caption">Geely</div>
              <div className="vehicle-name">{vehicle.name}</div>
              {comingSoon ? (
                <div className="vehicle-spec">Binnenkort beschikbaar — nog geen prijzen of opties</div>
              ) : (
                <div className="vehicle-badges">
                  <span className="vehicle-badge">{vehicle.fuel}</span>
                  <span className="vehicle-badge">{vehicle.power} pk</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default VehicleSelector
