import React, { useEffect, useRef, useState } from 'react'
import { api, formatPrice, formatDate } from '../utils/api'
import { STATUS_LABELS, INVENTORY_STATUS_LABELS, ROLE_LABELS } from '../utils/constants'

const LIMIT = 50

const ENTITY_TYPE_LABELS = {
  quote: 'Offerte',
  accessory: 'Optie',
  vehicle: 'Voertuig',
  inventory: 'Voorraad',
  user: 'Gebruiker',
}

const ACTION_LABELS = {
  discount_applied: 'Korting toegepast',
  discount_changed: 'Korting gewijzigd',
  discount_approved: 'Korting goedgekeurd',
  discount_rejected: 'Korting geweigerd',
  status_changed: 'Status gewijzigd',
  price_changed: 'Prijs gewijzigd',
  created: 'Aangemaakt',
  gdpr_anonymized: 'Persoonsgegevens verwijderd (GDPR)',
  accepted_online: 'Online bevestigd door klant',
  role_changed: 'Rol gewijzigd',
  password_reset: 'Wachtwoord gereset',
  deleted: 'Verwijderd',
}

// Human-readable field names for gdpr_anonymized's fieldsCleared list (see gdpr.js) — falls
// back to the raw field name for anything not listed, rather than hiding it.
const FIELD_LABELS = {
  customerName: 'naam',
  customerEmail: 'e-mail',
  customerPhone: 'telefoon',
  customerCompany: 'bedrijfsnaam',
  customerVatNumber: 'BTW-nummer',
  customerStreet: 'straat',
  customerPostalCode: 'postcode',
  customerCity: 'gemeente',
  notes: 'opmerkingen',
  acceptedByName: 'naam (online bevestiging)',
  reservedFor: 'gereserveerd voor',
}

function fmtDiscount(d) {
  if (!d) return '—'
  return d.type === 'fixed' ? formatPrice(d.value) : `${d.value}%`
}

function describeDetails(entry) {
  const d = entry.details || {}
  const statusLabels = entry.entityType === 'inventory' ? INVENTORY_STATUS_LABELS : STATUS_LABELS
  switch (entry.action) {
    case 'discount_applied':
    case 'discount_approved':
    case 'discount_rejected':
      return d.discountType === 'fixed' ? formatPrice(d.discountValue) : `${d.discountValue}%`
    case 'discount_changed':
      return `${fmtDiscount(d.from)} → ${fmtDiscount(d.to)}`
    case 'status_changed':
      // Users log {name, active} — a single new state, not a from→to pair like quotes and
      // inventory — since "active" toggling has no in-between states worth showing.
      if (entry.entityType === 'user') {
        return `${d.name || ''}: ${d.active ? 'Actief' : 'Inactief'}`
      }
      return `${statusLabels[d.from] || d.from} → ${statusLabels[d.to] || d.to}`
    case 'price_changed':
      return `${d.name || ''}: ${formatPrice(d.from)} → ${formatPrice(d.to)}`
    case 'created':
      // Inventory's 'created' details carry {vehicle, status} (see inventory.js), and a
      // user's carry {name, email, role} (see users.js) — different shapes than the
      // {name, price} every other entity type logs. Without branching on entityType these
      // fell through to `d.name`/`d.price`, rendering a blank or wrong Details cell.
      if (entry.entityType === 'inventory') {
        return `${d.vehicle || ''}${d.status ? ` (${statusLabels[d.status] || d.status})` : ''}`
      }
      if (entry.entityType === 'user') {
        return `${d.name || ''} (${d.email || ''}${d.role ? `, ${ROLE_LABELS[d.role] || d.role}` : ''})`
      }
      return `${d.name || ''}${d.price !== undefined ? ` (${formatPrice(d.price)})` : ''}`
    case 'role_changed':
      return `${d.name || ''}: ${ROLE_LABELS[d.from] || d.from} → ${ROLE_LABELS[d.to] || d.to}`
    case 'password_reset':
      return d.name || '—'
    case 'deleted':
      return `${d.name || ''}${d.email ? ` (${d.email})` : ''}`
    case 'gdpr_anonymized':
      return d.fieldsCleared?.length
        ? `Gewist: ${d.fieldsCleared.map((f) => FIELD_LABELS[f] || f).join(', ')}`
        : 'Persoonsgegevens gewist'
    case 'accepted_online':
      return `Bevestigd door: ${d.acceptedByName || '—'}`
    default:
      return d && Object.keys(d).length ? JSON.stringify(d) : '—'
  }
}

function AdminAuditLog() {
  const [entries, setEntries] = useState([])
  const [entityType, setEntityType] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Guards against a slower, stale response overwriting a newer one — switching the
  // entityType filter or paging quickly can otherwise let an older request resolve after
  // a newer one and show entries that don't match the currently-selected filter.
  const requestIdRef = useRef(0)
  const load = async () => {
    const requestId = ++requestIdRef.current
    try {
      setLoading(true)
      setError('')
      const data = await api.getAuditLog({ entityType, page, limit: LIMIT })
      if (requestId !== requestIdRef.current) return
      setEntries(data.entries)
      setTotalPages(data.totalPages)
      setTotal(data.total)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError('Kon logboek niet laden: ' + err.message)
    } finally {
      if (requestId !== requestIdRef.current) return
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [entityType, page]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Logboek</h3>
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1) }}
          style={{ maxWidth: '220px' }}
        >
          <option value="">Alle wijzigingen</option>
          <option value="quote">Offertes</option>
          <option value="accessory">Opties</option>
          <option value="vehicle">Voertuigen</option>
          <option value="inventory">Voorraad</option>
          <option value="user">Gebruikers</option>
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Nog geen wijzigingen geregistreerd.</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Door</th>
                <th>Type</th>
                <th>Actie</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatDate(entry.createdAt)}</td>
                  <td>{entry.performedByName || '—'}</td>
                  <td>{ENTITY_TYPE_LABELS[entry.entityType] || entry.entityType}</td>
                  <td>{ACTION_LABELS[entry.action] || entry.action}</td>
                  <td style={{ fontSize: '0.85rem' }}>{describeDetails(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ← Vorige
          </button>
          <span>Pagina {page} van {totalPages} ({total} wijzigingen)</span>
          <button className="btn btn-outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Volgende →
          </button>
        </div>
      )}
    </div>
  )
}

export default AdminAuditLog
