import React, { useState } from 'react'
import Header from './components/Header'
import QuoteBuilder from './components/QuoteBuilder'
import QuoteList from './components/QuoteList'
import LoginPage from './components/LoginPage'
import ResetPasswordPage from './components/ResetPasswordPage'
import AcceptQuotePage from './components/AcceptQuotePage'
import AdminPage from './components/AdminPage'
import ReportsPage from './components/ReportsPage'
import InventoryPage from './components/InventoryPage'
import ChangePasswordModal from './components/ChangePasswordModal'
import { useAuth } from './context/AuthContext'
import './App.css'

function App() {
  const { user, loading, setUser } = useAuth()
  const [currentPage, setCurrentPage] = useState('builder') // 'builder' | 'quotes' | 'reports' | 'admin'
  const [quotesRefreshKey, setQuotesRefreshKey] = useState(0)

  const resetToken = new URLSearchParams(window.location.search).get('resetToken')
  if (resetToken) {
    return <ResetPasswordPage token={resetToken} />
  }

  const acceptQuoteToken = new URLSearchParams(window.location.search).get('acceptQuote')
  if (acceptQuoteToken) {
    return <AcceptQuotePage token={acceptQuoteToken} />
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  if (user.mustChangePassword) {
    return <ChangePasswordModal forced onSuccess={(updatedUser) => setUser(updatedUser)} />
  }

  const handleQuoteCreated = () => {
    setQuotesRefreshKey((key) => key + 1)
    setCurrentPage('quotes')
  }

  const canSeeReports = user.role === 'admin' || user.role === 'sales_manager'
  const canSeeAdmin = user.role === 'admin' || user.role === 'sales_manager'
  let page = currentPage
  if (page === 'admin' && !canSeeAdmin) page = 'builder'
  if (page === 'reports' && !canSeeReports) page = 'builder'

  return (
    <div className="app">
      <Header currentPage={page} onPageChange={setCurrentPage} />
      <main className="container">
        {page === 'builder' && (
          <QuoteBuilder onQuoteCreated={handleQuoteCreated} />
        )}
        {page === 'quotes' && (
          <QuoteList key={quotesRefreshKey} />
        )}
        {page === 'inventory' && (
          <InventoryPage />
        )}
        {page === 'reports' && canSeeReports && (
          <ReportsPage />
        )}
        {page === 'admin' && canSeeAdmin && (
          <AdminPage />
        )}
      </main>
    </div>
  )
}

export default App
