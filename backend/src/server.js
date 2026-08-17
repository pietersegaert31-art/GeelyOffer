import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database/init.js';
import quotesRouter from './routes/quotes.js';
import vehiclesRouter from './routes/vehicles.js';
import accessoriesRouter from './routes/accessories.js';
import pricingRouter from './routes/pricing.js';
import pdfRouter from './routes/pdf.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import adminRouter from './routes/admin.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  console.error(
    'FATAL: JWT_SECRET is not set. Refusing to start in production without a fixed session secret ' +
    '(without it, every restart would silently log everyone out, and a guessable fallback secret would be a security hole). ' +
    'Set JWT_SECRET to a long random string in your environment and restart.'
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Initialize database
initializeDatabase();

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/accessories', accessoriesRouter);
app.use('/api/pricing', pricingRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// In production, this one service also serves the built frontend, so there's a single
// deployable unit with no separate CORS/cookie-domain concerns between "the app" and "the API".
if (isProduction) {
  const distPath = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn(`NODE_ENV=production but ${distPath} does not exist — run "npm run build" in frontend/ first.`);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚗 Geely Quotation Server running on http://localhost:${PORT}`);
});
