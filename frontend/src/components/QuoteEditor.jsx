import React, { useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'
import {
  QUOTE_STATUSES, STATUS_LABELS, DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS,
  DISCOUNT_APPROVAL_THRESHOLD_PERCENTAGE, DISCOUNT_APPROVAL_THRESHOLD_FIXED,
  DISCOUNT_APPROVAL_STATUS_LABELS, DISCOUNT_APPROVAL_BADGE_CLASS,
  SINGLE_SELECT_CATEGORIES, STANDARD_PAINT_ACCESSORY_ID,
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
  // What the discount actually was when the quote loaded — compared against the live
  // discountType/discountValue below so the approval badge can stop claiming an approval
  // that only ever covered the old value the moment the rep changes it, instead of only
  // catching up after the next save round-trip.
  const originalDiscountRef = useRef({ type: 'percentage', value: 0 })
  // The quote's status as it was when THIS edit session loaded — not the live `status`
  // state below, which the rep might be about to change. A customer who already accepted
  // this quote signed off on a specific price/configuration, so a plain rep shouldn't be
  // able to silently change it afterward (the backend enforces this too, on PUT /:id — see
  // routes/quotes.js); a manager still can, to correct a genuine mistake.
  const [originalStatus, setOriginalStatus] = useState('draft')
  const isLockedAccepted = originalStatus === 'accepted' && !['admin', 'sales_manager'].includes(user.role)

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
        // vehicleModels is always an array (never null) from the API — `!acc.vehicleModels`
        // alone would never actually match the "applies to every model" case (an empty
        // array), silently dropping a universal accessory (and its price) from the quote
        // the next time it's opened and saved. Checked by length instead, same as
        // AccessoriesSelector.jsx and InventoryPage.jsx.
        // If the catalog somehow holds two accessories with the same name that both apply
        // to this vehicle (e.g. a "Delivery Pack" that has drifted to also being "all
        // models" alongside the model-specific one), keep only one per name — preferring
        // the model-specific row — so the quote doesn't load, show and re-save that line
        // twice. Mirrors resolveMandatoryAccessories in routes/quotes.js.
        const matched = catalog.filter((acc) =>
          (!acc.vehicleModels?.length || acc.vehicleModels.includes(vehicleData.name)) &&
          quote.items?.some((item) => item.itemName === acc.name)
        )
        const dedupedByName = []
        for (const acc of matched) {
          const i = dedupedByName.findIndex((a) => a.name === acc.name)
          if (i === -1) dedupedByName.push(acc)
          else if (acc.vehicleModels?.length && !dedupedByName[i].vehicleModels?.length) dedupedByName[i] = acc
        }
        setSelectedAccessories(dedupedByName)
        const loadedDiscountType = quote.discountType || 'percentage'
        const loadedDiscountValue = (quote.discountType === 'fixed' ? quote.discountEuro : quote.discountPercentage) || 0
        setDiscountType(loadedDiscountType)
        setDiscountValue(loadedDiscountValue)
        originalDiscountRef.current = { type: loadedDiscountType, value: loadedDiscountValue }
        setDiscountApprovalStatus(quote.discountApprovalStatus || 'not_required')
        setStatus(quote.status || 'draft')
        setOriginalStatus(quote.status || 'draft')
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
    // Guards against a slower, stale response overwriting a newer one — rapid discount
    // edits can fire overlapping requests, and without this the one that happens to
    // resolve last (not the one matching the current form) would win. Same "cancelled"
    // guard as the load() effect above.
    let cancelled = false
    const accessoriesTotal = selectedAccessories.reduce((sum, acc) => sum + acc.price, 0)
    const nonDiscountableAccessoriesTotal = selectedAccessories.filter((acc) => !acc.discountable).reduce((sum, acc) => sum + acc.price, 0)
    api.calculatePricing(vehicle.basePrice, accessoriesTotal, discountType, discountValue, nonDiscountableAccessoriesTotal)
      .then((data) => { if (!cancelled) setPricing(data) })
      .catch((err) => { if (!cancelled) setError('Kon prijs niet berekenen: ' + err.message) })
    return () => { cancelled = true }
  }, [vehicle, selectedAccessories, discountType, discountValue])

  // Same reasoning as QuoteBuilder.jsx: keeps the live preview accurate for a quote that
  // predates this feature (or was edited before the mandatory item existed). The backend
  // injects it independently on save regardless of what's sent here.
  useEffect(() => {
    if (!vehicle || accessoriesCatalog.length === 0) return
    // Same "empty vehicleModels = every model" gap as AccessoriesSelector.jsx above —
    // without the length check, a universal mandatory fee would never show in this
    // preview for any model.
    const applicable = accessoriesCatalog.filter((a) => a.mandatory && (!a.vehicleModels?.length || a.vehicleModels.includes(vehicle.name)))
    // Collapse same-named mandatory fees to one (preferring the model-specific row) —
    // mirrors resolveMandatoryAccessories in routes/quotes.js, so a "Delivery Pack" that
    // has drifted to also being "all models" doesn't show on the quote twice.
    const mandatory = []
    for (const a of applicable) {
      const dupeIndex = mandatory.findIndex((m) => m.name === a.name)
      if (dupeIndex === -1) mandatory.push(a)
      else if (a.vehicleModels?.length && !mandatory[dupeIndex].vehicleModels?.length) mandatory[dupeIndex] = a
    }
    if (mandatory.length === 0) return
    setSelectedAccessories((prev) => {
      const missing = mandatory.filter((m) => !prev.some((p) => p.id === m.id || p.name === m.name))
      return missing.length ? [...prev, ...missing] : prev
    })
  }, [vehicle, accessoriesCatalog])

  // Same reasoning as QuoteBuilder.jsx: every quote carries an exterior-colour line, so
  // the free "Standaardkleur: Wit" (€0) stands in whenever the exterior category is empty
  // — a quote that predates this feature, or the rep clearing a paid colour. Picking a
  // paid colour swaps it out via the single-select branch in the selector's onSelect
  // handler. The backend applies the same fallback on save (applyDefaultPaintColor).
  useEffect(() => {
    if (!vehicle || accessoriesCatalog.length === 0) return
    const standardColor = accessoriesCatalog.find(
      (a) => a.id === STANDARD_PAINT_ACCESSORY_ID &&
        (!a.vehicleModels?.length || a.vehicleModels.includes(vehicle.name))
    )
    if (!standardColor) return
    setSelectedAccessories((prev) =>
      prev.some((a) => a.category === 'exterior') ? prev : [...prev, standardColor]
    )
  }, [vehicle, accessoriesCatalog, selectedAccessories])

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

  // discountApprovalStatus reflects what the server last computed for the discount as it
  // was when this quote loaded — once the rep changes the discount away from that, it no
  // longer describes the value on screen (e.g. still showing "goedgekeurd" for a since-
  // approved 10% while the form now holds an unapproved 40%). Re-derive it locally with
  // the same rule the backend uses (computeDiscountApprovalStatus in routes/quotes.js) the
  // moment the value diverges, rather than waiting for the next save round-trip.
  const discountChangedSinceLoad = discountType !== originalDiscountRef.current.type
    || discountValue !== originalDiscountRef.current.value
  const displayedApprovalStatus = !discountChangedSinceLoad
    ? discountApprovalStatus
    : discountValue <= 0
      ? 'not_required'
      : ['admin', 'sales_manager'].includes(user.role)
        ? 'approved'
        : (needsApprovalWarning(discountType, discountValue, user.role) ? 'pending' : 'not_required')

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
        {isLockedAccepted && (
          <div className="customer-history-notice">
            <strong>Al geaccepteerd door de klant.</strong> Deze offerte kan niet meer gewijzigd worden — enkel een sales manager of beheerder kan een reeds geaccepteerde offerte nog aanpassen.
          </div>
        )}

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
                    max={discountType === 'percentage' ? 100 : pricing?.subtotalBeforeDiscount}
                    step={discountType === 'percentage' ? 0.5 : 1}
                    value={discountValue}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value) || 0
                      // Same reasoning as QuoteBuilder.jsx: a fixed discount above the
                      // pre-discount total is never meaningful, and letting it through here
                      // is what makes PricingSummary show two disagreeing numbers.
                      setDiscountValue(
                        discountType === 'percentage'
                          ? Math.min(100, Math.max(0, raw))
                          : Math.max(0, pricing?.subtotalBeforeDiscount !== undefined ? Math.min(raw, pricing.subtotalBeforeDiscount) : raw)
                      )
                    }}
                  />
                </div>
              </div>

              {DISCOUNT_APPROVAL_STATUS_LABELS[displayedApprovalStatus] && (
                <div style={{ marginTop: '10px' }}>
                  <span className={`badge ${DISCOUNT_APPROVAL_BADGE_CLASS[displayedApprovalStatus]}`}>
                    {DISCOUNT_APPROVAL_STATUS_LABELS[displayedApprovalStatus]}
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
              {pricing && <PricingSummary pricing={pricing} tradeInValue={tradeIn.tradeInEnabled ? tradeIn.tradeInValue : 0} />}
              <div className="btn-group" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || isLockedAccepted}
                  title={isLockedAccepted ? 'Al geaccepteerd door de klant — enkel een sales manager of beheerder kan dit nog wijzigen' : undefined}
                >
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
