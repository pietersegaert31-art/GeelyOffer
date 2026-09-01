import React, { useEffect, useRef, useState } from 'react'
import { api, formatDate } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['in_stock', 'incoming', 'reserved', 'sold']
const STATUS_LABELS = {
  in_stock: 'Op voorraad',
  incoming: 'Onderweg',
  reserved: 'Gereserveerd',
  sold: 'Verkocht',
}
// Only these five badge tones exist in index.css (mirrors STATUS_LABELS' quote badges).
const STATUS_BADGE_CLASS = {
  in_stock: 'sent',
  incoming: 'expiry-soon',
  reserved: 'draft',
  sold: 'declined',
}

// A color option doesn't require a swatch hex (see availableColors below) — hex missing
// just means a neutral placeholder dot instead of no dot at all. "—" is reserved for when
// no color was assigned to the unit in the first place (name itself is missing).
function ColorSwatch({ hex, name }) {
  if (!name) return <span style={{ color: 'var(--muted-soft)' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{
          display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%',
          border: '1px solid var(--border-strong)', backgroundColor: hex || 'var(--panel-soft)', flexShrink: 0,
        }}
        title={hex || 'Geen kleurstaal ingesteld'}
      />
      {name}
    </span>
  )
}

function UnitFormModal({ unit, vehicles, branches, accessories, onClose, onSaved }) {
  const [form, setForm] = useState(unit ? {
    vehicleId: unit.vehicleId, branchId: unit.branchId || '', vin: unit.vin || '',
    colorAccessoryId: unit.colorAccessoryId || '', status: unit.status,
    expectedArrival: unit.expectedArrival ? unit.expectedArrival.slice(0, 10) : '',
    reservedFor: unit.reservedFor || '', notes: unit.notes || '',
  } : {
    vehicleId: vehicles[0]?.id || '', branchId: '', vin: '', colorAccessoryId: '',
    status: 'in_stock', expectedArrival: '', reservedFor: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicleId)
  // Same applicability rule as AccessoriesSelector.jsx: a color option applies if it's
  // universal (no vehicleModels) or explicitly lists this vehicle by name. Filtered by
  // category rather than requiring a swatch hex — the hex is only cosmetic (it's optional
  // when adding an option in Beheer → Opties), so a color someone forgot to give a swatch
  // must still be pickable here, not silently missing from the dropdown.
  const availableColors = accessories.filter((a) =>
    a.category === 'exterior' && (!a.vehicleModels?.length || a.vehicleModels.includes(selectedVehicle?.name))
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        vehicleId: form.vehicleId,
        branchId: form.branchId || null,
        vin: form.vin || null,
        colorAccessoryId: form.colorAccessoryId || null,
        status: form.status,
        expectedArrival: form.expectedArrival || null,
        reservedFor: form.reservedFor || null,
        notes: form.notes || null,
      }
      if (unit) {
        await api.updateInventoryUnit(unit.id, payload)
      } else {
        await api.createInventoryUnit(payload)
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
          <h2 className="section-title" style={{ marginBottom: 0 }}>{unit ? 'Voorraadeenheid bewerken' : 'Nieuwe voorraadeenheid'}</h2>
          <button className="btn btn-outline" onClick={onClose}>Sluiten</button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Model</label>
              <select value={form.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} required disabled={!!unit}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} {v.model}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Vestiging</label>
              <select value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
                <option value="">Geen</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Kleur</label>
              <select value={form.colorAccessoryId} onChange={(e) => set('colorAccessoryId', e.target.value)}>
                <option value="">Onbekend</option>
                {availableColors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>VIN (optioneel)</label>
              <input value={form.vin} onChange={(e) => set('vin', e.target.value)} placeholder="Chassisnummer" />
            </div>
            <div className="form-group">
              <label>Verwachte aankomst</label>
              <input type="date" value={form.expectedArrival} onChange={(e) => set('expectedArrival', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Gereserveerd voor (optioneel)</label>
            <input value={form.reservedFor} onChange={(e) => set('reservedFor', e.target.value)} placeholder="Klantnaam of offertereferentie" />
          </div>
          <div className="form-group">
            <label>Notities</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
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

function InventoryPage() {
  const { user } = useAuth()
  const canManage = user.role === 'admin' || user.role === 'sales_manager'

  const [units, setUnits] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [branches, setBranches] = useState([])
  const [accessories, setAccessories] = useState([])
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)

  // Guards against a stale response overwriting a newer one when the user changes
  // filters faster than a request round-trips (e.g. clicking through model options
  // quickly) — only the response from the most recently fired load() is applied.
  const requestIdRef = useRef(0)

  const load = async () => {
    const requestId = ++requestIdRef.current
    try {
      setLoading(true)
      setError('')
      const [unitData, vehicleData, branchData, accessoryData] = await Promise.all([
        api.getInventory({ vehicleId: vehicleFilter, branchId: branchFilter, status: statusFilter }),
        api.getVehicles(true),
        api.getBranches(true),
        api.getAccessories(true),
      ])
      if (requestId !== requestIdRef.current) return
      setUnits(unitData)
      setVehicles(vehicleData)
      setBranches(branchData)
      setAccessories(accessoryData)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError('Kon voorraad niet laden: ' + err.message)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  useEffect(() => { load() }, [vehicleFilter, branchFilter, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (unit) => {
    if (!window.confirm(`Voorraadeenheid ${unit.vehicleName} ${unit.vehicleModel}${unit.vin ? ` (${unit.vin})` : ''} verwijderen?`)) return
    try {
      await api.deleteInventoryUnit(unit.id)
      load()
    } catch (err) {
      alert('Verwijderen mislukt: ' + err.message)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <div className="section-kicker">Voorraad</div>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Fysieke stock</h2>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={vehicles.length === 0}>
            + Nieuwe voorraadeenheid
          </button>
        )}
      </div>

      <div className="filter-row">
        <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} style={{ maxWidth: '220px' }}>
          <option value="">Alle modellen</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.name} {v.model}</option>
          ))}
        </select>
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={{ maxWidth: '200px' }}>
          <option value="">Alle vestigingen</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: '200px' }}>
          <option value="">Alle statussen</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
      ) : units.length === 0 ? (
        <p style={{ color: '#697687' }}>Geen voorraadeenheden gevonden.</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Kleur</th>
                <th>Vestiging</th>
                <th>VIN</th>
                <th>Status</th>
                <th>Verwacht</th>
                <th>Gereserveerd voor</th>
                {canManage && <th>Acties</th>}
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td style={{ fontWeight: 700 }}>{unit.vehicleName} {unit.vehicleModel}</td>
                  <td><ColorSwatch hex={unit.colorHex} name={unit.colorName} /></td>
                  <td>{unit.branchName || <span style={{ color: 'var(--muted-soft)' }}>—</span>}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{unit.vin || '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE_CLASS[unit.status]}`}>{STATUS_LABELS[unit.status]}</span></td>
                  <td>{unit.expectedArrival ? formatDate(unit.expectedArrival) : '—'}</td>
                  <td>{unit.reservedFor || '—'}</td>
                  {canManage && (
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-outline" onClick={() => setEditing(unit)}>Bewerken</button>
                        <button className="btn btn-danger" onClick={() => handleDelete(unit)}>Verwijderen</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <UnitFormModal
          unit={editing === 'new' ? null : editing}
          vehicles={vehicles}
          branches={branches}
          accessories={accessories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export default InventoryPage
