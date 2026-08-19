import React, { useEffect, useState } from 'react'
import { api, formatPrice, formatDate } from '../utils/api'
import geelyLogo from '../assets/geely-logo.png'

function AcceptQuotePage({ token }) {
  const [summary, setSummary] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.getQuoteAcceptance(token)
      .then(setSummary)
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!name.trim()) {
      setSubmitError('Vul uw volledige naam in')
      return
    }
    try {
      setSubmitting(true)
      await api.acceptQuote(token, name.trim())
      setDone(true)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const netAmount = summary ? Math.max(0, summary.totalPrice - (summary.tradeInEnabled ? summary.tradeInValue : 0)) : 0

  return (
    <div className="login-shell">
      <div className="login-card">
        <img src={geelyLogo} alt="Geely" className="login-logo" />
        <div className="section-kicker" style={{ marginTop: '18px' }}>Offerte bevestigen</div>

        {loading && (
          <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
        )}

        {!loading && loadError && (
          <>
            <h1 className="section-title" style={{ marginBottom: '14px' }}>Link ongeldig</h1>
            <div className="error">{loadError}</div>
            <p style={{ color: 'var(--muted)' }}>Neem contact op met uw verkoper voor een nieuwe link.</p>
          </>
        )}

        {!loading && summary && (
          done || summary.alreadyAccepted ? (
            <>
              <h1 className="section-title" style={{ marginBottom: '14px' }}>Bedankt!</h1>
              <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: '10px' }}>
                Deze offerte is bevestigd{summary.acceptedByName ? ` door ${summary.acceptedByName}` : ''}
                {summary.acceptedAt ? ` op ${formatDate(summary.acceptedAt)}` : ''}.
              </p>
              <p style={{ color: 'var(--muted)' }}>Uw verkoper neemt binnenkort contact met u op voor de verdere afhandeling.</p>
            </>
          ) : (
            <>
              <h1 className="section-title" style={{ marginBottom: '6px' }}>{summary.vehicleLabel}</h1>
              <p style={{ color: 'var(--muted)', marginBottom: '18px' }}>Persoonlijke offerte voor {summary.customerName}</p>

              <div className="pricing-summary" style={{ marginBottom: '20px' }}>
                <div className="price-row total">
                  <span>Totaalprijs incl. BTW</span>
                  <span>{formatPrice(summary.totalPrice)}</span>
                </div>
                {summary.tradeInEnabled && summary.tradeInValue > 0 && (
                  <>
                    <div className="price-row">
                      <span className="price-label">Inruilwaarde (geschat)</span>
                      <span className="price-value price-value--discount">-{formatPrice(summary.tradeInValue)}</span>
                    </div>
                    <div className="price-row total">
                      <span>Te betalen na inruil</span>
                      <span>{formatPrice(netAmount)}</span>
                    </div>
                  </>
                )}
              </div>

              {summary.needsApproval ? (
                <p style={{ color: 'var(--warning)', fontWeight: 600 }}>
                  Deze offerte wordt momenteel nog intern beoordeeld. Neem contact op met uw verkoper om te bevestigen.
                </p>
              ) : (
                <form onSubmit={handleSubmit}>
                  {submitError && <div className="error">{submitError}</div>}
                  <div className="form-group">
                    <label htmlFor="accept-name">Volledige naam (ter bevestiging)</label>
                    <input
                      id="accept-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={summary.customerName}
                      autoFocus
                      required
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', marginTop: '6px' }}>
                    {submitting ? 'Bezig...' : 'Ik ga akkoord met deze offerte'}
                  </button>
                  <p style={{ color: 'var(--muted-soft)', fontSize: '0.76rem', marginTop: '12px' }}>
                    Deze offerte is geldig tot {formatDate(summary.expiresAt)}.
                  </p>
                </form>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}

export default AcceptQuotePage
