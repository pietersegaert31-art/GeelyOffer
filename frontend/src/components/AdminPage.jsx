import React, { useState } from 'react'
import AdminVehicles from './AdminVehicles'
import AdminAccessories from './AdminAccessories'
import AdminUsers from './AdminUsers'
import AdminAuditLog from './AdminAuditLog'
import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const ALL_TABS = [
  { id: 'vehicles', label: 'Voertuigen', adminOnly: true },
  { id: 'accessories', label: 'Opties', adminOnly: false },
  { id: 'users', label: 'Gebruikers', adminOnly: true },
  { id: 'auditlog', label: 'Logboek', adminOnly: false },
]

function AdminPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
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
      {tab === 'users' && isAdmin && <AdminUsers />}
      {tab === 'auditlog' && <AdminAuditLog />}

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
