import React, { useEffect, useState } from 'react'
import { api, formatPrice } from '../utils/api'
import { useAuth } from '../context/AuthContext'

function AccessoryFormModal({ accessory, vehicleNames, onClose, onSaved }) {
  const [form, setForm] = useState(accessory ? {
    name: accessory.name, price: accessory.price, category: accessory.category,
    vehicleModels: accessory.vehicleModels, active: accessory.active, mandatory: accessory.mandatory,
    discountable: accessory.discountable, colorHex: accessory.colorHex || '',
  } : { name: '', price: '', category: '', vehicleModels: [], active: true, mandatory: false, discountable: true, colorHex: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const toggleModel = (name) => {
    setForm((prev) => ({
      ...prev,
      vehicleModels: prev.vehicleModels.includes(name)
        ? prev.vehicleModels.filter((m) => m !== name)
        : [...prev.vehicleModels, name],
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        price: parseFloat(form.price),
        category: form.category.toLowerCase(),
        vehicleModels: form.vehicleModels,
        active: form.active,
        mandatory: form.mandatory,
        discountable: form.discountable,
        colorHex: form.colorHex || null,
      }
      if (accessory) {
        await api.updateAccessory(accessory.id, payload)
      } else {
        await api.createAccessory(payload)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Not disabled while saving, the overlay click would unmount the modal mid-request; a
  // since-rejected save then calls setError on an already-unmounted component and the
  // failure is silently swallowed instead of shown.
  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>{accessory ? 'Optie bewerken' : 'Nieuwe optie'}</h2>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Naam</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Metallic: Carbon Black" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Prijs (incl. BTW)</label>
              <input type="number" min="0" step="1" value={form.price} onChange={(e) => set('price', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Categorie</label>
              <input value={form.category} onChange={(e) => set('category', e.target.value)} required placeholder="exterior" />
            </div>
          </div>
          <div className="form-group">
            <label>Kleurstaal (optioneel, voor kleuropties)</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="color"
                value={form.colorHex || '#ffffff'}
                onChange={(e) => set('colorHex', e.target.value)}
                style={{ width: '44px', height: '36px', padding: '2px', cursor: 'pointer', flexShrink: 0 }}
              />
              <input
                type="text"
                value={form.colorHex}
                onChange={(e) => set('colorHex', e.target.value)}
                placeholder="#A1B2C3"
                style={{ flex: 1 }}
              />
              {form.colorHex && (
                <button type="button" className="btn btn-outline" onClick={() => set('colorHex', '')}>Wis</button>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Beschikbaar voor</label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {vehicleNames.map((name) => (
                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.vehicleModels.includes(name)} onChange={() => toggleModel(name)} style={{ width: '16px', height: '16px' }} />
                  {name}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Actief (selecteerbaar bij nieuwe offertes)
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <input type="checkbox" checked={form.mandatory} onChange={(e) => set('mandatory', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Verplicht (wordt altijd toegevoegd, klant kan ze niet uitvinken)
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <input type="checkbox" checked={form.discountable} onChange={(e) => set('discountable', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Korting van toepassing (uitvinken voor een vaste toeslag of accessoire dat nooit wordt afgeprijsd, zoals een trekhaak)
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

function AdminAccessories() {
  const { user } = useAuth()
  // Unlike most other admin tabs, "Opties" is visible to plain 'sales' accounts too (see
  // AdminPage.jsx) — but only a manager can actually create/edit/delete one, per
  // accessories.js's requireManager on POST/PUT/DELETE. Without this check a sales rep
  // could fill out the whole modal and only find out it's rejected after clicking
  // "Opslaan" (a raw 403 inside the form), instead of never seeing controls they can't use.
  const canManage = user.role === 'admin' || user.role === 'sales_manager'
  const [accessories, setAccessories] = useState([])
  const [vehicleNames, setVehicleNames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [accData, vehicleData] = await Promise.all([api.getAccessories(true), api.getVehicles(true)])
      setAccessories(accData)
      setVehicleNames([...new Set(vehicleData.map((v) => v.name))])
    } catch (err) {
      setError('Kon opties niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (accessory) => {
    if (!window.confirm(`"${accessory.name}" permanent verwijderen?`)) return
    try {
      await api.deleteAccessory(accessory.id)
      load()
    } catch (err) {
      alert('Verwijderen mislukt: ' + err.message)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Opties &amp; accessoires</h3>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Nieuwe optie</button>
        )}
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
                <th>Categorie</th>
                <th>Prijs</th>
                <th>Beschikbaar voor</th>
                <th>Status</th>
                {canManage && <th>Acties</th>}
              </tr>
            </thead>
            <tbody>
              {accessories.map((acc) => (
                <tr key={acc.id}>
                  <td style={{ fontWeight: 700 }}>
                    {acc.colorHex && (
                      <span
                        style={{
                          display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%',
                          border: '1px solid var(--border-strong)', marginRight: '8px', verticalAlign: 'middle',
                          backgroundColor: acc.colorHex,
                        }}
                        title={acc.colorHex}
                      />
                    )}
                    {acc.name}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{acc.category}</td>
                  <td>{formatPrice(acc.price)}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{acc.vehicleModels.join(', ') || 'Alle modellen'}</td>
                  <td>
                    <span className={`badge ${acc.active ? 'sent' : 'draft'}`}>{acc.active ? 'Actief' : 'Inactief'}</span>
                    {acc.mandatory && <span className="badge declined" style={{ marginLeft: '6px' }}>Verplicht</span>}
                    {!acc.discountable && <span className="badge expiry-soon" style={{ marginLeft: '6px' }}>Geen korting</span>}
                  </td>
                  {canManage && (
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-outline" onClick={() => setEditing(acc)}>Bewerken</button>
                        <button className="btn btn-danger" onClick={() => handleDelete(acc)}>Verwijderen</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && editing && (
        <AccessoryFormModal
          accessory={editing === 'new' ? null : editing}
          vehicleNames={vehicleNames}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export default AdminAccessories
