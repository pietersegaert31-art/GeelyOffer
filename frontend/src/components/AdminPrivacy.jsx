import React, { useState } from 'react'
import { api, formatDate } from '../utils/api'
import { STATUS_LABELS, INVENTORY_STATUS_LABELS } from '../utils/constants'

function AdminPrivacy() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState([])
  const [selectedInventory, setSelectedInventory] = useState([])
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
      setSelectedInventory([])
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
    setSelected(selected.length === results.quotes.length ? [] : results.quotes.map((r) => r.id))
  }

  const toggleSelectedInventory = (id) => {
    setSelectedInventory((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleAllInventory = () => {
    if (!results) return
    setSelectedInventory(selectedInventory.length === results.inventoryMatches.length ? [] : results.inventoryMatches.map((r) => r.id))
  }

  const refresh = async () => {
    // Its own try/catch — this used to share the caller's, so a re-search that failed
    // after a successful (and irreversible) anonymize got mislabeled as "Verwijderen
    // mislukt", showing a success and a failure message together and implying the erasure
    // itself needed retrying when it had already gone through.
    try {
      const data = await api.gdprSearch(query.trim())
      setResults(data)
      setSelected([])
      setSelectedInventory([])
    } catch (err) {
      setError('Herladen van de resultaten mislukt: ' + err.message)
    }
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
    } catch (err) {
      setError('Verwijderen mislukt: ' + err.message)
      return
    } finally {
      setLoading(false)
    }
    await refresh()
  }

  const handleAnonymizeInventory = async () => {
    if (selectedInventory.length === 0) return
    if (!window.confirm(
      `De naam/referentie in "Gereserveerd voor" van ${selectedInventory.length} voorraadeenhe(i)d(en) definitief wissen? ` +
      'Dit kan niet ongedaan gemaakt worden.'
    )) return

    try {
      setLoading(true)
      setError('')
      await api.gdprAnonymizeInventory(selectedInventory)
      setMessage(`Reservering van ${selectedInventory.length} voorraadeenhe(i)d(en) gewist.`)
    } catch (err) {
      setError('Verwijderen mislukt: ' + err.message)
      return
    } finally {
      setLoading(false)
    }
    await refresh()
  }

  const hasResults = results && (results.quotes.length > 0 || results.inventoryMatches.length > 0)

  return (
    <div className="card">
      <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Klantgegevens (GDPR)</h3>
      <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>
        Zoek alle offertes van een klant op naam, e-mail, telefoon, bedrijf of BTW-nummer om ze te exporteren
        (recht op gegevensoverdraagbaarheid) of hun persoonsgegevens definitief te wissen (recht op vergetelheid).
        Doorzoekt ook het "Gereserveerd voor"-veld in de voorraad, waar een klantnaam los van een offerte kan
        blijven staan.
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
        !hasResults ? (
          <p style={{ color: 'var(--muted)' }}>Geen offertes of voorraadeenheden gevonden voor "{query}".</p>
        ) : (
          <>
            {results.quotes.length > 0 && (
              <>
                <h4 className="section-title" style={{ fontSize: '0.95rem', marginBottom: '10px' }}>Offertes</h4>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>
                          <input type="checkbox" checked={selected.length === results.quotes.length} onChange={toggleAll} />
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
                      {results.quotes.map((r) => (
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

                <div className="btn-group" style={{ marginTop: '16px', marginBottom: '28px' }}>
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
            )}

            {results.inventoryMatches.length > 0 && (
              <>
                <h4 className="section-title" style={{ fontSize: '0.95rem', marginBottom: '10px' }}>
                  Voorraad — "Gereserveerd voor"
                </h4>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>
                          <input type="checkbox" checked={selectedInventory.length === results.inventoryMatches.length} onChange={toggleAllInventory} />
                        </th>
                        <th>Model</th>
                        <th>Gereserveerd voor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.inventoryMatches.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <input type="checkbox" checked={selectedInventory.includes(r.id)} onChange={() => toggleSelectedInventory(r.id)} />
                          </td>
                          <td style={{ fontWeight: 700 }}>{r.vehicleName} {r.vehicleModel}</td>
                          <td>{r.reservedFor}</td>
                          <td>{INVENTORY_STATUS_LABELS[r.status] || r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="btn-group" style={{ marginTop: '16px' }}>
                  <button className="btn btn-danger" onClick={handleAnonymizeInventory} disabled={loading || selectedInventory.length === 0}>
                    Wis reservering ({selectedInventory.length})
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}
    </div>
  )
}

export default AdminPrivacy
