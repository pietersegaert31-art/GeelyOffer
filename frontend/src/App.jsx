import React, { useState } from 'react'
import Header from './components/Header'
import QuoteBuilder from './components/QuoteBuilder'
import QuoteList from './components/QuoteList'
import LoginPage from './components/LoginPage'
import AdminPage from './components/AdminPage'
import { useAuth } from './context/AuthContext'
import './App.css'

function App() {
  const { user, loading } = useAuth()
  const [currentPage, setCurrentPage] = useState('builder') // 'builder' | 'quotes' | 'admin'
  const [quotesRefreshKey, setQuotesRefreshKey] = useState(0)

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

  const handleQuoteCreated = () => {
    setQuotesRefreshKey((key) => key + 1)
    setCurrentPage('quotes')
  }

  const page = currentPage === 'admin' && user.role !== 'admin' ? 'builder' : currentPage

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
        {page === 'admin' && user.role === 'admin' && (
          <AdminPage />
        )}
      </main>
    </div>
  )
}

export default App
