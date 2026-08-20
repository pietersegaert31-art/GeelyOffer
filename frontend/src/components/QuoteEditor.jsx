import React, { useEffect, useState } from 'react'
import { api } from '../utils/api'
import {
  QUOTE_STATUSES, STATUS_LABELS, DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS,
  DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE, DISCOUNT_APPROVAL_THRESHOLD_FIXED,
  DISCOUNT_APPROVAL_STATUS_LABELS, DISCOUNT_APPROVAL_BADGE_CLASS,
  SINGLE_SELECT_CATEGORIES,
} from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import CustomerForm from './CustomerForm'
import TradeInForm from './TradeInForm'
import AccessoriesSelector from './AccessoriesSelector'
import PricingSummary from './PricingSummary'

function needsApprovalWarning(discountType, discountValue, role) {
  if (['admin', 'sales_manager'].includes(role)) return false
  return discountType === 'fixed'
    ? discountValue > DISCOUNT_APPROVAL_THRESHOLD_FIXED
    : discountValue > DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE
}

// Naam, e-mail, telefoon en volledig adres are always required; a "bedrijf" customer
// additionally needs a company name and VAT number.
function isCustomerInfoComplete(info) {
  const base = info.customerName && info.customerEmail && info.customerPhone
    && info.customerStreet && info.customerPostalCode && info.customerCity
  if (!base) return false
  if (info.customerType === 'bedrijf') {
    return Boolean(info.customerCompany && info.customerVatNumber)
  }
  return true
}

