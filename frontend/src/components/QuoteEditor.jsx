import React, { useEffect, useState } from 'react'
import { api } from '../utils/api'
import { QUOTE_STATUSES, STATUS_LABELS } from '../utils/constants'
import CustomerForm from './CustomerForm'
import AccessoriesSelector from './AccessoriesSelector'
import PricingSummary from './PricingSummary'

function QuoteEditor({ quoteId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [vehicle, setVehicle] = useState(null)
  const [accessoriesCatalog, setAccessoriesCatalog] = useState([])
  const [selectedAccessories, setSelectedAccessories] = useState([])
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [status, setStatus] = useState('draft')
  const [customerInfo, setCustomerInfo] = useState({
    customerName: '', customerEmail: '', customerPhone: '', customerCompany: '', notes: '',
  })
  const [pricing, setPricing] = useState(null)

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
        setSelectedAccessories(
          catalog.filter((acc) => quote.items?.some((item) => item.itemName === acc.name))
        )
        setDiscountPercentage(quote.discountPercentage || 0)
        setStatus(quote.status || 'draft')
        setCustomerInfo({
          customerName: quote.customerName || '',
          customerEmail: quote.customerEmail || '',
          customerPhone: quote.customerPhone || '',
          customerCompany: quote.customerCompany || '',
          notes: quote.notes || '',
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
    api.calculatePricing(vehicle.basePrice, accessoriesTotal, discountPercentage)
      .then(setPricing)
      .catch((err) => setError('Kon prijs niet berekenen: ' + err.message))
  }, [vehicle, selectedAccessories, discountPercentage])

  const handleSave = async () => {
    if (!customerInfo.customerName) {
      setError('Naam is verplicht')
      return
    }
    try {
      setSaving(true)
      setError('')
      await api.updateQuote(quoteId, {
        ...customerInfo,
        discountPercentage,
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
              <CustomerForm customerInfo={customerInfo} onChange={setCustomerInfo} />

              <h3 className="section-title" style={{ fontSize: '1.1rem', marginTop: '20px' }}>Opties</h3>
              {vehicle && (
                <AccessoriesSelector
                  accessories={accessoriesCatalog}
                  selectedAccessories={selectedAccessories}
                  vehicleModel={vehicle.name}
                  onSelectAccessory={(acc) => {
                    setSelectedAccessories((prev) =>
                      prev.some((a) => a.id === acc.id) ? prev.filter((a) => a.id !== acc.id) : [...prev, acc]
                    )
                  }}
                />
              )}

              <div className="form-row" style={{ marginTop: '20px' }}>
                <div className="form-group">
                  <label htmlFor="editor-discount">Korting (%)</label>
                  <input
                    id="editor-discount"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  />
                </div>
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
              {pricing && <PricingSummary pricing={pricing} />}
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
