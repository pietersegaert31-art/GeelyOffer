import React, { useEffect, useState } from 'react'
import { api } from '../utils/api'

const EMPTY_FORM = { name: '', address: '', active: true }

function BranchFormModal({ branch, onClose, onSaved }) {
  const [form, setForm] = useState(branch ? {
    name: branch.name, address: branch.address, active: !!branch.active,
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = { name: form.name, address: form.address, active: form.active }
      if (branch) {
        await api.updateBranch(branch.id, payload)
      } else {
        await api.createBranch(payload)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>{branch ? 'Vestiging bewerken' : 'Nieuwe vestiging'}</h2>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Naam</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Geely Roeselare" />
          </div>
          <div className="form-group">
            <label>Adres</label>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} required placeholder="Ovenstraat 15, 8800 Roeselare" />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Actief (selecteerbaar bij gebruikers)
            </label>
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
            <button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>Annuleren</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdminBranches() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // branch object, or 'new', or null

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      setBranches(await api.getBranches(true))
    } catch (err) {
      setError('Kon vestigingen niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Vestigingen</h3>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Nieuwe vestiging</button>
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
                <th>Adres</th>
                <th>Status</th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 700 }}>{b.name}</td>
                  <td>{b.address}</td>
                  <td><span className={`badge ${b.active ? 'sent' : 'draft'}`}>{b.active ? 'Actief' : 'Inactief'}</span></td>
                  <td>
                    <button className="btn btn-outline" style={{ padding: '7px 12px', fontSize: '0.8rem' }} onClick={() => setEditing(b)}>
                      Bewerken
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <BranchFormModal
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export default AdminBranches
