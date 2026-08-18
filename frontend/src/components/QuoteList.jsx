import React, { useEffect, useState } from 'react'
import { formatPrice, formatDate, api } from '../utils/api'
import { STATUS_LABELS, QUOTE_STATUSES, DISCOUNT_APPROVAL_STATUS_LABELS, DISCOUNT_APPROVAL_BADGE_CLASS } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import QuoteEditor from './QuoteEditor'

const LIMIT = 20
const EXPIRY_WARNING_DAYS = 7
const OPEN_STATUSES = ['draft', 'sent']

function expiryInfo(quote) {
  if (!OPEN_STATUSES.includes(quote.status) || !quote.expiresAt) return null
  const diffDays = Math.ceil((new Date(quote.expiresAt) - new Date()) / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return { label: 'Verlopen', tone: 'expired' }
  if (diffDays <= EXPIRY_WARNING_DAYS) return { label: diffDays === 0 ? 'Verloopt vandaag' : `Verloopt over ${diffDays}d`, tone: 'soon' }
  return { label: formatDate(quote.expiresAt), tone: 'normal' }
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
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [editingQuoteId, setEditingQuoteId] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getQuotes({ search, status, expiringSoon, page, limit: LIMIT })
      setQuotes(data.quotes)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setSelectedIds([])
    } catch (err) {
      setError('Kon offertes niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, status, search, expiringSoon]) // eslint-disable-line react-hooks/exhaustive-deps

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

    try {
      setLoading(true)
      await Promise.all(selectedIds.map((id) => api.deleteQuote(id)))
      await load()
    } catch (err) {
      alert('Verwijderen mislukt: ' + err.message)
      setLoading(false)
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
            disabled={expiringSoon}
            title={expiringSoon ? 'Niet beschikbaar terwijl "Verloopt binnenkort" actief is' : undefined}
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
              setStatus('')
              setPage(1)
            }}
          >
            Verloopt binnenkort
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
                    <td>
                      <div style={{ fontWeight: 700 }}>{quote.customerName}</div>
                      {quote.customerEmail && (
                        <div style={{ fontSize: '0.78rem', color: '#697687', marginTop: '4px' }}>{quote.customerEmail}</div>
                      )}
                    </td>
                    <td>{quote.configuration?.vehicleName} {quote.configuration?.vehicleModel}</td>
                    <td style={{ fontWeight: 800, color: '#122d4f' }}>{formatPrice(quote.totalPrice)}</td>
                    <td>
                      <span className={`badge ${quote.status}`}>{STATUS_LABELS[quote.status] || quote.status}</span>
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
                        <button className="btn btn-outline" onClick={() => setEditingQuoteId(quote.id)}>
                          Bewerken
                        </button>
                        <button className="btn btn-outline" onClick={() => handleDuplicate(quote.id)} disabled={busyIds.includes(quote.id)}>
                          Dupliceren
                        </button>
                        {quote.customerEmail && (
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
