import React, { useState } from 'react'
import { api } from '../utils/api'

function CustomerForm({ customerInfo, onChange }) {
  const [vatLookupLoading, setVatLookupLoading] = useState(false)
  const [vatLookupError, setVatLookupError] = useState('')

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
