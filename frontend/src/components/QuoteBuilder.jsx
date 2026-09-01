import React, { useState, useEffect } from 'react'
import { api, formatPrice, exclVat } from '../utils/api'
import {
  DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS,
  DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE, DISCOUNT_APPROVAL_THRESHOLD_FIXED,
  SINGLE_SELECT_CATEGORIES,
} from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import VehicleSelector from './VehicleSelector'
import VariantSelector from './VariantSelector'
import AccessoriesSelector from './AccessoriesSelector'
import PricingSummary from './PricingSummary'
import CustomerForm from './CustomerForm'
import TradeInForm from './TradeInForm'
import { VEHICLE_IMAGES, VEHICLE_COLOR_FRONT_IMAGES, VEHICLE_REAR_IMAGES, VEHICLE_INTERIOR_IMAGES } from '../utils/vehicleImages'

function needsApprovalWarning(discountType, discountValue, role) {
  if (['admin', 'sales_manager'].includes(role)) return false
  return discountType === 'fixed'
    ? discountValue > DISCOUNT_APPROVAL_THRESHOLD_FIXED
    : discountValue > DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE
}

// Naam, e-mail, telefoon en volledig adres are always required; a "bedrijf" customer
// additionally needs a company name and VAT number — so the offer always carries
// everything needed to actually contact and (for a company) invoice the customer.
function isCustomerInfoComplete(info) {
  const base = info.customerName && info.customerEmail && info.customerPhone
    && info.customerStreet && info.customerPostalCode && info.customerCity
  if (!base) return false
  if (info.customerType === 'bedrijf') {
    return Boolean(info.customerCompany && info.customerVatNumber)
  }
  return true
}

// Known specification keys, in display order — label lookup with a fallback to the
// raw key so an unrecognized future spec still shows up instead of silently vanishing.
const SPEC_LABELS = {
  battery: 'Batterij',
  range: 'Actieradius',
  evRange: 'Elektrische actieradius',
  totalRange: 'Totale actieradius',
  charger: 'Laden',
  wheels: 'Wielen',
}
const SPEC_KEY_ORDER = ['battery', 'range', 'evRange', 'totalRange', 'charger', 'wheels']

function parseSpecs(vehicle) {
  try {
    return JSON.parse(vehicle.specifications || '{}')
  } catch {
    return {}
  }
}

// Builds the row list for the variant-comparison card — cheapest to priciest. Only rows
// that actually differ between variants are kept — trims of the same model often share
// power/torque/charging, and listing those as if they were differences would defeat the
// point of a "what's different" view. Price is handled separately (always shown, never
// filtered), since it must never be mistaken for an optional/omittable spec row.
function buildComparisonRows(variants) {
  const candidateRows = []

  if (variants.some((v) => v.power)) {
    candidateRows.push({ label: 'Vermogen', values: variants.map((v) => (v.power ? `${v.power} pk` : '—')) })
  }
  if (variants.some((v) => v.torque)) {
    candidateRows.push({ label: 'Koppel', values: variants.map((v) => (v.torque ? `${v.torque} Nm` : '—')) })
  }
  if (variants.some((v) => v.consumption)) {
    candidateRows.push({
      label: 'Verbruik',
      values: variants.map((v) => (v.consumption ? `${v.consumption} ${v.fuel === 'Elektrisch' ? 'kWh' : 'L'}/100km` : '—')),
    })
  }

  const specs = variants.map(parseSpecs)
  SPEC_KEY_ORDER.filter((key) => specs.some((s) => s[key])).forEach((key) => {
    candidateRows.push({ label: SPEC_LABELS[key], values: specs.map((s) => s[key] || '—') })
  })

  return candidateRows.filter((row) => new Set(row.values).size > 1)
}

