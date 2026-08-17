import React, { useState } from 'react'
import AdminVehicles from './AdminVehicles'
import AdminAccessories from './AdminAccessories'
import AdminUsers from './AdminUsers'
import { api } from '../utils/api'

const TABS = [
  { id: 'vehicles', label: 'Voertuigen' },
  { id: 'accessories', label: 'Opties' },
  { id: 'users', label: 'Gebruikers' },
]

function AdminPage() {
  const [tab, setTab] = useState('vehicles')

  return (
    <div>
      <div className="card">
        <div className="section-kicker">Beheer</div>
        <h2 className="section-title" style={{ marginBottom: '16px' }}>Instellingen</h2>

        <div className="admin-tabs">
          {TABS.map((t) => (
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

      {tab === 'vehicles' && <AdminVehicles />}
      {tab === 'accessories' && <AdminAccessories />}
      {tab === 'users' && <AdminUsers />}

      <div className="card">
        <div className="section-kicker">Data</div>
        <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Back-up</h3>
        <p style={{ color: 'var(--muted)', marginBottom: '14px' }}>
          Download een kopie van de volledige database (alle offertes, voertuigen, opties en gebruikers).
        </p>
        <a className="btn btn-outline" href={api.backupUrl()}>Download back-up</a>
      </div>
    </div>
  )
}

export default AdminPage
