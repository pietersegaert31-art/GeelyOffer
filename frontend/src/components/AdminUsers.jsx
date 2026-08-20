import React, { useEffect, useState } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { ROLES, ROLE_LABELS } from '../utils/constants'

function UserFormModal({ branches, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'sales', branchId: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.createUser({ ...form, branchId: form.branchId || null })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Nieuwe collega</h2>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Naam</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Tijdelijk wachtwoord</label>
            <input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} placeholder="Minstens 8 tekens" />
          </div>
          <div className="form-group">
            <label>Rol</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Vestiging</label>
            <select value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
              <option value="">Geen vestiging</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Aanmaken...' : 'Account aanmaken'}</button>
            <button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>Annuleren</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Inline-editable e-mail cell — commits on blur (rather than every keystroke, like the
// role/branch dropdowns do) since a partially-typed e-mail address isn't a valid save.
// Local state so typing doesn't fight the table's own re-renders; resyncs from the saved
// value on success, or snaps back to it if the save is rejected (e.g. duplicate e-mail).
function EmailCell({ user, onSave }) {
  const [value, setValue] = useState(user.email)

  useEffect(() => { setValue(user.email) }, [user.email])

  const commit = async () => {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed || trimmed === user.email) {
      setValue(user.email)
      return
    }
    try {
      await onSave(trimmed)
    } catch {
      setValue(user.email)
    }
  }

  return (
    <input
      type="email"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      style={{ padding: '5px 8px', fontSize: '0.76rem', width: '100%' }}
    />
  )
}

function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [usersData, branchesData] = await Promise.all([api.getUsers(), api.getBranches(true)])
      setUsers(usersData)
      setBranches(branchesData)
    } catch (err) {
      setError('Kon gebruikers niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleToggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { active: !u.active })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRoleChange = async (u, role) => {
    if (role === u.role) return
    try {
      await api.updateUser(u.id, { role })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleBranchChange = async (u, branchId) => {
    if (branchId === (u.branchId || '')) return
    try {
      await api.updateUser(u.id, { branchId: branchId || null })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleEmailChange = async (u, email) => {
    try {
      await api.updateUser(u.id, { email })
      load()
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`Account van ${u.name} verwijderen?`)) return
    try {
      await api.deleteUser(u.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Gebruikers</h3>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nieuwe collega</button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Naam</th>
                <th>E-mail</th>
                <th>Rol</th>
                <th>Vestiging</th>
                <th>Status</th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>{u.name}{u.id === currentUser.id && <span style={{ color: 'var(--muted-soft)', fontWeight: 400 }}> (jij)</span>}</td>
                  <td><EmailCell user={u} onSave={(email) => handleEmailChange(u, email)} /></td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      style={{ padding: '5px 8px', fontSize: '0.76rem' }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={u.branchId || ''}
                      onChange={(e) => handleBranchChange(u, e.target.value)}
                      style={{ padding: '5px 8px', fontSize: '0.76rem' }}
                    >
                      <option value="">Geen vestiging</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className={`badge ${u.active ? 'sent' : 'draft'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.active ? 'Actief' : 'Inactief'}
                    </button>
                    {u.mustChangePassword && (
                      <span className="badge declined" style={{ marginLeft: '6px' }} title="Deze collega moet nog inloggen met het tijdelijke wachtwoord en het wijzigen">
                        Tijdelijk wachtwoord
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                      onClick={() => handleDelete(u)}
                      disabled={u.id === currentUser.id}
                    >
                      Verwijderen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <UserFormModal branches={branches} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
    </div>
  )
}

export default AdminUsers
