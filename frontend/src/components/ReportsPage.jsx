import React, { useEffect, useState } from 'react'
import { api, formatPrice } from '../utils/api'

function formatPercent(ratio) {
  if (ratio === null || ratio === undefined) return '—'
  return `${Math.round(ratio * 100)}%`
}

// goodDirection: whether an increase in this metric is good news or bad news
function computeDelta(curr, prev, goodDirection = 'up') {
  if (prev === 0 && curr === 0) return null
  if (prev === 0) {
    return { text: 'nieuw', tone: goodDirection === 'up' ? 'good' : 'bad' }
  }
  const pct = Math.round(((curr - prev) / prev) * 100)
  if (pct === 0) return { text: '±0%', tone: 'neutral' }
  const up = pct > 0
  const tone = (up && goodDirection === 'up') || (!up && goodDirection === 'down') ? 'good' : 'bad'
  return { text: `${up ? '+' : ''}${pct}%`, tone }
}

function StatTile({ label, value, delta }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta && <div className={`stat-delta stat-delta-${delta.tone}`}>{delta.text} t.o.v. vorige maand</div>}
    </div>
  )
}

function ReportsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      setSummary(await api.getReportsSummary({ from, to }))
    } catch (err) {
      setError('Kon rapport niet laden: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const trend = summary?.monthlyTrend

  return (
    <div>
      {trend && (
        <div className="card">
          <div className="section-kicker">Trend</div>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>Deze maand vs vorige maand</h2>
          <div className="stat-grid">
            <StatTile
              label="Offertes deze maand"
              value={trend.current.total}
              delta={computeDelta(trend.current.total, trend.previous.total, 'up')}
            />
            <StatTile
              label="Verkocht deze maand"
              value={trend.current.accepted}
              delta={computeDelta(trend.current.accepted, trend.previous.accepted, 'up')}
            />
            <StatTile
              label="Niet doorgegaan deze maand"
              value={trend.current.declined}
              delta={computeDelta(trend.current.declined, trend.previous.declined, 'down')}
            />
            <StatTile
              label="Omzet deze maand"
              value={formatPrice(trend.current.acceptedValue)}
              delta={computeDelta(trend.current.acceptedValue, trend.previous.acceptedValue, 'up')}
            />
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-kicker">Rapporten</div>
        <h2 className="section-title" style={{ marginBottom: '16px' }}>Verkoopoverzicht</h2>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Van</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tot</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>Filteren</button>
          <a className="btn btn-outline" href={api.quotesCsvUrl()} style={{ marginLeft: 'auto' }}>Exporteer alle offertes (CSV)</a>
        </div>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <div className="loading" style={{ minHeight: '120px' }}><div className="spinner" /></div>
        ) : summary && (
          <>
            <div className="stat-grid">
              <StatTile label="Totaal offertes" value={summary.totals.total} />
              <StatTile label="Verkocht" value={summary.totals.accepted} />
              <StatTile label="Niet doorgegaan" value={summary.totals.declined} />
              <StatTile label="Nog open (concept/verzonden)" value={summary.totals.draft + summary.totals.sent} />
              <StatTile label="Sluitingsratio" value={formatPercent(summary.closeRate)} />
              <StatTile label="Omzet verkocht" value={formatPrice(summary.acceptedValue)} />
            </div>

            <h3 className="section-title" style={{ fontSize: '1.1rem', marginTop: '28px' }}>Per verkoper</h3>
            {summary.bySalesperson.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Nog geen offertes in deze periode.</p>
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Verkoper</th>
                      <th>Aantal offertes</th>
                      <th>Verkocht</th>
                      <th>Niet doorgegaan</th>
                      <th>Sluitingsratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.bySalesperson.map((s) => (
                      <tr key={s.id || s.name}>
                        <td style={{ fontWeight: 700 }}>{s.name}</td>
                        <td>{s.total}</td>
                        <td>{s.accepted}</td>
                        <td>{s.declined}</td>
                        <td>{formatPercent(s.closeRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="section-title" style={{ fontSize: '1.1rem', marginTop: '28px' }}>Meest geconfigureerde modellen</h3>
            {summary.topModels.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Nog geen offertes in deze periode.</p>
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Aantal offertes</th>
                      <th>Totale waarde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topModels.map((m) => (
                      <tr key={m.model}>
                        <td style={{ fontWeight: 700 }}>{m.model}</td>
                        <td>{m.count}</td>
                        <td>{formatPrice(m.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ReportsPage
