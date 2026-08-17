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
