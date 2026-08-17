import React, { useState } from 'react'
import { api } from '../utils/api'

function ChangePasswordModal({ onClose }) {
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
      await api.changePassword(currentPassword, newPassword)
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Wachtwoord wijzigen</h2>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>

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
              <button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>Annuleren</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ChangePasswordModal