function QuoteEditor({ quoteId, onClose, onSaved }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [vehicle, setVehicle] = useState(null)
  const [accessoriesCatalog, setAccessoriesCatalog] = useState([])
  const [selectedAccessories, setSelectedAccessories] = useState([])
  const [discountType, setDiscountType] = useState('percentage')
  const [discountValue, setDiscountValue] = useState(0)
  const [discountApprovalStatus, setDiscountApprovalStatus] = useState('not_required')
  const [status, setStatus] = useState('draft')
  const [customerInfo, setCustomerInfo] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    customerType: 'particulier', customerCompany: '', customerVatNumber: '',
    customerStreet: '', customerPostalCode: '', customerCity: '', notes: '', language: 'nl',
  })
  const [tradeIn, setTradeIn] = useState({
    tradeInEnabled: false, tradeInMake: '', tradeInModel: '',
    tradeInYear: '', tradeInMileage: '', tradeInValue: 0,
  })
  const [pricing, setPricing] = useState(null)
  const [financing, setFinancing] = useState(null)

  useEffect(() => {
    api.getFinancingSettings().then(setFinancing).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const [quote, catalog] = await Promise.all([api.getQuote(quoteId), api.getAccessories()])
        if (cancelled) return

        const vehicleData = await api.getVehicle(quote.selectedVehicleId)
        if (cancelled) return

        setVehicle(vehicleData)
        setAccessoriesCatalog(catalog)
        // Matching by name alone isn't safe: two accessories for different vehicles can
        // share a name (e.g. "Delivery Pack" exists once per model), so without the
        // vehicle-applicability check below, opening any quote would also silently pick
        // up the OTHER model's same-named accessory — invisible in the UI (which only
        // ever displays options for this vehicle) but included in what gets saved.
        setSelectedAccessories(
          catalog.filter((acc) =>
            (!acc.vehicleModels || acc.vehicleModels.includes(vehicleData.name)) &&
            quote.items?.some((item) => item.itemName === acc.name)
          )
        )
        setDiscountType(quote.discountType || 'percentage')
        setDiscountValue((quote.discountType === 'fixed' ? quote.discountEuro : quote.discountPercentage) || 0)
        setDiscountApprovalStatus(quote.discountApprovalStatus || 'not_required')
        setStatus(quote.status || 'draft')
        setCustomerInfo({
          customerName: quote.customerName || '',
          customerEmail: quote.customerEmail || '',
          customerPhone: quote.customerPhone || '',
          customerType: quote.customerType || 'particulier',
          customerCompany: quote.customerCompany || '',
          customerVatNumber: quote.customerVatNumber || '',
          customerStreet: quote.customerStreet || '',
          customerPostalCode: quote.customerPostalCode || '',
          customerCity: quote.customerCity || '',
          notes: quote.notes || '',
          language: quote.language || 'nl',
        })
        setTradeIn({
          tradeInEnabled: !!quote.tradeInEnabled,
          tradeInMake: quote.tradeInMake || '',
          tradeInModel: quote.tradeInModel || '',
          tradeInYear: quote.tradeInYear || '',
          tradeInMileage: quote.tradeInMileage || '',
          tradeInValue: quote.tradeInValue || 0,
        })
      } catch (err) {
        if (!cancelled) setError('Kon offerte niet laden: ' + err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [quoteId])

  useEffect(() => {
    if (!vehicle) return
    const accessoriesTotal = selectedAccessories.reduce((sum, acc) => sum + acc.price, 0)
    const nonDiscountableAccessoriesTotal = selectedAccessories.filter((acc) => !acc.discountable).reduce((sum, acc) => sum + acc.price, 0)
    api.calculatePricing(vehicle.basePrice, accessoriesTotal, discountType, discountValue, nonDiscountableAccessoriesTotal)
      .then(setPricing)
      .catch((err) => setError('Kon prijs niet berekenen: ' + err.message))
  }, [vehicle, selectedAccessories, discountType, discountValue])

  // Same reasoning as QuoteBuilder.jsx: keeps the live preview accurate for a quote that
  // predates this feature (or was edited before the mandatory item existed). The backend
  // injects it independently on save regardless of what's sent here.
  useEffect(() => {
    if (!vehicle || accessoriesCatalog.length === 0) return
    const mandatory = accessoriesCatalog.filter((a) => a.mandatory && a.vehicleModels?.includes(vehicle.name))
    if (mandatory.length === 0) return
    setSelectedAccessories((prev) => {
      const missing = mandatory.filter((m) => !prev.some((p) => p.id === m.id))
      return missing.length ? [...prev, ...missing] : prev
    })
  }, [vehicle, accessoriesCatalog])

  const handleSave = async () => {
    if (!isCustomerInfoComplete(customerInfo)) {
      setError('Vul alle verplichte klantgegevens in')
      return
    }
    try {
      setSaving(true)
      setError('')
      await api.updateQuote(quoteId, {
        ...customerInfo,
        ...tradeIn,
        discountType,
        discountValue,
        accessories: selectedAccessories,
        status,
      })
      onSaved()
    } catch (err) {
      setError('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="section-kicker">Offerte bewerken</div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              {vehicle ? `${vehicle.name} ${vehicle.model}` : '...'}
            </h2>
          </div>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <div className="loading" style={{ minHeight: '200px' }}><div className="spinner" /></div>
        ) : (
          <div className="modal-body">
            <div className="modal-main">
              <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Klantgegevens</h3>
              <CustomerForm customerInfo={customerInfo} onChange={setCustomerInfo} excludeId={quoteId} />

              <h3 className="section-title" style={{ fontSize: '1.1rem', marginTop: '20px' }}>Inruilwagen</h3>
              <TradeInForm tradeIn={tradeIn} onChange={setTradeIn} />

              <h3 className="section-title" style={{ fontSize: '1.1rem', marginTop: '20px' }}>Opties</h3>
              {vehicle && (
                <AccessoriesSelector
                  accessories={accessoriesCatalog}
                  selectedAccessories={selectedAccessories}
                  vehicleModel={vehicle.name}
                  onSelectAccessory={(acc) => {
                    if (acc.mandatory) return
                    setSelectedAccessories((prev) => {
                      if (prev.some((a) => a.id === acc.id)) return prev.filter((a) => a.id !== acc.id)
                      if (SINGLE_SELECT_CATEGORIES.includes(acc.category)) {
                        return [...prev.filter((a) => a.category !== acc.category), acc]
                      }
                      return [...prev, acc]
                    })
                  }}
                />
              )}

              <div className="form-row" style={{ marginTop: '20px' }}>
                <div className="form-group">
                  <label htmlFor="editor-discount-type">Type korting</label>
                  <select
                    id="editor-discount-type"
                    value={discountType}
                    onChange={(e) => { setDiscountType(e.target.value); setDiscountValue(0) }}
                  >
                    {DISCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>{DISCOUNT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="editor-discount">{discountType === 'fixed' ? 'Korting (€)' : 'Korting (%)'}</label>
                  <input
                    id="editor-discount"
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

              {DISCOUNT_APPROVAL_STATUS_LABELS[discountApprovalStatus] && (
                <div style={{ marginTop: '10px' }}>
                  <span className={`badge ${DISCOUNT_APPROVAL_BADGE_CLASS[discountApprovalStatus]}`}>
                    {DISCOUNT_APPROVAL_STATUS_LABELS[discountApprovalStatus]}
                  </span>
                </div>
              )}
              {needsApprovalWarning(discountType, discountValue, user.role) && (
                <p style={{ color: 'var(--warning)', fontSize: '0.85rem', fontWeight: 600, marginTop: '10px' }}>
                  ⚠ Deze korting is groter dan gebruikelijk en vereist goedkeuring van een sales manager voordat de offerte verzonden of geaccepteerd kan worden.
                </p>
              )}

              <div className="form-row" style={{ marginTop: '16px' }}>
                <div className="form-group">
                  <label htmlFor="editor-status">Status</label>
                  <select id="editor-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {QUOTE_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-side">
              {pricing && <PricingSummary pricing={pricing} tradeInValue={tradeIn.tradeInEnabled ? tradeIn.tradeInValue : 0} financing={financing} />}
              <div className="btn-group" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
                </button>
                <button className="btn btn-outline" onClick={onClose} disabled={saving}>
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuoteEditor
