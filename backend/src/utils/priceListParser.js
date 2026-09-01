import ExcelJS from 'exceljs';
import { allAsync } from '../database/init.js';

const HEADER_ALIASES = {
  name: ['model', 'naam', 'name', 'voertuig', 'optie', 'accessoire', 'artikel'],
  variant: ['uitvoering', 'variant', 'trim', 'versie'],
  price: ['prijs', 'price', 'basisprijs', 'adviesprijs', 'nieuwe prijs'],
};

function normalizeHeader(cell) {
  return String(cell ?? '').trim().toLowerCase();
}

function findColumnIndex(headerRow, aliases) {
  return headerRow.findIndex((cell) => aliases.includes(normalizeHeader(cell)));
}

// Handles both "36490" and Belgian-style "36.490,00" (thousands dot, decimal comma).
function parsePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const str = String(raw).replace(/[€\s]/g, '');
  const normalized = str.includes(',') && !/\.\d{1,2}$/.test(str)
    ? str.replace(/\./g, '').replace(',', '.')
    : str.replace(/,/g, '');
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

// Minimal RFC4180-ish CSV parser (quoted fields, escaped quotes) — avoids pulling in a
// dependency just for this. Auto-detects `;` vs `,` since Excel's Dutch/Belgian locale
// exports CSV with `;` (comma is the decimal separator there).
function parseCsv(text) {
  const delimiter = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field); field = '';
    } else if (char === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else if (char === '\r') {
      // skip
    } else {
      field += char;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function xlsxToMatrix(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const matrix = [];
  sheet.eachRow((row) => {
    // row.values is 1-indexed (index 0 is unused), and cell objects for formulas/rich
    // text need unwrapping to their plain result value.
    const cells = row.values.slice(1).map((cell) => (cell && typeof cell === 'object' && 'result' in cell ? cell.result : cell));
    matrix.push(cells);
  });
  return matrix;
}

const MAX_ROWS = 5000;

function extractRows(matrix) {
  const [header, ...dataRows] = matrix;
  if (!header) {
    const error = new Error('Leeg bestand — geen kolomkoppen gevonden');
    error.status = 400;
    throw error;
  }

  const nameIdx = findColumnIndex(header, HEADER_ALIASES.name);
  const variantIdx = findColumnIndex(header, HEADER_ALIASES.variant);
  const priceIdx = findColumnIndex(header, HEADER_ALIASES.price);

  if (nameIdx === -1 || priceIdx === -1) {
    const error = new Error('Kon geen kolom voor model/naam en prijs herkennen. Verwacht kolomkoppen zoals "Model" en "Prijs".');
    error.status = 400;
    throw error;
  }

  return dataRows
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
    .slice(0, MAX_ROWS)
    .map((r) => ({
      name: String(r[nameIdx] ?? '').trim(),
      variant: variantIdx !== -1 ? String(r[variantIdx] ?? '').trim() : '',
      rawPrice: r[priceIdx],
    }))
    .filter((r) => r.name);
}

// Matches parsed rows against the actual catalog — a row only becomes a "proposed
// change" if it resolves to exactly one known vehicle or accessory and carries a valid,
// positive price that actually differs from what's currently stored. Everything else
// (unmatched name, ambiguous name, bad/missing price, no real change) is reported back
// as an unmatched row with a reason, never silently applied or silently dropped.
async function matchRowsToChanges(rows) {
  const vehicles = await allAsync('SELECT * FROM vehicles');
  const accessories = await allAsync('SELECT * FROM accessories');

  const proposedChanges = [];
  const unmatchedRows = [];

  for (const row of rows) {
    const price = parsePrice(row.rawPrice);
    if (price === null || price <= 0) {
      unmatchedRows.push({ name: row.name, variant: row.variant, rawPrice: row.rawPrice, reason: 'Geen geldige prijs gevonden' });
      continue;
    }

    let match = null;
    let type = null;

    if (row.variant) {
      const v = vehicles.find((v) => v.name.toLowerCase() === row.name.toLowerCase() && v.model.toLowerCase() === row.variant.toLowerCase());
      if (v) { match = v; type = 'vehicle'; }
    }
    if (!match) {
      const vMatches = vehicles.filter((v) => v.name.toLowerCase() === row.name.toLowerCase());
      if (vMatches.length === 1) { match = vMatches[0]; type = 'vehicle'; }
      else if (vMatches.length > 1) {
        unmatchedRows.push({ name: row.name, variant: row.variant, rawPrice: row.rawPrice, reason: 'Meerdere uitvoeringen met deze naam — voeg een "Uitvoering"-kolom toe' });
        continue;
      }
    }
    if (!match) {
      // Same ambiguity check as the vehicle matcher above — an accessory name is NOT
      // unique across models (e.g. "Delivery Pack" exists once per model as separate
      // catalog rows), so picking the first match by name would silently reprice only
      // one of them and leave the others stale with no indication anything was skipped.
      const aMatches = accessories.filter((a) => a.name.toLowerCase() === row.name.toLowerCase());
      if (aMatches.length === 1) { match = aMatches[0]; type = 'accessory'; }
      else if (aMatches.length > 1) {
        unmatchedRows.push({ name: row.name, variant: row.variant, rawPrice: row.rawPrice, reason: 'Meerdere opties met deze naam gevonden — kan niet automatisch matchen' });
        continue;
      }
    }
    if (!match) {
      unmatchedRows.push({ name: row.name, variant: row.variant, rawPrice: row.rawPrice, reason: 'Geen overeenkomend voertuig of optie gevonden' });
      continue;
    }

    const currentPrice = type === 'vehicle' ? match.basePrice : match.price;
    if (currentPrice === price) continue; // already correct — not a change, not an error

    proposedChanges.push({
      type,
      id: match.id,
      label: type === 'vehicle' ? `${match.name} ${match.model}` : match.name,
      currentPrice,
      newPrice: price,
    });
  }

  return { proposedChanges, unmatchedRows };
}

export async function parsePriceList(buffer, extension) {
  const matrix = extension === 'csv' ? parseCsv(buffer.toString('utf8')) : await xlsxToMatrix(buffer);
  const rows = extractRows(matrix);
  return matchRowsToChanges(rows);
}
