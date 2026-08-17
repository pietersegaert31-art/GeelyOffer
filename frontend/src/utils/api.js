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
  async getQuotes({ search = '', status = '', page = 1, limit = 25 } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    if (status) params.set('status', status)
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
  quotesCsvUrl() {
    return `${API_BASE_URL}/quotes/export.csv`
  },

  // Pricing
  async calculatePricing(basePrice, accessoriesPrice, discountPercentage) {
    return request('/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({ basePrice, accessoriesPrice, discountPercentage }),
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
