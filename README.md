# Geely Quotation System

Professional full-stack vehicle quotation system with React frontend, Express backend, SQLite database, and PDF generation. Belgium-focused with 21% VAT and professional Geely branding.

## Features

- 🚗 **Vehicle Catalog** - Manage Geely vehicles with specifications and pricing
- 📋 **Quote Builder** - Multi-step wizard for creating professional quotes
- 🛠️ **Accessories Management** - Add options and accessories with categorization
- 💰 **Smart Pricing** - Automatic price calculation with discount tiers
- 📊 **Discount System** - Volume-based and custom discount support
- 🇧🇪 **Belgium VAT** - Automatic 21% VAT calculation for Belgium
- 📄 **PDF Export** - Professional PDF quote generation with Geely branding
- 💾 **SQLite Database** - Lightweight, file-based data persistence
- 🎨 **Responsive Design** - Mobile-friendly, professional UI

## Project Structure

```
geely-quotation-system/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── server.js          # Main server entry point
│   │   ├── database/
│   │   │   └── init.js        # SQLite initialization & queries
│   │   ├── routes/
│   │   │   ├── vehicles.js    # Vehicle CRUD endpoints
│   │   │   ├── quotes.js      # Quote management endpoints
│   │   │   ├── pricing.js     # Pricing calculation endpoints
│   │   │   └── pdf.js         # PDF generation endpoint
│   │   └── utils/
│   │       └── pricing.js     # Pricing calculations & VAT logic
│   ├── package.json
│   ├── .env.example
│   └── data/
│       └── quotation.db       # SQLite database (auto-created)
│
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── main.jsx           # React entry point
│   │   ├── App.jsx            # Main app component
│   │   ├── App.css
│   │   ├── index.css          # Global styles
│   │   ├── components/
│   │   │   ├── Header.jsx     # Navigation header
│   │   │   ├── QuoteBuilder.jsx    # Main quote creation wizard
│   │   │   ├── VehicleSelector.jsx # Vehicle selection component
│   │   │   ├── AccessoriesSelector.jsx # Options selection
│   │   │   ├── PricingSummary.jsx # Price breakdown display
│   │   │   ├── CustomerForm.jsx   # Customer info form
│   │   │   └── QuoteList.jsx  # Quotes listing & PDF export
│   │   └── utils/
│   │       └── api.js         # API client & formatting utilities
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── package.json               # Root package.json with scripts
└── README.md
```

## Prerequisites

- Node.js 16+ and npm/yarn
- Modern web browser

## Installation

1. **Clone or extract the project**
```bash
cd "Geely Offerte"
```

2. **Install dependencies**
```bash
# Install root dependencies for concurrent development
npm install

# Install backend dependencies
npm --prefix backend install

# Install frontend dependencies
npm --prefix frontend install
```

## Running the Application

### Development Mode (Frontend + Backend)

Run both frontend and backend simultaneously:

```bash
npm run dev
```

This will start:
- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:3000

### Individual Services

**Backend only:**
```bash
npm run backend:dev
```

**Frontend only:**
```bash
npm run frontend:dev
```

### Production Build

```bash
# Build frontend
npm run build

# Run backend in production
npm run start
```

## Database

The SQLite database (`data/quotation.db`) is automatically created on first run with the following tables:

- **vehicles** - Vehicle catalog
- **quotes** - Quote records
- **quote_items** - Quote line items (accessories)
- **pricing_tiers** - Discount tier configuration

To reset the database, delete `backend/data/quotation.db` and restart the server.

## API Endpoints

### Vehicles
- `GET /api/vehicles` - List all active vehicles
- `GET /api/vehicles/:id` - Get vehicle details
- `POST /api/vehicles` - Create new vehicle (admin)

### Quotes
- `GET /api/quotes` - List all quotes
- `GET /api/quotes/:id` - Get quote details
- `POST /api/quotes` - Create new quote
- `PUT /api/quotes/:id` - Update quote

### Pricing
- `POST /api/pricing/calculate` - Calculate prices with VAT
- `GET /api/pricing/accessories` - List available accessories
- `GET /api/pricing/accessories/:category` - Get accessories by category

### PDF
- `GET /api/pdf/:quoteId` - Generate and download PDF quote

## Configuration

### Environment Variables

Create `backend/.env` from `.env.example`:

```env
PORT=5000
NODE_ENV=development
DATABASE_PATH=./data/quotation.db
```

### Default Accessories

Predefined accessory categories and prices (in `backend/src/utils/pricing.js`):

- **Comfort**: Sunroof, Leather seats, Premium audio
- **Performance**: Sport package
- **Tech**: Navigation, Tech package, Adaptive cruise
- **Safety**: Adaptive cruise control

## Pricing Logic

### Calculation Formula

```
Subtotal = Base Price + Accessories - Discount
VAT = Subtotal × 21%
Total = Subtotal + VAT
```

### Discount Tiers

Automatic discounts based on quantity:
- 3+ units: 5% discount
- 5+ units: 10% discount
- 10+ units: 15% discount

### Belgium VAT

All prices include 21% VAT (Standard Belgium rate).

## Features Overview

### Quote Builder Wizard

1. **Vehicle Selection** - Browse and select from available Geely models
2. **Accessories & Options** - Add comfort, performance, tech, and safety options
3. **Discount Configuration** - Apply custom or tier-based discounts
4. **Customer Information** - Enter customer details and notes
5. **Review & Submit** - Confirm and create the quote

### Quote Management

- View all created quotes
- Edit quote details and pricing
- Download professional PDF quotations
- Track quote status and expiration

### PDF Generation

Professional quotes include:
- Geely branding and header
- Vehicle specifications
- Itemized accessories
- Complete price breakdown with VAT
- 30-day validity notice
- Customer information

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Troubleshooting

### Backend won't start
- Ensure port 5000 is not in use
- Check Node.js version: `node --version`
- Delete `node_modules` and reinstall

### Frontend not connecting to backend
- Ensure backend is running on http://localhost:5000
- Check browser console for CORS errors
- Verify Vite proxy configuration in `vite.config.js`

### Database errors
- Delete `backend/data/quotation.db` to reset
- Check `backend/data/` folder has write permissions
- Review SQLite error in console

## Future Enhancements

- User authentication & role management
- Email integration for quote delivery
- Quote templates and customization
- Multi-language support
- Analytics and reporting
- Payment integration
- Customer portal

## License

Professional Geely Quotation System - All Rights Reserved

## Support

For issues or questions, contact the development team.
