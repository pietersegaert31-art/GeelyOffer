import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../utils/api'
import geelyLogo from '../assets/geely-logo.png'

function ForgotPasswordForm({ onBackToLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { message } = await api.forgotPassword(email)
      setSent(message)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div>
        <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: '18px' }}>{sent}</p>
        <button className="btn btn-outline" style={{ width: '100%' }} onClick={onBackToLogin}>← Terug naar inloggen</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ color: 'var(--muted)', marginBottom: '18px' }}>
        Vul je e-mailadres in. Als er een account bestaat, sturen we een link om je wachtwoord opnieuw in te stellen.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="form-group">
        <label htmlFor="forgot-email">E-mail</label>
        <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '6px' }}>
        {loading ? 'Bezig...' : 'Resetlink versturen'}
      </button>
      <button className="btn btn-outline" type="button" onClick={onBackToLogin} style={{ width: '100%', marginTop: '10px' }}>
        ← Terug naar inloggen
      </button>
    </form>
  )
}

function LoginPage() {
  const { login } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
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
        <h1 className="section-title" style={{ marginBottom: '20px' }}>
          {mode === 'login' ? 'Inloggen' : 'Wachtwoord vergeten'}
        </h1>

        {mode === 'forgot' ? (
          <ForgotPasswordForm onBackToLogin={() => setMode('login')} />
        ) : (
          <>
            {error && <div className="error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Wachtwoord</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '6px' }}>
                {loading ? 'Bezig...' : 'Inloggen'}
              </button>
            </form>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setMode('forgot')}
              style={{ width: '100%', marginTop: '10px' }}
            >
              Wachtwoord vergeten?
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default LoginPage
