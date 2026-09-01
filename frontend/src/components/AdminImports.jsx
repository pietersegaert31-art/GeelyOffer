import React, { useEffect, useRef, useState } from 'react'
import { api, formatPrice, formatDate } from '../utils/api'

const KIND_LABELS = { spreadsheet: 'Prijslijst', document: 'Document' }
const STATUS_LABELS = { uploaded: 'Nog te verwerken', applied: 'Toegepast' }

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ImportPreview({ imp, onApplied }) {
  const [selected, setSelected] = useState(() => new Set(imp.proposedChanges?.map((_, i) => i) || []))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const toggle = (i) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleApply = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`${selected.size} prijswijziging(en) doorvoeren? Dit past de echte prijzen in het systeem aan.`)) return
    try {
      setApplying(true)
      setError('')
      const result = await api.applyImport(imp.id, [...selected])
      // A partial failure no longer throws (see routes/imports.js) — the request itself
      // succeeds with a per-row breakdown, so a failed row's price is worth surfacing here
      // rather than looking like everything went through.
      if (result.failed > 0) {
        setError(`${result.applied} van ${result.applied + result.failed} prijswijziging(en) doorgevoerd. Mislukt: ${result.failures.map((f) => `${f.label} (${f.error})`).join(', ')}`)
      }
      onApplied()
    } catch (err) {
      setError(err.message)
    } finally {
      setApplying(false)
    }
  }

  if (imp.parseError) {
    return <div className="error">Kon bestand niet lezen: {imp.parseError}</div>
  }

  if (imp.kind === 'document') {
    return (
      <p style={{ color: 'var(--muted)' }}>
        Dit bestandstype wordt niet automatisch uitgelezen. Download het document en werk prijzen indien nodig handmatig bij via Voertuigen/Opties.
      </p>
    )
  }

  const changes = imp.proposedChanges || []
  const unmatched = imp.unmatchedRows || []

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {changes.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Geen prijswijzigingen gedetecteerd — alle herkende rijen komen al overeen met de huidige prijzen.</p>
      ) : (
        <>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={selected.size === changes.length}
                      onChange={() => setSelected(selected.size === changes.length ? new Set() : new Set(changes.map((_, i) => i)))}
                      aria-label="Selecteer alle wijzigingen"
                    />
                  </th>
                  <th>Type</th>
                  <th>Naam</th>
                  <th>Huidige prijs</th>
                  <th>Nieuwe prijs</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change, i) => (
                  <tr key={i}>
                    <td><input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} disabled={imp.status === 'applied'} /></td>
                    <td>{change.type === 'vehicle' ? 'Voertuig' : 'Optie'}</td>
                    <td style={{ fontWeight: 700 }}>{change.label}</td>
                    <td>{formatPrice(change.currentPrice)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{formatPrice(change.newPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {imp.status !== 'applied' && (
            <div className="btn-group" style={{ marginTop: '14px' }}>
              <button className="btn btn-success" onClick={handleApply} disabled={applying || selected.size === 0}>
                {applying ? 'Bezig...' : `${selected.size} wijziging(en) toepassen`}
              </button>
            </div>
          )}
        </>
      )}

      {unmatched.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div className="section-kicker">Niet herkend ({unmatched.length})</div>
          <ul style={{ margin: '8px 0 0 18px', fontSize: '0.82rem', color: 'var(--muted)' }}>
            {unmatched.slice(0, 20).map((row, i) => (
              <li key={i}>
                {row.name}{row.variant ? ` (${row.variant})` : ''} — {row.reason}
              </li>
            ))}
            {unmatched.length > 20 && <li>... en {unmatched.length - 20} meer</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function AdminImports() {
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const fileInputRef = useRef(null)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getImports()
      setImports(data.imports)
    } catch (err) {
      setError('Kon imports niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      setError('')
      const created = await api.uploadImport(file)
      setExpandedId(created.id)
      await load()
    } catch (err) {
      setError('Upload mislukt: ' + err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (imp) => {
    if (!window.confirm(`"${imp.filename}" verwijderen?`)) return
    try {
      await api.deleteImport(imp.id)
      if (expandedId === imp.id) setExpandedId(null)
      load()
    } catch (err) {
      alert('Verwijderen mislukt: ' + err.message)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 0 }}>Prijslijsten &amp; documenten</h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xlsx,.csv"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ fontSize: '0.82rem' }}
          />
        </div>
      </div>
      <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>
        Upload een Excel (.xlsx) of CSV-prijslijst om automatisch prijswijzigingen te laten herkennen — je krijgt altijd eerst een overzicht om te controleren voor er iets wordt toegepast.
        PDF- en Word-documenten (bv. kortingsvoorwaarden) worden enkel bewaard als naslagwerk.
      </p>
      {uploading && <p style={{ color: 'var(--muted)' }}>Bestand wordt geüpload en gelezen...</p>}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
      ) : imports.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Nog geen bestanden geüpload.</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bestand</th>
                <th>Type</th>
                <th>Status</th>
                <th>Door</th>
                <th>Datum</th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <React.Fragment key={imp.id}>
                  <tr>
                    <td style={{ fontWeight: 700 }}>
                      {imp.filename}
                      <div style={{ fontWeight: 400, fontSize: '0.76rem', color: 'var(--muted-soft)' }}>{formatFileSize(imp.fileSize)}</div>
                    </td>
                    <td>{KIND_LABELS[imp.kind] || imp.kind}</td>
                    <td>
                      <span className={`badge ${imp.status === 'applied' ? 'accepted' : 'expiry-soon'}`}>
                        {STATUS_LABELS[imp.status] || imp.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{imp.uploadedByName || '—'}</td>
                    <td>{formatDate(imp.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        {imp.kind === 'spreadsheet' && !imp.parseError && (
                          <button className="btn btn-outline" onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)}>
                            {expandedId === imp.id ? 'Verbergen' : 'Bekijken'}
                          </button>
                        )}
                        <a className="btn btn-outline" href={api.importDownloadUrl(imp.id)}>Download</a>
                        <button className="btn btn-danger" onClick={() => handleDelete(imp)}>Verwijderen</button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === imp.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--panel-soft)' }}>
                        <ImportPreview imp={imp} onApplied={() => { load() }} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminImports
