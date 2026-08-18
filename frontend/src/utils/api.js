const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // response had no JSON body — keep the generic message
    }
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  // Auth
  async login(email, password) {
    return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  },
  async logout() {
    return request('/auth/logout', { method: 'POST' })
  },
  async me() {
    return request('/auth/me')
  },
  async changePassword(currentPassword, newPassword) {
    return request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
  },
  async forgotPassword(email) {
    return request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
  },
  async resetPassword(token, newPassword) {
    return request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) })
  },

  // Users (admin)
  async getUsers() {
    return request('/users')
  },
  async createUser(userData) {
    return request('/users', { method: 'POST', body: JSON.stringify(userData) })
  },
  async updateUser(id, userData) {
    return request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(userData) })
  },
  async deleteUser(id) {
    return request(`/users/${id}`, { method: 'DELETE' })
  },

  // Vehicles
  async getVehicles(includeInactive = false) {
    return request(`/vehicles${includeInactive ? '?all=true' : ''}`)
  },
  async getVehicle(id) {
    return request(`/vehicles/${id}`)
  },
  async createVehicle(vehicleData) {
    return request('/vehicles', { method: 'POST', body: JSON.stringify(vehicleData) })
  },
  async updateVehicle(id, vehicleData) {
    return request(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(vehicleData) })
  },

  // Accessories
  async getAccessories(includeInactive = false) {
    return request(`/accessories${includeInactive ? '?all=true' : ''}`)
  },
  async createAccessory(accessoryData) {
    return request('/accessories', { method: 'POST', body: JSON.stringify(accessoryData) })
  },
  async updateAccessory(id, accessoryData) {
    return request(`/accessories/${id}`, { method: 'PUT', body: JSON.stringify(accessoryData) })
  },
  async deleteAccessory(id) {
    return request(`/accessories/${id}`, { method: 'DELETE' })
  },

  // Quotes
  async createQuote(quoteData) {
    return request('/quotes', { method: 'POST', body: JSON.stringify(quoteData) })
  },
  async getQuotes({ search = '', status = '', expiringSoon = false, page = 1, limit = 25 } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (expiringSoon) params.set('expiringSoon', 'true')
    return request(`/quotes?${params.toString()}`)
  },
  async getQuote(id) {
    return request(`/quotes/${id}`)
  },
  async updateQuote(id, quoteData) {
    return request(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(quoteData) })
  },
  async deleteQuote(id) {
    return request(`/quotes/${id}`, { method: 'DELETE' })
  },
  async duplicateQuote(id) {
    return request(`/quotes/${id}/duplicate`, { method: 'POST' })
  },
  async sendQuoteEmail(id) {
    return request(`/quotes/${id}/send-email`, { method: 'POST' })
  },
  async approveDiscount(id) {
    return request(`/quotes/${id}/approve-discount`, { method: 'POST' })
  },
  async rejectDiscount(id) {
    return request(`/quotes/${id}/reject-discount`, { method: 'POST' })
  },
  quotesCsvUrl() {
    return `${API_BASE_URL}/quotes/export.csv`
  },

  // Pricing
  async calculatePricing(basePrice, accessoriesPrice, discountType, discountValue) {
    return request('/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({ basePrice, accessoriesPrice, discountType, discountValue }),
    })
  },
  async getDiscountTier(quantity) {
    return request(`/pricing/discount-tier/${quantity}`)
  },

  // PDF
  async generatePDF(quoteId) {
    const response = await fetch(`${API_BASE_URL}/pdf/${quoteId}`, { credentials: 'include' })
    if (!response.ok) throw new Error('Failed to generate PDF')
    return response.blob()
  },

  // Admin
  backupUrl() {
    return `${API_BASE_URL}/admin/backup`
  },

  // Reports
  async getReportsSummary({ from = '', to = '', branchId = '' } = {}) {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (branchId) params.set('branchId', branchId)
    const qs = params.toString()
    return request(`/reports/summary${qs ? `?${qs}` : ''}`)
  },

  // Branches
  async getBranches(includeInactive = false) {
    return request(`/branches${includeInactive ? '?all=true' : ''}`)
  },
  async createBranch(branchData) {
    return request('/branches', { method: 'POST', body: JSON.stringify(branchData) })
  },
  async updateBranch(id, branchData) {
    return request(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(branchData) })
  },

  // Audit log
  async getAuditLog({ entityType = '', entityId = '', page = 1, limit = 50 } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (entityType) params.set('entityType', entityType)
    if (entityId) params.set('entityId', entityId)
    return request(`/audit-log?${params.toString()}`)
  },

  // Imports (price lists / documents)
  async uploadImport(file) {
    const formData = new FormData()
    formData.append('file', file)
    // No Content-Type header here on purpose — the browser sets the multipart
    // boundary itself, which request()'s default JSON header would break.
    const response = await fetch(`${API_BASE_URL}/imports`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!response.ok) {
      let message = `Request failed (${response.status})`
      try {
        const data = await response.json()
        if (data?.error) message = data.error
      } catch {
        // no JSON body — keep the generic message
      }
      throw new Error(message)
    }
    return response.json()
  },
  async getImports({ page = 1, limit = 20 } = {}) {
    return request(`/imports?page=${page}&limit=${limit}`)
  },
  async applyImport(id, selectedIndexes) {
    return request(`/imports/${id}/apply`, { method: 'POST', body: JSON.stringify({ selectedIndexes }) })
  },
  async deleteImport(id) {
    return request(`/imports/${id}`, { method: 'DELETE' })
  },
  importDownloadUrl(id) {
    return `${API_BASE_URL}/imports/${id}/download`
  },
}

export function formatPrice(price) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat('nl-BE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString))
}
