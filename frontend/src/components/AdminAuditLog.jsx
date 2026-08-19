import React, { useEffect, useState } from 'react'
import { api, formatPrice, formatDate } from '../utils/api'
import { STATUS_LABELS } from '../utils/constants'

const LIMIT = 50

const ENTITY_TYPE_LABELS = {
  quote: 'Offerte',
  accessory: 'Optie',
  vehicle: 'Voertuig',
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
}

function fmtDiscount(d) {
  if (!d) return '—'
  return d.type === 'fixed' ? formatPrice(d.value) : `${d.value}%`
}

function describeDetails(entry) {
  const d = entry.details || {}
  switch (entry.action) {
    case 'discount_applied':
    case 'discount_approved':
    case 'discount_rejected':
      return d.discountType === 'fixed' ? formatPrice(d.discountValue) : `${d.discountValue}%`
    case 'discount_changed':
      return `${fmtDiscount(d.from)} → ${fmtDiscount(d.to)}`
    case 'status_changed':
      return `${STATUS_LABELS[d.from] || d.from} → ${STATUS_LABELS[d.to] || d.to}`
    case 'price_changed':
      return `${d.name || ''}: ${formatPrice(d.from)} → ${formatPrice(d.to)}`
    case 'created':
      return `${d.name || ''}${d.price !== undefined ? ` (${formatPrice(d.price)})` : ''}`
    case 'gdpr_anonymized':
      return 'Naam, contactgegevens, adres en opmerkingen gewist'
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

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getAuditLog({ entityType, page, limit: LIMIT })
      setEntries(data.entries)
      setTotalPages(data.totalPages)
      setTotal(data.total)
    } catch (err) {
      setError('Kon logboek niet laden: ' + err.message)
    } finally {
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
