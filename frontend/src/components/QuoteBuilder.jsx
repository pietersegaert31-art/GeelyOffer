import React, { useState, useEffect } from 'react'
import { api, formatPrice } from '../utils/api'
import {
  DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS,
  DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE, DISCOUNT_APPROVAL_THRESHOLD_FIXED,
} from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import VehicleSelector from './VehicleSelector'
import VariantSelector from './VariantSelector'
import AccessoriesSelector from './AccessoriesSelector'
import PricingSummary from './PricingSummary'
import CustomerForm from './CustomerForm'

function needsApprovalWarning(discountType, discountValue, role) {
  if (['admin', 'sales_manager'].includes(role)) return false
  return discountType === 'fixed'
    ? discountValue > DISCOUNT_APPROVAL_THRESHOLD_FIXED
    : discountValue > DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE
}

function QuoteBuilder({ onQuoteCreated }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [vehicles, setVehicles] = useState([])
  const [accessories, setAccessories] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [selectedAccessories, setSelectedAccessories] = useState([])
  const [discountType, setDiscountType] = useState('percentage')
  const [discountValue, setDiscountValue] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [pricing, setPricing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customerInfo, setCustomerInfo] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerCompany: '',
    notes: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedVariant) {
      calculatePricing()
    }
  }, [selectedVariant, selectedAccessories, discountType, discountValue])

  const loadData = async () => {
    try {
      setLoading(true)
      const [vehiclesData, accessoriesData] = await Promise.all([
        api.getVehicles(),
        api.getAccessories()
      ])
      setVehicles(vehiclesData)
      setAccessories(accessoriesData)
    } catch (err) {
      setError('Failed to load data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const calculatePricing = async () => {
    if (!selectedVariant) return

    try {
      const accessoriesTotal = selectedAccessories.reduce((sum, acc) => sum + acc.price, 0)
      const pricingData = await api.calculatePricing(
        selectedVariant.basePrice,
        accessoriesTotal,
        discountType,
        discountValue
      )
      setPricing(pricingData)
    } catch (err) {
      setError('Failed to calculate pricing: ' + err.message)
    }
  }

  const getDiscountTierPreview = (qty) => {
    if (qty >= 10) return 15
    if (qty >= 5) return 10
    if (qty >= 3) return 5
    return 0
  }

  const applyVolumeDiscount = async () => {
    try {
      const tier = await api.getDiscountTier(quantity)
      setDiscountType('percentage')
      setDiscountValue(tier.discountPercentage)
    } catch (err) {
      setError('Failed to fetch volume discount: ' + err.message)
    }
  }

  const handleCreateQuote = async () => {
    if (!customerInfo.customerName) {
      setError('Please enter customer name')
      setStep(4)
      return
    }

    try {
      setLoading(true)
      const quoteData = {
        ...customerInfo,
        selectedVehicleId: selectedVariant.id,
        configuration: {
          vehicleName: selectedVariant.name,
          vehicleModel: selectedVariant.model,
        },
        accessories: selectedAccessories,
        discountType,
        discountValue
      }

      await api.createQuote(quoteData)
      setError('')
      alert('Offerte succesvol aangemaakt!')
      onQuoteCreated()
    } catch (err) {
      setError('Failed to create quote: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading && vehicles.length === 0) {
    return <div className="loading"><div className="spinner" /></div>
  }

  return (
    <div className="page-shell">
      {error && <div className="error">{error}</div>}

      <div className="stepper" aria-label="Quote steps">
        {[
          'Model',
          'Uitvoering',
          'Opties',
          'Klantgegevens'
        ].map((label, index) => (
          <div key={label} className={`step-item ${step === index + 1 ? 'active' : ''}`}>
            <div className="step-number">{index + 1}</div>
            <div className="step-name">{label}</div>
          </div>
        ))}
      </div>

      <div className="builder-shell">
        <div className="builder-main">
          {step === 1 && (
            <div>
              <div className="card">
                <div className="section-kicker">Stap 1</div>
                <h2 className="section-title">Kies je model</h2>
                <VehicleSelector
                  vehicles={vehicles}
                  selectedModel={selectedModel}
                  onSelect={(model) => {
                    setSelectedModel(model)
                    setSelectedVariant(null)
                    setSelectedAccessories([])
                    setDiscountType('percentage')
                    setDiscountValue(0)
                    setQuantity(1)
                    setPricing(null)
                  }}
                />
              </div>

              <div className="card">
                <div className="section-kicker">Navigatie</div>
                <div className="btn-group">
                  <button
                    className="btn btn-primary"
                    onClick={() => setStep(2)}
                    disabled={!selectedModel}
                  >
                    Ga verder →
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && selectedModel && (
            <div>
              <div className="card">
                <div className="section-kicker">Stap 2</div>
                <h2 className="section-title">Kies je uitvoering</h2>
                <VariantSelector
                  vehicles={vehicles}
                  selectedModel={selectedModel}
                  selectedVariant={selectedVariant}
                  onSelect={setSelectedVariant}
                />
              </div>

              <div className="card">
                <div className="section-kicker">Navigatie</div>
                <div className="btn-group">
                  <button className="btn btn-outline" onClick={() => setStep(1)}>
                    ← Terug naar model
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => setStep(3)}
                    disabled={!selectedVariant}
                  >
                    Ga verder →
                  </button>
                </div>
              </div>

              {selectedVariant && pricing && (
                <div className="card">
                  <div className="section-kicker">Basisprijs</div>
                  <PricingSummary pricing={pricing} />
                </div>
              )}
            </div>
          )}

          {step === 3 && selectedVariant && (
            <div>
              <div className="card">
                <div className="section-kicker">Stap 3</div>
                <h2 className="section-title">Opties en accessoires</h2>
                <AccessoriesSelector
                  accessories={accessories}
                  selectedAccessories={selectedAccessories}
                  vehicleModel={selectedModel}
                  onSelectAccessory={(acc) => {
                    if (selectedAccessories.find(a => a.id === acc.id)) {
                      setSelectedAccessories(selectedAccessories.filter(a => a.id !== acc.id))
                    } else {
                      setSelectedAccessories([...selectedAccessories, acc])
                    }
                  }}
                />
              </div>

              <div className="card">
                <div className="section-kicker">Korting</div>
                <div className="form-row">
                  <div className="form-group" style={{ maxWidth: '220px' }}>
                    <label>Aantal voertuigen</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                  </div>
                  <div className="form-group" style={{ maxWidth: '220px' }}>
                    <label>Type korting</label>
                    <select value={discountType} onChange={(e) => { setDiscountType(e.target.value); setDiscountValue(0) }}>
                      {DISCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>{DISCOUNT_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: '16px' }}>
                  <div className="form-group" style={{ maxWidth: '220px' }}>
                    <label>{discountType === 'fixed' ? 'Korting (€)' : 'Korting (%)'}</label>
                    <input
                      type="number"
                      min="0"
                      max={discountType === 'percentage' ? 100 : undefined}
                      step={discountType === 'percentage' ? 0.5 : 1}
                      value={discountValue}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0
                        setDiscountValue(discountType === 'percentage' ? Math.min(100, Math.max(0, raw)) : Math.max(0, raw))
                      }}
                    />
                  </div>
                </div>
                {needsApprovalWarning(discountType, discountValue, user.role) && (
                  <p style={{ color: 'var(--warning)', fontSize: '0.85rem', fontWeight: 600, marginTop: '4px' }}>
                    ⚠ Deze korting is groter dan gebruikelijk en vereist goedkeuring van een sales manager voordat de offerte verzonden of geaccepteerd kan worden.
                  </p>
                )}
                <div className="btn-group">
                  <button
                    className="btn btn-outline"
                    onClick={applyVolumeDiscount}
                    disabled={quantity < 3}
                    title={quantity < 3 ? 'Volumekorting geldt vanaf 3 voertuigen' : ''}
                  >
                    Volumekorting toepassen ({getDiscountTierPreview(quantity)}%)
                  </button>
                </div>
              </div>

              {pricing && (
                <div className="card">
                  <div className="section-kicker">Samenvatting</div>
                  <PricingSummary pricing={pricing} />
                </div>
              )}

              <div className="card">
                <div className="section-kicker">Navigatie</div>
                <div className="btn-group">
                  <button className="btn btn-outline" onClick={() => setStep(2)}>
                    ← Terug naar uitvoering
                  </button>
                  <button className="btn btn-primary" onClick={() => setStep(4)} disabled={!selectedVariant || !pricing}>
                    Ga verder →
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && selectedVariant && (
            <div>
              <div className="card">
                <div className="section-kicker">Stap 4</div>
                <h2 className="section-title">Klantgegevens</h2>
                <CustomerForm
                  customerInfo={customerInfo}
                  onChange={setCustomerInfo}
                />
              </div>

              {pricing && (
                <div className="card">
                  <div className="section-kicker">Offerte</div>
                  <h3 className="section-title">Overzicht</h3>
                  <div style={{ marginBottom: '18px' }}>
                    <p><strong>Model:</strong> {selectedVariant.name} {selectedVariant.model}</p>
                    {selectedAccessories.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <strong>Geselecteerde opties:</strong>
                        <ul style={{ margin: '10px 0 0 18px' }}>
                          {selectedAccessories.map(acc => (
                            <li key={acc.id}>{acc.name} — {formatPrice(acc.price)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <PricingSummary pricing={pricing} />
                </div>
              )}

              <div className="card">
                <div className="section-kicker">Navigatie</div>
                <div className="btn-group">
                  <button className="btn btn-outline" onClick={() => setStep(3)}>
                    ← Terug naar opties
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleCreateQuote}
                    disabled={loading || !customerInfo.customerName}
                  >
                    {loading ? 'Aanmaken...' : 'Offerte aanmaken'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {pricing && selectedVariant && (
          <aside className="builder-side">
            <div className="card summary-card">
              <div className="section-kicker">Actuele offerte</div>
              <h3 className="section-title" style={{ marginBottom: '12px' }}>{selectedVariant.name}</h3>
              <div className="summary-row">
                <span>Uitvoering</span>
                <strong>{selectedVariant.model}</strong>
              </div>
              <div className="summary-row">
                <span>Basisprijs</span>
                <strong>{formatPrice(selectedVariant.basePrice)}</strong>
              </div>
              {selectedAccessories.length > 0 && (
                <div className="summary-row">
                  <span>Opties</span>
                  <strong>{formatPrice(selectedAccessories.reduce((sum, acc) => sum + acc.price, 0))}</strong>
                </div>
              )}
              {discountValue > 0 && (
                <div className="summary-row">
                  <span>Korting</span>
                  <strong>{discountType === 'fixed' ? formatPrice(discountValue) : `${discountValue}%`}</strong>
                </div>
              )}
              <div className="summary-total">
                <span>Totaal incl. BTW</span>
                <span>{formatPrice(pricing.total)}</span>
              </div>
              <div className="summary-total-note">
                <span>Totaal excl. BTW</span>
                <span>{formatPrice(pricing.subtotal)}</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

export default QuoteBuilder
