import React, { useState } from 'react'
import { api } from '../utils/api'

function ChangePasswordModal({ onClose, forced = false, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Nieuwe wachtwoorden komen niet overeen')
      return
    }
    try {
      setSaving(true)
      const { user } = await api.changePassword(currentPassword, newPassword)
      if (forced) {
        onSuccess(user)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleOverlayClick = () => {
    if (!forced) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-card" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Wachtwoord wijzigen</h2>
          {!forced && <button className="btn btn-outline" onClick={onClose}>Sluiten</button>}
        </div>

        {forced && (
          <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>
            Je account heeft een tijdelijk wachtwoord. Kies een eigen wachtwoord om verder te gaan.
          </p>
        )}

        {success ? (
          <div>
            <p style={{ color: 'var(--success)', fontWeight: 600 }}>Wachtwoord succesvol gewijzigd.</p>
            <button className="btn btn-primary" onClick={onClose}>Sluiten</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error">{error}</div>}
            <div className="form-group">
              <label>Huidig wachtwoord</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label>Nieuw wachtwoord</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="form-group">
              <label>Bevestig nieuw wachtwoord</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Opslaan...' : 'Wachtwoord wijzigen'}</button>
              {!forced && <button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>Annuleren</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ChangePasswordModal