function QuoteBuilder({ onQuoteCreated }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  // Each step is a full new screen of content — jump back to the top so the customer
  // doesn't land mid-page (e.g. scrolled down while picking accessories) on the next step.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])
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
    customerType: 'particulier',
    customerCompany: '',
    customerVatNumber: '',
    customerStreet: '',
    customerPostalCode: '',
    customerCity: '',
    notes: '',
    language: 'nl'
  })
  const [tradeIn, setTradeIn] = useState({
    tradeInEnabled: false,
    tradeInMake: '',
    tradeInModel: '',
    tradeInYear: '',
    tradeInMileage: '',
    tradeInValue: 0,
  })
  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedVariant) {
      calculatePricing()
    }
  }, [selectedVariant, selectedAccessories, discountType, discountValue])

  // Mandatory accessories (e.g. the delivery pack) are always part of the quote — add
  // any that apply to the selected model and aren't already in the list, so the live
  // price preview and the step 4 overview both reflect them without the user having to
  // do anything. The backend also injects these independently on save, so this is about
  // an accurate live preview, not the source of truth for what actually gets billed.
  useEffect(() => {
    if (!selectedModel || accessories.length === 0) return
    const mandatory = accessories.filter((a) => a.mandatory && a.vehicleModels?.includes(selectedModel))
    if (mandatory.length === 0) return
    setSelectedAccessories((prev) => {
      const missing = mandatory.filter((m) => !prev.some((p) => p.id === m.id))
      return missing.length ? [...prev, ...missing] : prev
    })
  }, [selectedModel, accessories])

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
      const nonDiscountableAccessoriesTotal = selectedAccessories.filter((acc) => !acc.discountable).reduce((sum, acc) => sum + acc.price, 0)
      const pricingData = await api.calculatePricing(
        selectedVariant.basePrice,
        accessoriesTotal,
        discountType,
        discountValue,
        nonDiscountableAccessoriesTotal
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
    if (!isCustomerInfoComplete(customerInfo)) {
      setError('Vul alle verplichte klantgegevens in')
      setStep(4)
      return
    }

    try {
      setLoading(true)
      const quoteData = {
        ...customerInfo,
        ...tradeIn,
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

  // Live photo preview for the sidebar summary — swaps to the real photo of whichever
  // paint color the customer has picked (falling back to the model's default photo for
  // colors Geely hasn't photographed yet, or before any color is chosen). The rear photo
  // is fixed per model rather than per color — see VEHICLE_REAR_IMAGES in
  // utils/vehicleImages.js for why.
  const selectedColorAccessory = selectedAccessories.find((acc) => acc.category === 'exterior')
  const previewFrontImage = (selectedColorAccessory && VEHICLE_COLOR_FRONT_IMAGES[selectedColorAccessory.name])
    || (selectedVariant && VEHICLE_IMAGES[selectedVariant.name])
  const previewRearImage = selectedVariant && VEHICLE_REAR_IMAGES[selectedVariant.name]
  const previewInteriorImage = selectedVariant && VEHICLE_INTERIOR_IMAGES[selectedVariant.name]

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
                    if (acc.mandatory) return
                    const alreadySelected = selectedAccessories.find(a => a.id === acc.id)
                    if (alreadySelected) {
                      setSelectedAccessories(selectedAccessories.filter(a => a.id !== acc.id))
                    } else if (SINGLE_SELECT_CATEGORIES.includes(acc.category)) {
                      // Only one option per single-select category (e.g. paint color) —
                      // picking a new one replaces whatever was selected in that category.
                      setSelectedAccessories([...selectedAccessories.filter(a => a.category !== acc.category), acc])
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

              <div className="card">
                <div className="section-kicker">Optioneel</div>
                <h2 className="section-title">Inruilwagen</h2>
                <TradeInForm tradeIn={tradeIn} onChange={setTradeIn} />
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
                  <PricingSummary pricing={pricing} tradeInValue={tradeIn.tradeInEnabled ? tradeIn.tradeInValue : 0} />
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
                    disabled={loading || !isCustomerInfoComplete(customerInfo)}
                  >
                    {loading ? 'Aanmaken...' : 'Offerte aanmaken'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {((pricing && selectedVariant) || (step === 2 && selectedModel)) && (
          <aside className="builder-side">
            {pricing && selectedVariant && (
              <div className="card summary-card">
                <div className="section-kicker">Actuele offerte</div>
                <h3 className="section-title" style={{ marginBottom: '12px' }}>{selectedVariant.name}</h3>
                {previewFrontImage && (
                  <div className="vehicle-color-preview">
                    <div className="vehicle-color-preview-image">
                      <img src={previewFrontImage} alt={`${selectedVariant.name}${selectedColorAccessory ? ` — ${selectedColorAccessory.name.replace('Metallic: ', '')}` : ''}`} />
                    </div>
                    {previewRearImage && (
                      <div className="vehicle-color-preview-image vehicle-color-preview-secondary">
                        <img src={previewRearImage} alt={`${selectedVariant.name} — achteraanzicht`} />
                        <span className="vehicle-color-preview-caption">Referentiebeeld — kleur op deze hoek kan afwijken van uw keuze</span>
                      </div>
                    )}
                    {previewInteriorImage && (
                      <div className="vehicle-color-preview-image vehicle-color-preview-secondary">
                        <img src={previewInteriorImage} alt={`${selectedVariant.name} — interieur`} />
                      </div>
                    )}
                  </div>
                )}
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
            )}

            {step === 2 && selectedModel && (() => {
              const variants = vehicles
                .filter((v) => v.name === selectedModel)
                .sort((a, b) => a.basePrice - b.basePrice)
              if (variants.length < 2) return null
              const rows = buildComparisonRows(variants)
              return (
                <div className="card">
                  <div className="section-kicker">Vergelijken</div>
                  <h3 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '12px' }}>Verschil per uitvoering</h3>
                  <div className="compare-stack">
                    {variants.map((v, i) => (
                      <div key={v.id} className={`compare-variant ${selectedVariant?.id === v.id ? 'compare-variant-active' : ''}`}>
                        <div className="compare-variant-name">{v.model}</div>
                        <div className="compare-variant-price">
                          <span className="compare-price-label">Basisprijs incl. BTW</span>
                          <strong className="compare-price-value">{formatPrice(v.basePrice)}</strong>
                        </div>
                        <div className="compare-variant-price compare-variant-price-excl">
                          <span className="compare-price-label">Basisprijs excl. BTW</span>
                          <strong className="compare-price-value">{formatPrice(exclVat(v.basePrice))}</strong>
                        </div>
                        {rows.length > 0 && (
                          <ul className="compare-variant-specs">
                            {rows.map((row) => (
                              <li key={row.label}>
                                <span>{row.label}</span>
                                <strong>{row.values[i]}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </aside>
        )}
      </div>
    </div>
  )
}

export default QuoteBuilder
