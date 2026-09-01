import React, { useState } from 'react'
import AdminVehicles from './AdminVehicles'
import AdminAccessories from './AdminAccessories'
import AdminUsers from './AdminUsers'
import AdminAuditLog from './AdminAuditLog'
import AdminImports from './AdminImports'
import AdminBranches from './AdminBranches'
import AdminPrivacy from './AdminPrivacy'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const ALL_TABS = [
  { id: 'vehicles', label: 'Voertuigen', adminOnly: true },
  { id: 'accessories', label: 'Opties', adminOnly: false },
  { id: 'branches', label: 'Vestigingen', adminOnly: true },
  { id: 'users', label: 'Gebruikers', adminOnly: true },
  // Both gated admin-only to match the backend: imports.js and auditLog.js's entire
  // router (including the read-only GET) is behind requireManager, so a plain 'sales'
  // account seeing these tabs got nothing but a permanent 403 error banner on click. The
  // content itself (import/pricing history, and now user account changes in the audit
  // log) is also management-facing info, not something to open up to every rep instead.
  { id: 'imports', label: 'Import', adminOnly: true },
  { id: 'auditlog', label: 'Logboek', adminOnly: true },
  { id: 'privacy', label: 'Privacy', adminOnly: true },
]

function AdminPage() {
  const { user } = useAuth()
  // Sales managers have full admin-equivalent access by business decision (see
  // backend/src/middleware/auth.js requireAdmin) — this mirrors that on the frontend so
  // they can actually reach the screens the backend already lets them use.
  const isAdmin = user.role === 'admin' || user.role === 'sales_manager'
  const tabs = ALL_TABS.filter((t) => isAdmin || !t.adminOnly)
  const [tab, setTab] = useState(isAdmin ? 'vehicles' : 'accessories')

  return (
    <div>
      <div className="card">
        <div className="section-kicker">Beheer</div>
        <h2 className="section-title" style={{ marginBottom: '16px' }}>Instellingen</h2>

        <div className="admin-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-pill ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'vehicles' && isAdmin && <AdminVehicles />}
      {tab === 'accessories' && <AdminAccessories />}
      {tab === 'branches' && isAdmin && <AdminBranches />}
      {tab === 'users' && isAdmin && <AdminUsers />}
      {tab === 'imports' && isAdmin && <AdminImports />}
      {tab === 'auditlog' && isAdmin && <AdminAuditLog />}
      {tab === 'privacy' && isAdmin && <AdminPrivacy />}

      {isAdmin && (
        <div className="card">
          <div className="section-kicker">Data</div>
          <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Back-up</h3>
          <p style={{ color: 'var(--muted)', marginBottom: '14px' }}>
            Download een kopie van de volledige database (alle offertes, voertuigen, opties en gebruikers).
          </p>
          <a className="btn btn-outline" href={api.backupUrl()}>Download back-up</a>
        </div>
      )}
    </div>
  )
}

export default AdminPage
