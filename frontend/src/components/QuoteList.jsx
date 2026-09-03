import React, { useEffect, useRef, useState } from 'react'
import { formatPrice, formatDate, formatQuoteNumber, api } from '../utils/api'
import { STATUS_LABELS, QUOTE_STATUSES, DISCOUNT_APPROVAL_STATUS_LABELS, DISCOUNT_APPROVAL_BADGE_CLASS } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import QuoteEditor from './QuoteEditor'

const LIMIT = 20
const EXPIRY_WARNING_DAYS = 7
const OPEN_STATUSES = ['draft', 'sent']
// Mirrors backend/src/routes/quotes.js's FOLLOWUP_REMINDER_DAYS exactly, so the badge
// shown here always agrees with what the "Vervolg nodig" filter actually returns.
const FOLLOWUP_REMINDER_DAYS = 5

function expiryInfo(quote) {
  if (!OPEN_STATUSES.includes(quote.status) || !quote.expiresAt) return null
  const diffDays = Math.ceil((new Date(quote.expiresAt) - new Date()) / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return { label: 'Verlopen', tone: 'expired' }
  if (diffDays <= EXPIRY_WARNING_DAYS) return { label: diffDays === 0 ? 'Verloopt vandaag' : `Verloopt over ${diffDays}d`, tone: 'soon' }
  return { label: formatDate(quote.expiresAt), tone: 'normal' }
}

function needsFollowupNow(quote) {
  if (quote.status !== 'sent' || !quote.sentAt) return false
  const daysSinceSent = (new Date() - new Date(quote.sentAt)) / (24 * 60 * 60 * 1000)
  return daysSinceSent >= FOLLOWUP_REMINDER_DAYS
}

// A showroomaanbieding is purged server-side ~2h after creation (see routes/quotes.js).
// Show the rep how long this one still has rather than the normal day-based expiry.
function showroomTimeLeft(quote) {
  const minutesLeft = Math.round((new Date(quote.createdAt).getTime() + 2 * 60 * 60 * 1000 - Date.now()) / 60000)
  if (minutesLeft <= 0) return 'Verdwijnt zo'
  if (minutesLeft < 60) return `Nog ${minutesLeft} min`
  return 'Nog ~2 u'
}

function QuoteList() {
  const { user } = useAuth()
  const canManageDiscounts = user.role === 'admin' || user.role === 'sales_manager'
  const [quotes, setQuotes] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [expiringSoon, setExpiringSoon] = useState(false)
  const [needsFollowup, setNeedsFollowup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [editingQuoteId, setEditingQuoteId] = useState(null)
  const [error, setError] = useState('')

  // Guards against a slower, stale response overwriting a newer one — e.g. rapidly
  // toggling the "Verloopt binnenkort"/"Vervolg nodig" filter pills fires overlapping
  // requests, and without this the one that resolves last (not the one matching the
  // currently-selected filter) would win. Same pattern as InventoryPage.jsx's load().
  const requestIdRef = useRef(0)
  const load = async () => {
    const requestId = ++requestIdRef.current
    try {
      setLoading(true)
      setError('')
      const data = await api.getQuotes({ search, status, expiringSoon, needsFollowup, page, limit: LIMIT })
      if (requestId !== requestIdRef.current) return
      setQuotes(data.quotes)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setSelectedIds([])
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError('Kon offertes niet laden: ' + err.message)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, status, search, expiringSoon, needsFollowup]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce the free-text search so we don't fire a request per keystroke
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1)
      setSearch(searchInput)
    }, 400)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const withBusy = async (id, action) => {
    setBusyIds((prev) => [...prev, id])
    try {
      await action()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusyIds((prev) => prev.filter((x) => x !== id))
    }
  }

  const handleDownloadPDF = (quoteId) => withBusy(quoteId, async () => {
    const blob = await api.generatePDF(quoteId)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quote-${quoteId}.pdf`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  })

  const handleDuplicate = (quoteId) => withBusy(quoteId, async () => {
    await api.duplicateQuote(quoteId)
    await load()
  })

  const handleSendEmail = (quoteId) => withBusy(quoteId, async () => {
    await api.sendQuoteEmail(quoteId)
    await load()
  })

  const handleApproveDiscount = (quoteId) => withBusy(quoteId, async () => {
    await api.approveDiscount(quoteId)
    await load()
  })

  const handleRejectDiscount = (quoteId) => withBusy(quoteId, async () => {
    await api.rejectDiscount(quoteId)
    await load()
  })

  const toggleSelected = (quoteId) => {
    setSelectedIds((prev) => (prev.includes(quoteId) ? prev.filter((id) => id !== quoteId) : [...prev, quoteId]))
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === quotes.length ? [] : quotes.map((q) => q.id)))
  }

  const handleDeleteSelected = async () => {
    const count = selectedIds.length
    if (count === 0) return
    const confirmed = window.confirm(
      count === 1 ? 'Deze offerte definitief verwijderen?' : `${count} offertes definitief verwijderen?`
    )
    if (!confirmed) return

    setLoading(true)
    // allSettled rather than all: a colleague's quote in the selection can 403 (only its
    // owner or a manager can delete it — see canModifyQuote in routes/quotes.js) while the
    // rest legitimately succeed. Promise.all would reject on that first failure and skip
    // the reload entirely, leaving the already-deleted rows still shown in the table until
    // a manual refresh (and a stale "Bewerken"/"PDF" click on one then 404s).
    const results = await Promise.allSettled(selectedIds.map((id) => api.deleteQuote(id)))
    const failures = results.filter((r) => r.status === 'rejected')
    await load()
    if (failures.length > 0) {
      alert(
        failures.length === results.length
          ? 'Verwijderen mislukt: ' + failures[0].reason.message
          : `${results.length - failures.length} van ${results.length} offertes verwijderd. ${failures.length} mislukt: ${failures[0].reason.message}`
      )
    }
  }

  const allSelected = quotes.length > 0 && selectedIds.length === quotes.length

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div>
            <div className="section-kicker">Overzicht</div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Offertes</h2>
          </div>
          <div className="btn-group" style={{ margin: 0 }}>
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={handleDeleteSelected} disabled={loading}>
                Verwijder geselecteerde ({selectedIds.length})
              </button>
            )}
            <a className="btn btn-outline" href={api.quotesCsvUrl()} target="_blank" rel="noreferrer">
              Exporteer CSV
            </a>
            <button className="btn btn-secondary" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        <div className="filter-row">
          <input
            type="text"
            placeholder="Zoek op klant, e-mail of bedrijf..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ maxWidth: '320px' }}
          />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            style={{ maxWidth: '200px' }}
            disabled={expiringSoon || needsFollowup}
            title={expiringSoon || needsFollowup ? 'Niet beschikbaar terwijl een andere filter actief is' : undefined}
          >
            <option value="">Alle statussen</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            type="button"
            className={`nav-pill ${expiringSoon ? 'active' : ''}`}
            onClick={() => {
              // Expiring-soon only ever matches draft/sent quotes, so an explicit status
              // filter for e.g. "accepted" would silently AND together into zero results.
              setExpiringSoon((prev) => !prev)
              setNeedsFollowup(false)
              setStatus('')
              setPage(1)
            }}
          >
            Verloopt binnenkort
          </button>
          <button
            type="button"
            className={`nav-pill ${needsFollowup ? 'active' : ''}`}
            onClick={() => {
              setNeedsFollowup((prev) => !prev)
              setExpiringSoon(false)
              setStatus('')
              setPage(1)
            }}
          >
            Vervolg nodig
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {quotes.length === 0 && !loading ? (
          <p style={{ color: '#697687' }}>Geen offertes gevonden.</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Selecteer alle offertes" />
                  </th>
                  <th>Nr.</th>
                  <th>Klant</th>
                  <th>Model</th>
                  <th>Totaal (incl. BTW)</th>
                  <th>Status</th>
                  <th>Verkoper</th>
                  <th>Datum</th>
                  <th>Vervalt</th>
                  <th>Acties</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className={selectedIds.includes(quote.id) ? 'row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(quote.id)}
                        onChange={() => toggleSelected(quote.id)}
                        aria-label={`Selecteer offerte van ${quote.customerName}`}
                      />
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#697687', whiteSpace: 'nowrap' }}>{formatQuoteNumber(quote)}</td>
                    <td>
                      {quote.isShowroom ? (
                        <span className="badge draft">Showroomaanbieding</span>
                      ) : (
                        <>
                          <div style={{ fontWeight: 700 }}>{quote.customerName}</div>
                          {quote.customerEmail && (
                            <div style={{ fontSize: '0.78rem', color: '#697687', marginTop: '4px' }}>{quote.customerEmail}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td>{quote.configuration?.vehicleName} {quote.configuration?.vehicleModel}</td>
                    <td style={{ fontWeight: 800, color: '#122d4f' }}>{formatPrice(quote.totalPrice)}</td>
                    <td>
                      <span className={`badge ${quote.status}`}>{STATUS_LABELS[quote.status] || quote.status}</span>
                      {quote.acceptedByName && (
                        <div style={{ marginTop: '5px', fontSize: '0.72rem', color: 'var(--muted)' }}>
                          Online bevestigd door {quote.acceptedByName}
                        </div>
                      )}
                      {needsFollowupNow(quote) && (
                        <div style={{ marginTop: '5px' }}>
                          <span className="badge expiry-soon">Vervolg nodig</span>
                        </div>
                      )}
                      {DISCOUNT_APPROVAL_STATUS_LABELS[quote.discountApprovalStatus] && (
                        <div style={{ marginTop: '5px' }}>
                          <span className={`badge ${DISCOUNT_APPROVAL_BADGE_CLASS[quote.discountApprovalStatus]}`}>
                            {DISCOUNT_APPROVAL_STATUS_LABELS[quote.discountApprovalStatus]}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#697687' }}>{quote.createdByName || '—'}</td>
                    <td>{formatDate(quote.createdAt)}</td>
                    <td>
                      {(() => {
                        if (quote.isShowroom) return <span className="badge expiry-soon">{showroomTimeLeft(quote)}</span>
                        const info = expiryInfo(quote)
                        if (!info) return <span style={{ color: 'var(--muted-soft)' }}>—</span>
                        if (info.tone === 'normal') return <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{info.label}</span>
                        return <span className={`badge ${info.tone === 'expired' ? 'declined' : 'expiry-soon'}`}>{info.label}</span>
                      })()}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-primary" onClick={() => handleDownloadPDF(quote.id)} disabled={busyIds.includes(quote.id)}>
                          PDF
                        </button>
                        {!quote.isShowroom && (
                          <>
                            <button className="btn btn-outline" onClick={() => setEditingQuoteId(quote.id)}>
                              Bewerken
                            </button>
                            <button className="btn btn-outline" onClick={() => handleDuplicate(quote.id)} disabled={busyIds.includes(quote.id)}>
                              Dupliceren
                            </button>
                          </>
                        )}
                        {!quote.isShowroom && quote.customerEmail && (
                          <button className="btn btn-outline" onClick={() => handleSendEmail(quote.id)} disabled={busyIds.includes(quote.id)}>
                            Mail
                          </button>
                        )}
                        {canManageDiscounts && ['pending', 'rejected'].includes(quote.discountApprovalStatus) && (
                          <>
                            <button className="btn btn-success" onClick={() => handleApproveDiscount(quote.id)} disabled={busyIds.includes(quote.id)}>
                              Korting goedkeuren
                            </button>
                            {quote.discountApprovalStatus !== 'rejected' && (
                              <button className="btn btn-danger" onClick={() => handleRejectDiscount(quote.id)} disabled={busyIds.includes(quote.id)}>
                                Weigeren
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
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
            <span>Pagina {page} van {totalPages} ({total} offertes)</span>
            <button className="btn btn-outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Volgende →
            </button>
          </div>
        )}
      </div>

      {editingQuoteId && (
        <QuoteEditor
          quoteId={editingQuoteId}
          onClose={() => setEditingQuoteId(null)}
          onSaved={() => { setEditingQuoteId(null); load() }}
        />
      )}
    </div>
  )
}

export default QuoteList
