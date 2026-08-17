import React from 'react'

function CustomerForm({ customerInfo, onChange }) {
  const handleChange = (field, value) => {
    onChange({
      ...customerInfo,
      [field]: value
    })
  }

  return (
    <div>
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
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={customerInfo.customerEmail}
            onChange={(e) => handleChange('customerEmail', e.target.value)}
            placeholder="jan@voorbeeld.com"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="phone">Telefoon</label>
          <input
            id="phone"
            type="tel"
            value={customerInfo.customerPhone}
            onChange={(e) => handleChange('customerPhone', e.target.value)}
            placeholder="+32 2 123 45 67"
          />
        </div>
        <div className="form-group">
          <label htmlFor="company">Bedrijf</label>
          <input
            id="company"
            type="text"
            value={customerInfo.customerCompany}
            onChange={(e) => handleChange('customerCompany', e.target.value)}
            placeholder="Naam van uw bedrijf"
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
