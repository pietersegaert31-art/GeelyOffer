import React, { useState } from 'react'
import { api, formatPrice, formatDate } from '../utils/api'
import { STATUS_LABELS } from '../utils/constants'

function CustomerForm({ customerInfo, onChange, excludeId }) {
  const [vatLookupLoading, setVatLookupLoading] = useState(false)
  const [vatLookupError, setVatLookupError] = useState('')
  const [history, setHistory] = useState([])

  // Checks whether this customer (by e-mail, phone, or VAT number) already has quotes
  // elsewhere in the system, so a rep can recognize a repeat customer instead of treating
  // every quote as a first contact. Fired on blur rather than on every keystroke.
  const checkHistory = async (info) => {
    if (!info.customerEmail && !info.customerPhone && !info.customerVatNumber) {
      setHistory([])
      return
    }
    try {
      const matches = await api.getCustomerHistory({
        email: info.customerEmail,
        phone: info.customerPhone,
        vatNumber: info.customerType === 'bedrijf' ? info.customerVatNumber : '',
        excludeId,
      })
      setHistory(matches)
    } catch {
      // A failed lookup shouldn't block filling in the rest of the form — just skip the notice.
      setHistory([])
    }
  }

  const handleChange = (field, value) => {
    onChange({
      ...customerInfo,
      [field]: value
    })
  }

  const isBedrijf = customerInfo.customerType === 'bedrijf'

  const handleTypeChange = (type) => {
    setVatLookupError('')
    handleChange('customerType', type)
  }

  // Looks the VAT number up via VIES (backend/src/routes/vatLookup.js) and fills in the
  // company name + address it returns in one update, so a partial customerInfo spread
  // from a stale closure never overwrites one of the fields being filled.
  const handleVatLookup = async () => {
    const vatNumber = (customerInfo.customerVatNumber || '').trim()
    if (!vatNumber) return
    setVatLookupError('')
    setVatLookupLoading(true)
    try {
      const result = await api.lookupVat(vatNumber)
      onChange({
        ...customerInfo,
        customerCompany: result.companyName,
        customerStreet: result.street,
        customerPostalCode: result.postalCode,
        customerCity: result.city,
      })
    } catch (err) {
      setVatLookupError(err.message)
    } finally {
      setVatLookupLoading(false)
    }
  }

  return (
    <div>
      {history.length > 0 && (
        <div className="customer-history-notice">
          <strong>Bekende klant</strong> — {history.length === 1 ? 'eerder gevonden offerte' : `${history.length} eerder gevonden offertes`}:
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                {h.vehicleLabel || 'Offerte'} · {formatPrice(h.totalPrice)} · {STATUS_LABELS[h.status] || h.status} · {formatDate(h.createdAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="customerType">Type klant</label>
        <select
          id="customerType"
          value={customerInfo.customerType || 'particulier'}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          <option value="particulier">Particulier</option>
          <option value="bedrijf">Bedrijf</option>
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="name">Volledige naam *</label>
          <input
            id="name"
            type="text"
            value={customerInfo.customerName}
            onChange={(e) => handleChange('customerName', e.target.value)}
            placeholder="Jan Janssens"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">E-mail *</label>
          <input
            id="email"
            type="email"
            value={customerInfo.customerEmail}
            onChange={(e) => handleChange('customerEmail', e.target.value)}
            onBlur={(e) => checkHistory({ ...customerInfo, customerEmail: e.target.value })}
            placeholder="jan@voorbeeld.com"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="phone">Telefoon *</label>
          <input
            id="phone"
            type="tel"
            value={customerInfo.customerPhone}
            onChange={(e) => handleChange('customerPhone', e.target.value)}
            onBlur={(e) => checkHistory({ ...customerInfo, customerPhone: e.target.value })}
            placeholder="+32 2 123 45 67"
            required
          />
        </div>
        {isBedrijf && (
          <div className="form-group">
            <label htmlFor="vat">BTW-nummer *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="vat"
                type="text"
                value={customerInfo.customerVatNumber || ''}
                onChange={(e) => handleChange('customerVatNumber', e.target.value)}
                onBlur={(e) => checkHistory({ ...customerInfo, customerVatNumber: e.target.value })}
                placeholder="BE 0123.456.789"
                style={{ flex: 1 }}
                required
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleVatLookup}
                disabled={vatLookupLoading || !(customerInfo.customerVatNumber || '').trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {vatLookupLoading ? 'Bezig...' : 'Opzoeken'}
              </button>
            </div>
            {vatLookupError && <div className="error" style={{ marginTop: '6px' }}>{vatLookupError}</div>}
          </div>
        )}
      </div>

      {isBedrijf && (
        <div className="form-group">
          <label htmlFor="company">Bedrijfsnaam *</label>
          <input
            id="company"
            type="text"
            value={customerInfo.customerCompany || ''}
            onChange={(e) => handleChange('customerCompany', e.target.value)}
            placeholder="Naam van het bedrijf"
            required
          />
        </div>
      )}

      <div className="form-group">
        <label htmlFor="street">Straat + nr *</label>
        <input
          id="street"
          type="text"
          value={customerInfo.customerStreet || ''}
          onChange={(e) => handleChange('customerStreet', e.target.value)}
          placeholder="Ovenstraat 15"
          required
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="postalCode">Postcode *</label>
          <input
            id="postalCode"
            type="text"
            value={customerInfo.customerPostalCode || ''}
            onChange={(e) => handleChange('customerPostalCode', e.target.value)}
            placeholder="8800"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="city">Gemeente *</label>
          <input
            id="city"
            type="text"
            value={customerInfo.customerCity || ''}
            onChange={(e) => handleChange('customerCity', e.target.value)}
            placeholder="Roeselare"
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="notes">Opmerkingen</label>
        <textarea
          id="notes"
          value={customerInfo.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Eventuele speciale verzoeken of opmerkingen..."
          rows="4"
          style={{ width: '100%' }}
        ></textarea>
      </div>
    </div>
  )
}

export default CustomerForm
