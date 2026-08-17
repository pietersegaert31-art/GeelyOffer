import React from 'react'
import geelyLogo from '../assets/geely-logo.png'
import { useAuth } from '../context/AuthContext'

function Header({ currentPage, onPageChange }) {
  const { user, logout } = useAuth()

  return (
    <header className="page-header">
      <div className="container header-inner">
        <div className="brand-wrap">
          <img src={geelyLogo} alt="Geely" className="brand-logo" />
          <span className="brand-divider" />
          <span className="brand-subtitle">Sales &amp; Quote Hub</span>
        </div>

        <nav className="top-nav" aria-label="Main navigation">
          <button
            className={`nav-pill ${currentPage === 'builder' ? 'active' : ''}`}
            onClick={() => onPageChange('builder')}
          >
            Nieuwe offerte
          </button>
          <button
            className={`nav-pill ${currentPage === 'quotes' ? 'active' : ''}`}
            onClick={() => onPageChange('quotes')}
          >
            Offertes overzicht
          </button>
          {user?.role === 'admin' && (
            <button
              className={`nav-pill ${currentPage === 'admin' ? 'active' : ''}`}
              onClick={() => onPageChange('admin')}
            >
              Beheer
            </button>
          )}

          <span className="user-menu">
            <span className="user-name">{user?.name}</span>
            <button className="btn btn-outline user-logout" onClick={logout}>
              Uitloggen
            </button>
          </span>
        </nav>
      </div>
    </header>
  )
}

export default Header
