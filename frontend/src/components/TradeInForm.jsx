import React from 'react'

function TradeInForm({ tradeIn, onChange }) {
  const set = (field, value) => onChange({ ...tradeIn, [field]: value })

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none', fontWeight: 700, marginBottom: tradeIn.tradeInEnabled ? '16px' : 0 }}>
        <input
          type="checkbox"
          checked={tradeIn.tradeInEnabled}
          onChange={(e) => set('tradeInEnabled', e.target.checked)}
          style={{ width: '16px', height: '16px' }}
        />
        Klant heeft een inruilwagen
      </label>

      {tradeIn.tradeInEnabled && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tradeInMake">Merk</label>
              <input
                id="tradeInMake"
                type="text"
                value={tradeIn.tradeInMake || ''}
                onChange={(e) => set('tradeInMake', e.target.value)}
                placeholder="Volkswagen"
              />
            </div>
            <div className="form-group">
              <label htmlFor="tradeInModel">Model</label>
              <input
                id="tradeInModel"
                type="text"
                value={tradeIn.tradeInModel || ''}
                onChange={(e) => set('tradeInModel', e.target.value)}
                placeholder="Golf"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tradeInYear">Bouwjaar</label>
              <input
                id="tradeInYear"
                type="number"
                min="1980"
                max={new Date().getFullYear() + 1}
                value={tradeIn.tradeInYear ?? ''}
                onChange={(e) => set('tradeInYear', e.target.value ? parseInt(e.target.value, 10) : '')}
                placeholder="2019"
              />
            </div>
            <div className="form-group">
              <label htmlFor="tradeInMileage">Kilometerstand</label>
              <input
                id="tradeInMileage"
                type="number"
                min="0"
                value={tradeIn.tradeInMileage ?? ''}
                onChange={(e) => set('tradeInMileage', e.target.value ? parseInt(e.target.value, 10) : '')}
                placeholder="85000"
              />
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: '220px' }}>
            <label htmlFor="tradeInValue">Geschatte inruilwaarde (€)</label>
            <input
              id="tradeInValue"
              type="number"
              min="0"
              step="50"
              value={tradeIn.tradeInValue ?? ''}
              onChange={(e) => set('tradeInValue', e.target.value !== '' ? parseFloat(e.target.value) : 0)}
              placeholder="0"
            />
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '-4px' }}>
            Dit is een schatting door de verkoper, geen bindende taxatie. Het bedrag wordt apart getoond
            als aftrek op de offerte en heeft geen invloed op de BTW-berekening van het voertuig zelf.
          </p>
        </>
      )}
    </div>
  )
}

export default TradeInForm
