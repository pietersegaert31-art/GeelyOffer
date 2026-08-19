import React, { useEffect, useState } from 'react'
import { api } from '../utils/api'

function AdminFinancing() {
  const [rate, setRate] = useState('')
  const [terms, setTerms] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.getFinancingSettings()
      .then((data) => {
        setRate(String(data.annualRatePercent))
        setTerms(data.terms.join(', '))
      })
      .catch((err) => setError('Kon instellingen niet laden: ' + err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    const annualRatePercent = parseFloat(rate)
    const parsedTerms = terms.split(',').map((t) => parseInt(t.trim(), 10)).filter((t) => Number.isFinite(t) && t > 0)

    try {
      setSaving(true)
      await api.updateFinancingSettings({ annualRatePercent, terms: parsedTerms })
      setMessage('Instellingen opgeslagen.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Financieringssimulatie</h3>
      <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>
        Rentevoet en looptijden gebruikt voor de indicatieve maandprijs die klanten zien tijdens het samenstellen
        van een offerte en op de PDF. Dit is een schatting, geen bindend financieringsaanbod.
      </p>

      {loading ? (
        <div className="loading" style={{ minHeight: '80px' }}><div className="spinner" /></div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}
          {message && <div className="customer-history-notice">{message}</div>}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="financingRate">Jaarlijkse rentevoet (%)</label>
              <input
                id="financingRate"
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="financingTerms">Looptijden (maanden, komma-gescheiden)</label>
              <input
                id="financingTerms"
                type="text"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="36, 48, 60"
                required
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      )}
    </div>
  )
}

export default AdminFinancing
