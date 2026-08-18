import React, { useState } from 'react'
import { api } from '../utils/api'
import geelyLogo from '../assets/geely-logo.png'

function ResetPasswordPage({ token }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen')
      return
    }
    try {
      setLoading(true)
      await api.resetPassword(token, newPassword)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <img src={geelyLogo} alt="Geely" className="login-logo" />
        <div className="section-kicker" style={{ marginTop: '18px' }}>Sales &amp; Quote Hub</div>
        <h1 className="section-title" style={{ marginBottom: '20px' }}>Nieuw wachtwoord instellen</h1>

        {done ? (
          <div>
            <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: '18px' }}>
              Wachtwoord succesvol gewijzigd. Je kan nu inloggen.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { window.location.href = '/' }}>
              Naar inloggen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error">{error}</div>}
            <div className="form-group">
              <label htmlFor="reset-new-password">Nieuw wachtwoord</label>
              <input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reset-confirm-password">Bevestig nieuw wachtwoord</label>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '6px' }}>
              {loading ? 'Bezig...' : 'Wachtwoord instellen'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ResetPasswordPage
