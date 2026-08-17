import express from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAsync, allAsync } from '../database/init.js';
import { formatPrice } from '../utils/pricing.js';
import { getStandardEquipment } from '../data/standardEquipment.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../assets/geely-logo.png');
const LOGO_ASPECT = 114 / 459; // height / width of the source logo file

const VEHICLE_IMAGES = {
  'Geely E5': path.join(__dirname, '../assets/vehicles/geely-e5.jpg'),
  'Starray EM-i': path.join(__dirname, '../assets/vehicles/starray-emi.jpg'),
};

const PAGE_LEFT = 40;
const PAGE_RIGHT = 550;
const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

const router = express.Router();

function formatDate(value) {
  return new Date(value).toLocaleDateString('nl-BE');
}

function getFuelKicker(fuel) {
  if (fuel === 'Elektrisch') return '100% ELEKTRISCH';
  if (fuel === 'Plug-in Hybrid') return 'PLUG-IN HYBRIDE';
  return (fuel || '').toUpperCase();
}

function parseSpecifications(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

// Draws a centered row of pill-shaped spec badges and returns the y position after them.
function drawBadgeRow(doc, badges, y) {
  const paddingX = 14;
  const gap = 10;
  const boxHeight = 28;

  doc.fontSize(9).font('Helvetica-Bold');
  const widths = badges.map(b => doc.widthOfString(b) + paddingX * 2);
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (badges.length - 1);
  let x = PAGE_LEFT + (CONTENT_WIDTH - totalWidth) / 2;

  badges.forEach((label, i) => {
    const w = widths[i];
    doc.roundedRect(x, y, w, boxHeight, 6).fill('#F3F4F6');
    doc.fillColor('#1F4E78').fontSize(9).font('Helvetica-Bold')
      .text(label, x, y + 9, { width: w, align: 'center' });
    x += w + gap;
  });

  return y + boxHeight;
}

// Draws a 3-column excl./BTW/incl. price bar (cover page) and returns the y position after it.
function drawPriceBar(doc, { exclVat, vat, inclVat }, y) {
  const boxHeight = 76;
  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, boxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

  const colWidth = CONTENT_WIDTH / 3;
  const columns = [
    { label: 'PRIJS EXCL. BTW', value: formatPrice(exclVat), accent: false },
    { label: 'BTW (21%)', value: formatPrice(vat), accent: false },
    { label: 'TOTAALPRIJS INCL. BTW', value: formatPrice(inclVat), accent: true },
  ];

  columns.forEach((col, i) => {
    const x = PAGE_LEFT + i * colWidth;
    if (i > 0) {
      doc.moveTo(x, y + 16).lineTo(x, y + boxHeight - 16).stroke('#DADFE5');
    }
    doc.fillColor('#777').fontSize(8).font('Helvetica-Bold')
      .text(col.label, x, y + 17, { width: colWidth, align: 'center', characterSpacing: 0.5 });
    doc.fillColor(col.accent ? '#1F4E78' : '#0F0F0F').fontSize(col.accent ? 16 : 13).font('Helvetica-Bold')
      .text(col.value, x, y + 36, { width: colWidth, align: 'center' });
  });

  return y + boxHeight;
}

// Draws the full multi-page quote document onto an already-created PDFDocument and ends it.
// Shared by both the direct-download route and the e-mail attachment generator so the two
// paths can never drift out of sync with each other.
function renderQuotePdf(doc, { quote, vehicle, items }) {
  // ===================== PAGE 1 — Cover =====================
  const coverLogoWidth = 110;
  doc.image(LOGO_PATH, PAGE_LEFT, 40, { width: coverLogoWidth });

  const kickerLabel = `OFFERTE · ${new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(new Date(quote.createdAt)).toUpperCase()}`;
  doc.fillColor('#999').fontSize(9).font('Helvetica')
    .text(kickerLabel, 300, 40 + (coverLogoWidth * LOGO_ASPECT - 9) / 2, { width: 250, align: 'right', characterSpacing: 1 });

  doc.moveTo(PAGE_LEFT, 85).lineTo(PAGE_RIGHT, 85).stroke('#1F4E78');

  // Hero vehicle photo
  const heroImagePath = VEHICLE_IMAGES[vehicle.name];
  let cursorY = 105;
  if (heroImagePath) {
    const img = doc.openImage(heroImagePath);
    const aspect = img.width / img.height;
    const maxHeight = 230;
    let drawWidth = maxHeight * aspect;
    let drawHeight = maxHeight;
    if (drawWidth > CONTENT_WIDTH) {
      drawWidth = CONTENT_WIDTH;
      drawHeight = CONTENT_WIDTH / aspect;
    }
    const imgX = PAGE_LEFT + (CONTENT_WIDTH - drawWidth) / 2;
    doc.image(heroImagePath, imgX, cursorY, { width: drawWidth, height: drawHeight });
    cursorY += drawHeight + 20;
  }

  doc.moveTo(PAGE_LEFT, cursorY).lineTo(PAGE_RIGHT, cursorY).stroke('#E5E7EB');
  cursorY += 17;

  doc.fillColor('#1F4E78').fontSize(10).font('Helvetica-Bold')
    .text(getFuelKicker(vehicle.fuel), PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center', characterSpacing: 1.5 });
  cursorY += 22;

  doc.fillColor('#0F0F0F').fontSize(28).font('Helvetica-Bold')
    .text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center' });
  cursorY += 40;

  doc.fillColor('#666').fontSize(11).font('Helvetica')
    .text(`Persoonlijke offerte voor ${quote.customerName}`, PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center' });
  cursorY += 32;

  const specs = parseSpecifications(vehicle.specifications);
  const rangeValue = specs.range || specs.totalRange || specs.evRange || null;
  const badges = [
    vehicle.fuel,
    vehicle.transmission,
    vehicle.power ? `${vehicle.power} pk` : null,
    rangeValue ? `Actieradius ${rangeValue}` : null,
  ].filter(Boolean);
  cursorY = drawBadgeRow(doc, badges, cursorY);
  cursorY += 24;

  drawPriceBar(doc, { exclVat: quote.subtotal, vat: quote.vatAmount, inclVat: quote.totalPrice }, cursorY);

  // ===================== PAGE 2 — Offer details & pricing =====================
  doc.addPage();
  const smallLogoWidth = 70;
  doc.image(LOGO_PATH, PAGE_RIGHT - smallLogoWidth, 40, { width: smallLogoWidth });
  doc.fillColor('#1F4E78').fontSize(18).font('Helvetica-Bold').text('Offerte', PAGE_LEFT, 40);
  doc.fillColor('#666').fontSize(10).font('Helvetica').text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, 66);
  doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');

  // Offer + customer info cards
  const cardY = 108;
  const cardHeight = 112;
  const cardWidth = 245;
  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, cardY, cardWidth, cardHeight, 6).fillAndStroke('#F6F7F9', '#E5E7EB');
  doc.roundedRect(305, cardY, cardWidth, cardHeight, 6).fillAndStroke('#F6F7F9', '#E5E7EB');

  let cy = cardY + 16;
  doc.fillColor('#1F4E78').fontSize(9).font('Helvetica-Bold').text('OFFERTEGEGEVENS', 56, cy, { characterSpacing: 1 });
  cy += 18;
  doc.fillColor('#000').fontSize(9).font('Helvetica');
  doc.text(`Offertenummer: OFF-${quote.id.slice(0, 8).toUpperCase()}`, 56, cy); cy += 16;
  doc.text(`Datum: ${formatDate(quote.createdAt)}`, 56, cy); cy += 16;
  doc.text(`Geldig tot: ${formatDate(quote.expiresAt)}`, 56, cy);

  let cy2 = cardY + 16;
  doc.fillColor('#1F4E78').fontSize(9).font('Helvetica-Bold').text('KLANTGEGEVENS', 321, cy2, { characterSpacing: 1 });
  cy2 += 18;
  doc.fillColor('#000').fontSize(9).font('Helvetica-Bold').text(quote.customerName, 321, cy2);
  cy2 += 16;
  doc.font('Helvetica');
  if (quote.customerCompany) { doc.text(quote.customerCompany, 321, cy2); cy2 += 16; }
  if (quote.customerEmail) { doc.text(quote.customerEmail, 321, cy2); cy2 += 16; }
  if (quote.customerPhone) { doc.text(quote.customerPhone, 321, cy2); }

  let yPos = cardY + cardHeight + 24;

  doc.fillColor('#999').fontSize(8).font('Helvetica')
    .text('Alle vermelde prijzen zijn Geely-adviesprijzen, inclusief 21% BTW.', PAGE_LEFT, yPos);
  yPos += 16;

  // Pricing breakdown table
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFF');
  doc.rect(PAGE_LEFT, yPos, CONTENT_WIDTH, 24).fill('#1F4E78');
  doc.fillColor('#FFF').text('Omschrijving', 50, yPos + 7);
  doc.text('Eenheidsprijs', 350, yPos + 7);
  doc.text('Aantal', 430, yPos + 7);
  doc.text('Totaal', 480, yPos + 7);
  yPos += 24;

  const rows = [
    { name: `${vehicle.name} ${vehicle.model}`, unitPrice: quote.basePrice, quantity: 1, totalPrice: quote.basePrice },
    ...items.map(item => ({ name: item.itemName, unitPrice: item.unitPrice, quantity: item.quantity, totalPrice: item.totalPrice })),
  ];

  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, index) => {
    if (index % 2 === 1) {
      doc.rect(PAGE_LEFT, yPos, CONTENT_WIDTH, 20).fill('#F9FAFB');
    }
    doc.fillColor('#000');
    doc.text(row.name, 50, yPos + 5, { width: 290 });
    doc.text(formatPrice(row.unitPrice), 350, yPos + 5);
    doc.text(row.quantity.toString(), 430, yPos + 5);
    doc.text(formatPrice(row.totalPrice), 480, yPos + 5);
    yPos += 20;
  });

  doc.moveTo(PAGE_LEFT, yPos + 5).lineTo(PAGE_RIGHT, yPos + 5).stroke('#CCC');
  yPos += 25;

  doc.fontSize(9).font('Helvetica').fillColor('#000');
  doc.text('Subtotaal (incl. BTW):', 350, yPos, { width: 120 });
  doc.text(formatPrice(quote.basePrice + quote.accessories), 480, yPos, { width: 70, align: 'right' });
  yPos += 20;

  if (quote.discountPercentage > 0) {
    doc.text(`Korting (${quote.discountPercentage}%):`, 350, yPos, { width: 120 });
    doc.text('-' + formatPrice(quote.discountAmount), 480, yPos, { width: 70, align: 'right' });
    yPos += 20;
  }
  yPos += 12;

  // Excl./BTW/incl. summary box
  const boxWidth = 260;
  const boxX = PAGE_RIGHT - boxWidth;
  const boxHeight = 92;
  const boxPadding = 16;
  const labelWidth = 140;
  const valueX = boxX + boxPadding + labelWidth;
  const valueWidth = boxWidth - boxPadding * 2 - labelWidth;

  doc.roundedRect(boxX, yPos, boxWidth, boxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

  let rowY = yPos + 16;
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  doc.text('Totaalprijs excl. BTW', boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.subtotal), valueX, rowY, { width: valueWidth, align: 'right' });

  rowY += 18;
  doc.text('BTW (21%)', boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.vatAmount), valueX, rowY, { width: valueWidth, align: 'right' });

  rowY += 24;
  doc.moveTo(boxX + boxPadding, rowY - 8).lineTo(boxX + boxWidth - boxPadding, rowY - 8).stroke('#CBD3DB');

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1F4E78');
  doc.text('Totaalprijs incl. BTW', boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.totalPrice), valueX, rowY, { width: valueWidth, align: 'right' });

  yPos += boxHeight + 24;

  // Notes
  if (quote.notes) {
    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold').text('Opmerkingen:', PAGE_LEFT, yPos);
    yPos += 14;
    doc.fontSize(8).font('Helvetica').fillColor('#333');
    const notesHeight = doc.heightOfString(quote.notes, { width: CONTENT_WIDTH });
    doc.text(quote.notes, PAGE_LEFT, yPos, { width: CONTENT_WIDTH });
    yPos += notesHeight + 15;
  }

  // Signature blocks
  if (yPos > 590) {
    doc.addPage();
    yPos = 60;
  }
  const sigWidth = 245;
  const sigHeight = 80;
  doc.roundedRect(PAGE_LEFT, yPos, sigWidth, sigHeight, 6).stroke('#CCC');
  doc.roundedRect(305, yPos, sigWidth, sigHeight, 6).stroke('#CCC');
  doc.fillColor('#999').fontSize(8).font('Helvetica-Bold');
  doc.text('HANDTEKENING VERKOPER', PAGE_LEFT + 12, yPos + 12, { characterSpacing: 0.5 });
  doc.text('HANDTEKENING KLANT — VOOR AKKOORD', 317, yPos + 12, { width: sigWidth - 24, characterSpacing: 0.5 });
  doc.fontSize(8).font('Helvetica').fillColor('#999');
  if (quote.createdByName) {
    doc.text(quote.createdByName, PAGE_LEFT + 12, yPos + 32);
  }
  doc.text('Datum: ____________________', PAGE_LEFT + 12, yPos + sigHeight - 20);
  doc.text('Datum: ____________________', 317, yPos + sigHeight - 20);
  yPos += sigHeight + 20;

  // Footer
  doc.fontSize(8).fillColor('#666');
  doc.text('Geely Belgium | Professionele Voertuigoplossingen', PAGE_LEFT, yPos, { width: CONTENT_WIDTH, align: 'center' });
  doc.text('Deze offerte is 30 dagen geldig vanaf bovenstaande datum.', PAGE_LEFT, yPos + 12, { width: CONTENT_WIDTH, align: 'center' });

  // ===================== Standard equipment (own page(s)) =====================
  const equipment = getStandardEquipment(vehicle.name, vehicle.model);
  if (equipment.length > 0) {
    doc.addPage();
    doc.image(LOGO_PATH, PAGE_RIGHT - smallLogoWidth, 40, { width: smallLogoWidth });
    doc.fillColor('#1F4E78').fontSize(18).font('Helvetica-Bold').text('Standaarduitrusting', PAGE_LEFT, 40);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, 66);
    doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');
    doc.moveDown(3);

    equipment.forEach((group, index) => {
      if (index > 0) doc.moveDown(1);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1F4E78').text(group.category, PAGE_LEFT);
      doc.moveDown(0.4);
      doc.fontSize(9).font('Helvetica').fillColor('#000');
      doc.list(group.items, 50, doc.y, { bulletRadius: 1.5, textIndent: 8, width: 500, lineGap: 2 });
    });
  }

  // Page numbers on every page. Drawing this far down the page would normally trip pdfkit's
  // auto page-break (it would silently insert a fresh blank page and draw there instead) —
  // temporarily zeroing the bottom margin for this one draw call prevents that.
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor('#AAA').fontSize(8).font('Helvetica')
      .text(`Pagina ${i + 1} van ${pageRange.count}`, PAGE_LEFT, 760, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
}

