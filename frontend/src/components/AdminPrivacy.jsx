import React, { useState } from 'react'
import { api, formatPrice, formatDate } from '../utils/api'
import { STATUS_LABELS } from '../utils/constants'

function AdminPrivacy() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const search = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    try {
      setLoading(true)
      setError('')
      setMessage('')
      const data = await api.gdprSearch(query.trim())
      setResults(data)
      setSelected([])
    } catch (err) {
      setError('Zoeken mislukt: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelected = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleAll = () => {
    if (!results) return
    setSelected(selected.length === results.length ? [] : results.map((r) => r.id))
  }

  const handleAnonymize = async () => {
    if (selected.length === 0) return
    if (!window.confirm(
      `Persoonsgegevens (naam, e-mail, telefoon, adres, BTW-nummer, opmerkingen) van ${selected.length} offerte(s) definitief wissen? ` +
      'Dit kan niet ongedaan gemaakt worden. Verkoopcijfers (model, prijs, status, datum) blijven bewaard voor rapportage.'
    )) return

    try {
      setLoading(true)
      setError('')
      await api.gdprAnonymize(selected)
      setMessage(`Persoonsgegevens van ${selected.length} offerte(s) verwijderd.`)
      const data = await api.gdprSearch(query.trim())
      setResults(data)
      setSelected([])
    } catch (err) {
      setError('Verwijderen mislukt: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Klantgegevens (GDPR)</h3>
      <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>
        Zoek alle offertes van een klant op naam, e-mail, telefoon, bedrijf of BTW-nummer om ze te exporteren
        (recht op gegevensoverdraagbaarheid) of hun persoonsgegevens definitief te wissen (recht op vergetelheid).
      </p>

      <form onSubmit={search} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Naam, e-mail, telefoon of BTW-nummer..."
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !query.trim()}>
          {loading ? 'Bezig...' : 'Zoeken'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
      {message && <div className="customer-history-notice">{message}</div>}

      {results && (
        results.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Geen offertes gevonden voor "{query}".</p>
        ) : (
          <>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={selected.length === results.length} onChange={toggleAll} />
                    </th>
                    <th>Klant</th>
                    <th>E-mail</th>
                    <th>Telefoon</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelected(r.id)} />
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.customerName}{r.customerCompany ? ` (${r.customerCompany})` : ''}</td>
                      <td>{r.customerEmail || '—'}</td>
                      <td>{r.customerPhone || '—'}</td>
                      <td>{r.vehicleLabel || '—'}</td>
                      <td>{STATUS_LABELS[r.status] || r.status}</td>
                      <td>{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="btn-group" style={{ marginTop: '16px' }}>
              <a
                className="btn btn-outline"
                href={selected.length ? api.gdprExportUrl(selected) : undefined}
                onClick={(e) => { if (!selected.length) e.preventDefault() }}
                aria-disabled={!selected.length}
              >
                Exporteer geselecteerde ({selected.length})
              </a>
              <button className="btn btn-danger" onClick={handleAnonymize} disabled={loading || selected.length === 0}>
                Verwijder persoonsgegevens ({selected.length})
              </button>
            </div>
          </>
        )
      )}
    </div>
  )
}

export default AdminPrivacy
