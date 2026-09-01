import React, { useEffect, useState } from 'react'
import { api, formatPrice } from '../utils/api'

const EMPTY_FORM = {
  name: '', model: '', basePrice: '', fuel: '', transmission: '', power: '', torque: '', consumption: '', active: true, comingSoon: false, deliveryEstimate: '',
}

function VehicleFormModal({ vehicle, onClose, onSaved }) {
  // ?? rather than || below — a legitimate 0 (e.g. basePrice while comingSoon) would
  // otherwise render blank and then get silently overwritten with null on save, since a
  // blank field looks empty to the form regardless of why it's blank.
  const [form, setForm] = useState(vehicle ? {
    name: vehicle.name, model: vehicle.model, basePrice: vehicle.basePrice ?? '', fuel: vehicle.fuel,
    transmission: vehicle.transmission, power: vehicle.power ?? '', torque: vehicle.torque ?? '',
    consumption: vehicle.consumption ?? '', active: !!vehicle.active, comingSoon: !!vehicle.comingSoon,
    deliveryEstimate: vehicle.deliveryEstimate || '',
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      // Checked against '' (what the field actually looks like when cleared) rather than
      // truthiness — form.power/torque/consumption/basePrice are strings here, and a
      // truthy check treats the string '0' as empty-equivalent... no, '0' is truthy; the
      // real gap was upstream (the ?? '' fix above) but kept consistent here too so a
      // saved '0' never round-trips through parseInt/parseFloat oddly for an empty string.
      const payload = {
        name: form.name,
        model: form.model,
        basePrice: form.basePrice !== '' ? parseFloat(form.basePrice) : (form.comingSoon ? 0 : undefined),
        fuel: form.fuel,
        transmission: form.transmission,
        power: form.power !== '' ? parseInt(form.power, 10) : null,
        torque: form.torque !== '' ? parseInt(form.torque, 10) : null,
        consumption: form.consumption !== '' ? parseFloat(form.consumption) : null,
        active: form.active,
        comingSoon: form.comingSoon,
        deliveryEstimate: form.deliveryEstimate || null,
      }
      if (vehicle) {
        await api.updateVehicle(vehicle.id, payload)
      } else {
        await api.createVehicle(payload)
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
      <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>{vehicle ? 'Voertuig bewerken' : 'Nieuw voertuig'}</h2>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Model naam</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Geely E5" />
            </div>
            <div className="form-group">
              <label>Uitvoering</label>
              <input value={form.model} onChange={(e) => set('model', e.target.value)} required placeholder="PRO" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Basisprijs (incl. BTW){form.comingSoon && ' (optioneel)'}</label>
              <input type="number" min="0" step="1" value={form.basePrice} onChange={(e) => set('basePrice', e.target.value)} required={!form.comingSoon} placeholder={form.comingSoon ? 'Nog niet bekend' : undefined} />
            </div>
            <div className="form-group">
              <label>Vermogen (pk)</label>
              <input type="number" min="0" value={form.power} onChange={(e) => set('power', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Brandstof{form.comingSoon && ' (optioneel)'}</label>
              <input value={form.fuel} onChange={(e) => set('fuel', e.target.value)} required={!form.comingSoon} placeholder="Elektrisch" />
            </div>
            <div className="form-group">
              <label>Transmissie{form.comingSoon && ' (optioneel)'}</label>
              <input value={form.transmission} onChange={(e) => set('transmission', e.target.value)} required={!form.comingSoon} placeholder="Automatisch" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Koppel (Nm)</label>
              <input type="number" min="0" value={form.torque} onChange={(e) => set('torque', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Verbruik (kWh of L /100km)</label>
              <input type="number" min="0" step="0.1" value={form.consumption} onChange={(e) => set('consumption', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Levertijd</label>
            <input value={form.deliveryEstimate} onChange={(e) => set('deliveryEstimate', e.target.value)} placeholder="Bv. 8-10 weken, of Op voorraad" />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <input type="checkbox" checked={form.comingSoon} onChange={(e) => set('comingSoon', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Coming soon (nog geen prijs/opties — niet selecteerbaar bij nieuwe offertes)
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Actief (zichtbaar bij nieuwe offertes)
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

function AdminVehicles() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // vehicle object, or 'new', or null
  const [showInactive, setShowInactive] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getVehicles(true)
      setVehicles(data)
    } catch (err) {
      setError('Kon voertuigen niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visibleVehicles = showInactive ? vehicles : vehicles.filter((v) => v.active)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Voertuigen</h3>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Nieuw voertuig</button>
      </div>

      {error && <div className="error">{error}</div>}

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--muted)' }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: '16px', height: '16px' }} />
        Toon ook gedeactiveerde modellen
      </label>

      {loading ? (
        <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Uitvoering</th>
                <th>Basisprijs</th>
                <th>Vermogen</th>
                <th>Levertijd</th>
                <th>Status</th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {visibleVehicles.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 700 }}>{v.name}</td>
                  <td>{v.model}</td>
                  <td>{v.comingSoon ? '—' : formatPrice(v.basePrice)}</td>
                  <td>{v.power ? `${v.power} pk` : '—'}</td>
                  <td>{v.deliveryEstimate || '—'}</td>
                  <td>
                    <span className={`badge ${v.active ? 'sent' : 'draft'}`}>{v.active ? 'Actief' : 'Inactief'}</span>
                    {v.comingSoon && <span className="badge declined" style={{ marginLeft: '6px' }}>Coming soon</span>}
                  </td>
                  <td>
                    <button className="btn btn-outline" style={{ padding: '7px 12px', fontSize: '0.8rem' }} onClick={() => setEditing(v)}>
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
        <VehicleFormModal
          vehicle={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export default AdminVehicles