// Loads everything a quote's PDF needs. Throws a descriptive Error if the quote or its
// vehicle can't be found, so callers (route handler or e-mail sender) can turn that into
// the right HTTP status / error message for their context.
export async function loadQuoteForPdf(quoteId) {
  const quote = await getAsync('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) {
    const error = new Error('Quote not found');
    error.status = 404;
    throw error;
  }

  const vehicle = await getAsync('SELECT * FROM vehicles WHERE id = ?', [quote.selectedVehicleId]);
  if (!vehicle) {
    const error = new Error('Vehicle for this quote no longer exists');
    error.status = 404;
    throw error;
  }

  const items = await allAsync('SELECT * FROM quote_items WHERE quoteId = ?', [quoteId]);
  return { quote, vehicle, items };
}

// Renders a quote to an in-memory PDF buffer (used for e-mail attachments).
export function generateQuotePdfBuffer({ quote, vehicle, items }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      renderQuotePdf(doc, { quote, vehicle, items });
    } catch (err) {
      reject(err);
    }
  });
}

// Generate PDF quote
router.get('/:quoteId', requireAuth, async (req, res) => {
  try {
    const { quote, vehicle, items } = await loadQuoteForPdf(req.params.quoteId);

    const doc = new PDFDocument({ bufferPages: true, margin: 40 });
    const filename = `Offerte_Geely_${quote.customerName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    renderQuotePdf(doc, { quote, vehicle, items });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
