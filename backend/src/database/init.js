import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { STANDARD_ACCESSORIES } from '../data/accessoriesSeed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '../../data/quotation.db');

let db;

export function getDatabasePath() {
  return DB_PATH;
}

function ensureDatabaseDirectory() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err);
      } else {
        console.log(`✓ Connected to SQLite database at ${DB_PATH}`);
      }
    });
  }
  return db;
}

// Adds a column to an existing table if it isn't already there. SQLite has no
// "ADD COLUMN IF NOT EXISTS", so we attempt the migration and swallow the
// "duplicate column" error that means it already ran on a previous boot.
function addColumnIfMissing(database, table, column, definition) {
  database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error(`Migration error adding ${table}.${column}:`, err.message);
    }
  });
}

// Runs on every boot (unlike the seedVehicles block above, which only fires once on a
// totally empty table) so this new model reaches databases that were already seeded
// before it existed — an admin can later fill in the real price/specs via the
// existing "edit vehicle" screen once they're announced.
function seedGeelyE2IfMissing(database) {
  database.get('SELECT id FROM vehicles WHERE id = ?', ['geely-e2'], (err, row) => {
    if (err) {
      console.error('Error checking for Geely E2 seed row:', err);
      return;
    }
    if (row) return;

    database.run(
      `INSERT INTO vehicles (id, name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl, comingSoon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ['geely-e2', 'Geely E2', 'N.t.b.', 0, 'Nog niet bekend', 'Nog niet bekend', null, null, null, '{}', null],
      (insertErr) => {
        if (insertErr) {
          console.error('Failed to seed Geely E2:', insertErr.message);
          return;
        }
        console.log('✓ Added Geely E2 (Coming Soon)');
      }
    );
  });
}

function seedBranchesIfEmpty(database) {
  database.get('SELECT COUNT(*) AS count FROM branches', (err, row) => {
    if (err) {
      console.error('Error checking branches seed count:', err);
      return;
    }
    if (row.count > 0) return;

    const branches = [
      { id: 'roeselare', name: 'Geely Roeselare', address: 'Ovenstraat 15, 8800 Roeselare' },
      { id: 'brugge', name: 'Geely Brugge', address: 'Pathoekeweg 7, 8000 Brugge' },
      { id: 'oostende', name: 'Geely Oostende', address: 'Torhoutsesteenweg 710, 8400 Oostende' },
    ];
    const insertBranch = database.prepare('INSERT INTO branches (id, name, address, active) VALUES (?, ?, ?, 1)');
    branches.forEach((b) => insertBranch.run(b.id, b.name, b.address));
    insertBranch.finalize();
    console.log('✓ Seeded default branches');
  });
}

function seedAccessoriesIfEmpty(database) {
  database.get('SELECT COUNT(*) AS count FROM accessories', (err, row) => {
    if (err) {
      console.error('Error checking accessories seed count:', err);
      return;
    }
    if (row.count > 0) return;

    const insertAccessory = database.prepare(
      `INSERT INTO accessories (id, name, price, category, vehicleModels, active)
       VALUES (?, ?, ?, ?, ?, 1)`
    );
    STANDARD_ACCESSORIES.forEach((acc) => {
      insertAccessory.run(acc.id, acc.name, acc.price, acc.category, JSON.stringify(acc.vehicleModels || []));
    });
    insertAccessory.finalize();
    console.log('✓ Seeded default accessories');
  });
}

function bootstrapAdminIfNoUsers(database) {
  database.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
    if (err) {
      console.error('Error checking user count:', err);
      return;
    }
    if (row.count > 0) return;

    const email = (process.env.ADMIN_EMAIL || 'admin@geely.local').toLowerCase();
    const name = process.env.ADMIN_NAME || 'Beheerder';
    const providedPassword = process.env.ADMIN_PASSWORD;
    const password = providedPassword || crypto.randomBytes(9).toString('base64url');
    const passwordHash = bcrypt.hashSync(password, 12);
    const id = uuidv4();

    database.run(
      `INSERT INTO users (id, name, email, passwordHash, role) VALUES (?, ?, ?, ?, 'admin')`,
      [id, name, email, passwordHash],
      (insertErr) => {
        if (insertErr) {
          console.error('Failed to create bootstrap admin user:', insertErr.message);
          return;
        }
        console.log('✓ Created initial admin account:');
        console.log(`  Email:    ${email}`);
        if (!providedPassword) {
          console.log(`  Password: ${password}  (generated — set ADMIN_EMAIL/ADMIN_PASSWORD env vars to control this)`);
        } else {
          console.log('  Password: (from ADMIN_PASSWORD env var)');
        }
      }
    );
  });
}

export function initializeDatabase() {
  ensureDatabaseDirectory();
  const database = getDatabase();

  database.serialize(() => {
    // Users table (colleagues who log in to the tool)
    database.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'sales',
        active BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    addColumnIfMissing(database, 'users', 'mustChangePassword', 'BOOLEAN DEFAULT 0');
    addColumnIfMissing(database, 'users', 'passwordResetTokenHash', 'TEXT');
    addColumnIfMissing(database, 'users', 'passwordResetExpires', 'DATETIME');
    addColumnIfMissing(database, 'users', 'branchId', 'TEXT');

    // Branches (physical dealership locations) — a user belongs to one, and every quote
    // they create snapshots that branch's name/address at creation time (see the
    // quotes.branchName/branchAddress migration below) so it shows up on the PDF and can
    // be filtered on in reports, regardless of whether the user later changes branch.
    database.run(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        active BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Vehicles table
    database.run(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT NOT NULL,
        basePrice REAL NOT NULL,
        fuel TEXT NOT NULL,
        transmission TEXT NOT NULL,
        power INTEGER,
        torque INTEGER,
        consumption REAL,
        specifications TEXT,
        imageUrl TEXT,
        active BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    addColumnIfMissing(database, 'vehicles', 'comingSoon', 'BOOLEAN DEFAULT 0');
    // Free-text so a manager can write "Op voorraad", "8-10 weken", or a specific date —
    // whatever's accurate at the time — without the rigidity of a strict date field.
    addColumnIfMissing(database, 'vehicles', 'deliveryEstimate', 'TEXT');

    // Accessories / options table (paint, upholstery, comfort add-ons, ...)
    database.run(`
      CREATE TABLE IF NOT EXISTS accessories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        vehicleModels TEXT NOT NULL DEFAULT '[]',
        active BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Quotes table
    database.run(`
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        customerName TEXT NOT NULL,
        customerEmail TEXT,
        customerPhone TEXT,
        customerCompany TEXT,
        selectedVehicleId TEXT NOT NULL,
        configuration TEXT NOT NULL,
        basePrice REAL NOT NULL,
        accessories REAL DEFAULT 0,
        discountPercentage REAL DEFAULT 0,
        discountAmount REAL DEFAULT 0,
        subtotal REAL NOT NULL,
        vatAmount REAL NOT NULL,
        totalPrice REAL NOT NULL,
        status TEXT DEFAULT 'draft',
        notes TEXT,
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (selectedVehicleId) REFERENCES vehicles(id)
      )
    `);

    // Migrations for columns added after the original release
    addColumnIfMissing(database, 'quotes', 'createdBy', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'createdByName', 'TEXT');
    // Snapshotted from the creating user's branch at creation time — not a live FK
    // lookup, so it stays accurate on the PDF even if that user later moves branches.
    addColumnIfMissing(database, 'quotes', 'branchId', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'branchName', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'branchAddress', 'TEXT');
    // Campaign discounts: a quote's discount is either a percentage (existing
    // discountPercentage column, unchanged) or a flat euro amount (discountEuro) —
    // discountType says which one is in effect, defaulting existing rows to 'percentage'
    // so nothing about already-stored quotes changes.
    addColumnIfMissing(database, 'quotes', 'discountType', "TEXT DEFAULT 'percentage'");
    addColumnIfMissing(database, 'quotes', 'discountEuro', 'REAL DEFAULT 0');
    // Discount approval workflow: 'not_required' (no/small discount, or applied by a
    // manager/admin who doesn't need sign-off), 'pending' (a rep's discount exceeds the
    // threshold and needs a manager's sign-off before the quote can be sent/accepted),
    // 'approved' or 'rejected' (a manager reviewed it). Existing quotes default to
    // 'not_required' — this workflow only applies going forward.
    addColumnIfMissing(database, 'quotes', 'discountApprovalStatus', "TEXT DEFAULT 'not_required'");
    // Customer detail expansion: type distinguishes which fields apply (a VAT number and
    // company name only make sense for 'bedrijf'), the address columns are split rather
    // than one free-text field so they read cleanly on the PDF and so a VIES lookup can
    // fill them in individually. Existing quotes default to 'particulier' with blank
    // address/VAT fields — nothing retroactive is inferred for them.
    addColumnIfMissing(database, 'quotes', 'customerType', "TEXT DEFAULT 'particulier'");
    addColumnIfMissing(database, 'quotes', 'customerVatNumber', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'customerStreet', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'customerPostalCode', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'customerCity', 'TEXT');
    // Trade-in (inruilwagen): a purely informational deduction shown to the customer on
    // the offer, kept deliberately separate from basePrice/subtotal/vatAmount/totalPrice
    // — those stay "what the car itself sells for" for revenue reporting, while the
    // trade-in value is just subtracted at display time to show what the customer still
    // owes out of pocket. Belgian VAT treatment of a trade-in can involve a margin
    // scheme depending on the situation, which this app has no business modeling —
    // sales enters a plain estimated value, not a tax computation.
    addColumnIfMissing(database, 'quotes', 'tradeInEnabled', 'BOOLEAN DEFAULT 0');
    addColumnIfMissing(database, 'quotes', 'tradeInMake', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'tradeInModel', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'tradeInYear', 'INTEGER');
    addColumnIfMissing(database, 'quotes', 'tradeInMileage', 'INTEGER');
    addColumnIfMissing(database, 'quotes', 'tradeInValue', 'REAL DEFAULT 0');
    // Online acceptance: a hashed, single-use-per-send token (same scheme as the
    // password-reset flow in routes/auth.js) lets a customer accept an offer from the
    // e-mailed link without an account. Re-sending the e-mail issues a fresh token,
    // invalidating any previous link — nothing here is ever stored in plaintext.
    addColumnIfMissing(database, 'quotes', 'acceptanceTokenHash', 'TEXT');
    addColumnIfMissing(database, 'quotes', 'acceptanceTokenExpires', 'DATETIME');
    addColumnIfMissing(database, 'quotes', 'acceptedAt', 'DATETIME');
    addColumnIfMissing(database, 'quotes', 'acceptedByName', 'TEXT');

    // Quote Items (accessories/options) table
    database.run(`
      CREATE TABLE IF NOT EXISTS quote_items (
        id TEXT PRIMARY KEY,
        quoteId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        unitPrice REAL NOT NULL,
        totalPrice REAL NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quoteId) REFERENCES quotes(id) ON DELETE CASCADE
      )
    `);

    // Pricing tiers table
    database.run(`
      CREATE TABLE IF NOT EXISTS pricing_tiers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        minQuantity INTEGER,
        maxQuantity INTEGER,
        discountPercentage REAL NOT NULL,
        active BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit trail: who changed a discount, price, or quote status, and when. Generic
    // by design (entityType + entityId) so it can cover quotes, accessories, and
    // vehicles without a separate table per entity.
    database.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        performedBy TEXT,
        performedByName TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Uploaded documents (price lists, campaign/discount docs, ...). Spreadsheets
    // (xlsx/csv) get parsed into proposedChanges for review; PDF/Word are stored for
    // reference only — nothing is applied to real prices without an explicit,
    // itemized confirmation via the /apply endpoint.
    database.run(`
      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        storedFilename TEXT NOT NULL,
        fileSize INTEGER,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploaded',
        proposedChanges TEXT,
        unmatchedRows TEXT,
        parseError TEXT,
        appliedAt DATETIME,
        uploadedBy TEXT,
        uploadedByName TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Generic key/value settings store — currently only used for the financing
    // simulation's interest rate and available terms (see routes/settings.js), but kept
    // generic rather than dedicated columns so future admin-configurable values don't
    // each need their own migration.
    database.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('financingAnnualRatePercent', '6.9')`);
    database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('financingTerms', '36,48,60')`);

    database.get('SELECT COUNT(*) AS count FROM vehicles', (err, row) => {
      if (err) {
        console.error('Error checking vehicle seed count:', err);
        return;
      }

      if (row.count === 0) {
        const seedVehicles = [
          // Geely E5 - Electric
          {
            id: 'geely-e5-pro',
            name: 'Geely E5',
            model: 'PRO',
            basePrice: 36490,
            fuel: 'Elektrisch',
            transmission: 'Automatisch',
            power: 218,
            torque: 320,
            consumption: 15.8,
            specifications: JSON.stringify({
              category: 'SUV Electric',
              battery: '60 kWh LFP',
              range: '430 km WLTP',
              charger: '11 kW AC / 100 kW DC'
            }),
            imageUrl: '🔋'
          },
          {
            id: 'geely-e5-pro-plus',
            name: 'Geely E5',
            model: 'PRO+',
            basePrice: 38490,
            fuel: 'Elektrisch',
            transmission: 'Automatisch',
            power: 218,
            torque: 320,
            consumption: 16.0,
            specifications: JSON.stringify({
              category: 'SUV Electric',
              battery: '68 kWh LFP',
              range: '475 km WLTP',
              charger: '11 kW AC / 100 kW DC'
            }),
            imageUrl: '🔋'
          },
          {
            id: 'geely-e5-max-plus',
            name: 'Geely E5',
            model: 'MAX+',
            basePrice: 40490,
            fuel: 'Elektrisch',
            transmission: 'Automatisch',
            power: 218,
            torque: 320,
            consumption: 16.9,
            specifications: JSON.stringify({
              category: 'SUV Electric',
              battery: '68 kWh LFP',
              range: '450 km WLTP',
              wheels: '19 inch',
              charger: '11 kW AC / 100 kW DC'
            }),
            imageUrl: '🔋'
          },
          // Starray EM-i - Plug-in Hybrid
          {
            id: 'starray-emi-pro',
            name: 'Starray EM-i',
            model: 'PRO',
            basePrice: 33490,
            fuel: 'Plug-in Hybrid',
            transmission: 'Automatisch',
            power: 262,
            torque: 193,
            consumption: 2.4,
            specifications: JSON.stringify({
              category: 'SUV Plug-in Hybrid',
              battery: '18.4 kWh LFP',
              evRange: '83 km',
              totalRange: '1002 km',
              charger: '6.6 kW AC / 30 kW DC'
            }),
            imageUrl: '🔌'
          },
          {
            id: 'starray-emi-pro-plus',
            name: 'Starray EM-i',
            model: 'PRO+',
            basePrice: 35490,
            fuel: 'Plug-in Hybrid',
            transmission: 'Automatisch',
            power: 262,
            torque: 193,
            consumption: 1.5,
            specifications: JSON.stringify({
              category: 'SUV Plug-in Hybrid',
              battery: '29.8 kWh LFP',
              evRange: '136 km',
              totalRange: '1055 km',
              charger: '6.6 kW AC / 60 kW DC'
            }),
            imageUrl: '🔌'
          },
          {
            id: 'starray-emi-max-plus',
            name: 'Starray EM-i',
            model: 'MAX+',
            basePrice: 37490,
            fuel: 'Plug-in Hybrid',
            transmission: 'Automatisch',
            power: 262,
            torque: 193,
            consumption: 1.5,
            specifications: JSON.stringify({
              category: 'SUV Plug-in Hybrid',
              battery: '29.8 kWh LFP',
              evRange: '136 km',
              totalRange: '1055 km',
              wheels: '19 inch',
              charger: '6.6 kW AC / 60 kW DC'
            }),
            imageUrl: '🔌'
          }
        ];

        const insertVehicle = (vehicle) => {
          database.run(
            `INSERT INTO vehicles (id, name, model, basePrice, fuel, transmission, power, torque, consumption, specifications, imageUrl)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              vehicle.id,
              vehicle.name,
              vehicle.model,
              vehicle.basePrice,
              vehicle.fuel,
              vehicle.transmission,
              vehicle.power,
              vehicle.torque,
              vehicle.consumption,
              vehicle.specifications,
              vehicle.imageUrl
            ]
          );
        };

        seedVehicles.forEach(insertVehicle);
        console.log('✓ Seeded default Geely vehicles');
      }
    });

    seedGeelyE2IfMissing(database);
    seedBranchesIfEmpty(database);
    seedAccessoriesIfEmpty(database);
    bootstrapAdminIfNoUsers(database);

    console.log('✓ Database tables initialized');
  });
}

export function runAsync(sql, params = []) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function getAsync(sql, params = []) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function allAsync(sql, params = []) {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
