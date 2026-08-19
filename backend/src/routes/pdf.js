import express from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAsync, allAsync } from '../database/init.js';
import { formatPrice, calculateMonthlyPayment } from '../utils/pricing.js';
import { getStandardEquipment } from '../data/standardEquipment.js';
import { getTechnicalSpecs, WARRANTY_INFO } from '../data/technicalSpecs.js';
import { requireAuth, blockPendingPasswordChange } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../assets/geely-logo.png');
const LOGO_ASPECT = 114 / 459; // height / width of the source logo file

const VEHICLE_IMAGES = {
  'Geely E5': path.join(__dirname, '../assets/vehicles/geely-e5.jpg'),
  'Starray EM-i': path.join(__dirname, '../assets/vehicles/starray-emi.jpg'),
};

// Same typeface as the web app (frontend/index.html) — kept as static weights rather
// than the variable font, since pdfkit renders whatever instance it's given as-is.
const FONT_DIR = path.join(__dirname, '../assets/fonts');
const FONTS = {
  Inter: path.join(FONT_DIR, 'Inter-Regular.ttf'),
  'Inter-Medium': path.join(FONT_DIR, 'Inter-Medium.ttf'),
  'Inter-SemiBold': path.join(FONT_DIR, 'Inter-SemiBold.ttf'),
  'Inter-Bold': path.join(FONT_DIR, 'Inter-Bold.ttf'),
};

function registerFonts(doc) {
  Object.entries(FONTS).forEach(([name, file]) => doc.registerFont(name, file));
}

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

  doc.fontSize(9).font('Inter-Bold');
  const widths = badges.map(b => doc.widthOfString(b) + paddingX * 2);
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (badges.length - 1);
  let x = PAGE_LEFT + (CONTENT_WIDTH - totalWidth) / 2;

  badges.forEach((label, i) => {
    const w = widths[i];
    doc.roundedRect(x, y, w, boxHeight, 6).fill('#F3F4F6');
    doc.fillColor('#1F4E78').fontSize(9).font('Inter-Bold')
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
    doc.fillColor('#777').fontSize(8).font('Inter-Bold')
      .text(col.label, x, y + 17, { width: colWidth, align: 'center', characterSpacing: 0.5 });
    doc.fillColor(col.accent ? '#1F4E78' : '#0F0F0F').fontSize(col.accent ? 16 : 13).font('Inter-Bold')
      .text(col.value, x, y + 36, { width: colWidth, align: 'center' });
  });

  return y + boxHeight;
}

const EQUIPMENT_ITEM_INDENT = 12;

// Exact rendered height of a category header + its bullet items at the given column
// width and font size, measured (not estimated) so the two-column layout below can pack
// columns precisely instead of guessing and either wasting space or overflowing a page.
function measureEquipmentGroupHeight(doc, group, colWidth, fontSize) {
  doc.fontSize(fontSize + 2).font('Inter-Bold');
  let height = doc.heightOfString(group.category, { width: colWidth }) + 6;

  doc.fontSize(fontSize).font('Inter');
  const itemWidth = colWidth - EQUIPMENT_ITEM_INDENT;
  group.items.forEach((item) => {
    height += doc.heightOfString(item, { width: itemWidth }) + fontSize * 0.4;
  });

  return height + 14; // gap after the group
}

// Draws one category + its bulleted items at (x, y), constrained to colWidth, and
// returns the y position immediately below it.
function drawEquipmentGroup(doc, group, x, y, colWidth, fontSize) {
  doc.fillColor('#1F4E78').fontSize(fontSize + 2).font('Inter-Bold').text(group.category, x, y, { width: colWidth });
  y += doc.heightOfString(group.category, { width: colWidth }) + 6;

  const itemWidth = colWidth - EQUIPMENT_ITEM_INDENT;
  const lineGap = fontSize * 0.4;
  doc.font('Inter').fontSize(fontSize);
  group.items.forEach((item) => {
    doc.circle(x + 2.5, y + fontSize * 0.5, 1.5).fill('#1F4E78');
    doc.fillColor('#000').text(item, x + EQUIPMENT_ITEM_INDENT, y, { width: itemWidth });
    y += doc.heightOfString(item, { width: itemWidth }) + lineGap;
  });

  return y + 14;
}

// Tries to pack every group into two columns (left half / right half) without any
// column exceeding maxY. Returns the layout plan (which column + y for each group) if
// it fits at this font size, or null if it doesn't — so the caller can retry smaller.
function packEquipmentColumns(doc, equipment, topY, maxY, colWidth, fontSize) {
  const plan = [];
  let y = topY;
  let usedRightColumn = false;

  for (const group of equipment) {
    const groupHeight = measureEquipmentGroupHeight(doc, group, colWidth, fontSize);
    if (y + groupHeight > maxY) {
      if (usedRightColumn) return null; // doesn't fit even in 2 columns at this size
      usedRightColumn = true;
      y = topY;
    }
    plan.push({ group, column: usedRightColumn ? 1 : 0, y });
    y += groupHeight;
  }
  return plan;
}

// Lays every equipment category out across two columns (left half / right half of the
// page) instead of one long column, shrinking the font a step at a time until a fully-
// loaded trim's full list fits on a single page — a fixed font size can't guarantee that
// for every model (some trims have far more standard equipment than others).
function drawEquipmentColumns(doc, equipment, topY) {
  const colGap = 30;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const leftX = PAGE_LEFT;
  const rightX = PAGE_LEFT + colWidth + colGap;
  const maxY = 745;
  const fontSizes = [9, 8.5, 8, 7.5, 7, 6.5];

  let plan = null;
  let chosenFontSize = fontSizes[fontSizes.length - 1];
  for (const fontSize of fontSizes) {
    plan = packEquipmentColumns(doc, equipment, topY, maxY, colWidth, fontSize);
    if (plan) {
      chosenFontSize = fontSize;
      break;
    }
  }
  // Even the smallest size didn't fit two columns cleanly — lay it out anyway at that
  // size rather than lose content; pdfkit's own page overflow is the fallback here, not
  // a scenario the current equipment lists actually reach.
  if (!plan) {
    plan = packEquipmentColumns(doc, equipment, topY, Infinity, colWidth, chosenFontSize);
  }

  plan.forEach(({ group, column, y }) => {
    drawEquipmentGroup(doc, group, column === 0 ? leftX : rightX, y, colWidth, chosenFontSize);
  });
}

const SPEC_SECTION_TITLES = {
  drivetrain: 'Aandrijflijn',
  chassis: 'Chassis',
  performance: 'Prestaties',
  weight: 'Gewicht & trekken',
  charging: 'Actieradius & laden',
  dimensions: 'Afmetingen',
};

// Exact rendered height of a label/value spec table (section title + its rows) at the
// given column width — same measure-first approach as the equipment groups above, so
// the two-column packer below can place sections precisely.
function measureSpecSectionHeight(doc, section, colWidth, fontSize) {
  doc.fontSize(fontSize + 2).font('Inter-Bold');
  let height = doc.heightOfString(section.title, { width: colWidth }) + 8;

  const labelWidth = Math.round(colWidth * 0.5);
  const valueWidth = colWidth - labelWidth;
  section.rows.forEach((row) => {
    doc.fontSize(fontSize).font('Inter');
    const labelHeight = doc.heightOfString(row.label, { width: labelWidth });
    doc.font('Inter-SemiBold');
    const valueHeight = doc.heightOfString(row.value, { width: valueWidth });
    height += Math.max(labelHeight, valueHeight) + 6;
  });

  return height + 16; // gap after the section
}

// Draws one spec table (title + label/value rows, value right-aligned) at (x, y),
// constrained to colWidth, and returns the y position immediately below it.
function drawSpecSection(doc, section, x, y, colWidth, fontSize) {
  doc.fillColor('#1F4E78').fontSize(fontSize + 2).font('Inter-Bold').text(section.title, x, y, { width: colWidth });
  y += doc.heightOfString(section.title, { width: colWidth }) + 8;

  const labelWidth = Math.round(colWidth * 0.5);
  const valueWidth = colWidth - labelWidth;
  section.rows.forEach((row) => {
    doc.font('Inter').fontSize(fontSize);
    const labelHeight = doc.heightOfString(row.label, { width: labelWidth });
    doc.font('Inter-SemiBold').fontSize(fontSize);
    const valueHeight = doc.heightOfString(row.value, { width: valueWidth });
    const rowHeight = Math.max(labelHeight, valueHeight);

    doc.font('Inter').fillColor('#666').text(row.label, x, y, { width: labelWidth });
    doc.font('Inter-SemiBold').fillColor('#000').text(row.value, x + labelWidth, y, { width: valueWidth, align: 'right' });
    y += rowHeight + 6;
  });

  return y + 16;
}

// Same dry-run-then-draw packing strategy as packEquipmentColumns, generalized for
// label/value spec tables instead of bulleted lists.
function packSpecColumns(doc, sections, topY, maxY, colWidth, fontSize) {
  const plan = [];
  let y = topY;
  let usedRightColumn = false;

  for (const section of sections) {
    const sectionHeight = measureSpecSectionHeight(doc, section, colWidth, fontSize);
    if (y + sectionHeight > maxY) {
      if (usedRightColumn) return null;
      usedRightColumn = true;
      y = topY;
    }
    plan.push({ section, column: usedRightColumn ? 1 : 0, y });
    y += sectionHeight;
  }
  return plan;
}

// Left-half/right-half packing for the six spec sections, shrinking the font a step at a
// time (same rationale as drawEquipmentColumns) so it always fits one page.
function drawSpecColumns(doc, sections, topY) {
  const colGap = 30;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const leftX = PAGE_LEFT;
  const rightX = PAGE_LEFT + colWidth + colGap;
  const maxY = 745;
  const fontSizes = [9, 8.5, 8, 7.5, 7, 6.5];

  let plan = null;
  let chosenFontSize = fontSizes[fontSizes.length - 1];
  for (const fontSize of fontSizes) {
    plan = packSpecColumns(doc, sections, topY, maxY, colWidth, fontSize);
    if (plan) {
      chosenFontSize = fontSize;
      break;
    }
  }
  if (!plan) {
    plan = packSpecColumns(doc, sections, topY, Infinity, colWidth, chosenFontSize);
  }

  plan.forEach(({ section, column, y }) => {
    drawSpecSection(doc, section, column === 0 ? leftX : rightX, y, colWidth, chosenFontSize);
  });
}

// Draws the three warranty/service tiles (fabrieksgarantie, batterijgarantie, pechhulp) —
// same visual language as the cover page's price bar (rounded panel, vertical dividers).
function drawWarrantyTiles(doc, tiles, y) {
  const boxHeight = 130;
  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, boxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

  const colWidth = CONTENT_WIDTH / tiles.length;
  const padding = 18;
  tiles.forEach((tile, i) => {
    const x = PAGE_LEFT + i * colWidth;
    if (i > 0) {
      doc.moveTo(x, y + 16).lineTo(x, y + boxHeight - 16).stroke('#DADFE5');
    }
    const textX = x + padding;
    const textWidth = colWidth - padding * (i === tiles.length - 1 ? 2 : 1.5);

    doc.fillColor('#1F4E78').fontSize(20).font('Inter-Bold').text(tile.title, textX, y + 18, { width: textWidth });
    doc.fillColor('#000').fontSize(10).font('Inter-SemiBold').text(tile.subtitle, textX, y + 44, { width: textWidth });
    doc.fillColor('#666').fontSize(8).font('Inter').text(tile.text, textX, y + 62, { width: textWidth });
  });

  return y + boxHeight;
}

// Draws the full multi-page quote document onto an already-created PDFDocument and ends it.
// Shared by both the direct-download route and the e-mail attachment generator so the two
// paths can never drift out of sync with each other.
function renderQuotePdf(doc, { quote, vehicle, items, financing }) {
  registerFonts(doc);

  // ===================== PAGE 1 — Cover =====================
  const coverLogoWidth = 110;
  doc.image(LOGO_PATH, PAGE_LEFT, 40, { width: coverLogoWidth });

  const kickerLabel = `OFFERTE · ${new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(new Date(quote.createdAt)).toUpperCase()}`;
  doc.fillColor('#999').fontSize(9).font('Inter')
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

  doc.fillColor('#1F4E78').fontSize(10).font('Inter-Bold')
    .text(getFuelKicker(vehicle.fuel), PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center', characterSpacing: 1.5 });
  cursorY += 22;

  doc.fillColor('#0F0F0F').fontSize(28).font('Inter-Bold')
    .text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center' });
  cursorY += 40;

  doc.fillColor('#666').fontSize(11).font('Inter')
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
  doc.fillColor('#1F4E78').fontSize(18).font('Inter-Bold').text('Offerte', PAGE_LEFT, 40);
  doc.fillColor('#666').fontSize(10).font('Inter').text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, 66);
  doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');

  // Offer + customer info cards — height is computed from actual content instead of a
  // fixed number, since a company customer now carries a name, VAT number, and full
  // address, and a fixed height would clip that (or leave awkward extra space for a
  // private customer with fewer lines).
  const cardY = 108;
  const cardWidth = 245;

  const rightLines = [];
  if (quote.customerType === 'bedrijf' && quote.customerCompany) rightLines.push(quote.customerCompany);
  if (quote.customerType === 'bedrijf' && quote.customerVatNumber) rightLines.push(`BTW: ${quote.customerVatNumber}`);
  if (quote.customerStreet) rightLines.push(quote.customerStreet);
  const cityLine = [quote.customerPostalCode, quote.customerCity].filter(Boolean).join(' ');
  if (cityLine) rightLines.push(cityLine);
  if (quote.customerEmail) rightLines.push(quote.customerEmail);
  if (quote.customerPhone) rightLines.push(quote.customerPhone);

  const leftLineCount = 3 + (vehicle.deliveryEstimate ? 1 : 0) + (quote.branchName ? 2 : 0); // offertenr/datum/geldig-tot, + levertijd, + vestiging naam/adres
  const cardHeight = Math.max(34 + leftLineCount * 16, 34 + 16 + rightLines.length * 16) + 8;

  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, cardY, cardWidth, cardHeight, 6).fillAndStroke('#F6F7F9', '#E5E7EB');
  doc.roundedRect(305, cardY, cardWidth, cardHeight, 6).fillAndStroke('#F6F7F9', '#E5E7EB');

  let cy = cardY + 16;
  doc.fillColor('#1F4E78').fontSize(9).font('Inter-Bold').text('OFFERTEGEGEVENS', 56, cy, { characterSpacing: 1 });
  cy += 18;
  doc.fillColor('#000').fontSize(9).font('Inter');
  doc.text(`Offertenummer: OFF-${quote.id.slice(0, 8).toUpperCase()}`, 56, cy); cy += 16;
  doc.text(`Datum: ${formatDate(quote.createdAt)}`, 56, cy); cy += 16;
  doc.text(`Geldig tot: ${formatDate(quote.expiresAt)}`, 56, cy);
  if (vehicle.deliveryEstimate) {
    cy += 16;
    doc.text(`Levertijd: ${vehicle.deliveryEstimate}`, 56, cy);
  }
  if (quote.branchName) {
    cy += 16;
    doc.fillColor('#000').fontSize(9).font('Inter').text(`Vestiging: ${quote.branchName}`, 56, cy);
    cy += 13;
    doc.fillColor('#666').fontSize(8).font('Inter').text(quote.branchAddress || '', 56, cy);
  }

  let cy2 = cardY + 16;
  doc.fillColor('#1F4E78').fontSize(9).font('Inter-Bold').text('KLANTGEGEVENS', 321, cy2, { characterSpacing: 1 });
  cy2 += 18;
  doc.fillColor('#000').fontSize(9).font('Inter-Bold').text(quote.customerName, 321, cy2);
  cy2 += 16;
  doc.font('Inter');
  rightLines.forEach((line) => { doc.text(line, 321, cy2); cy2 += 16; });

  let yPos = cardY + cardHeight + 24;

  doc.fillColor('#999').fontSize(8).font('Inter')
    .text('Alle vermelde prijzen zijn Geely-adviesprijzen, inclusief 21% BTW.', PAGE_LEFT, yPos);
  yPos += 16;

  // Pricing breakdown table
  doc.fontSize(9).font('Inter-Bold').fillColor('#FFF');
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

  doc.font('Inter').fontSize(9);
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

  doc.fontSize(9).font('Inter').fillColor('#000');
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
  doc.font('Inter').fontSize(9).fillColor('#333');
  doc.text('Totaalprijs excl. BTW', boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.subtotal), valueX, rowY, { width: valueWidth, align: 'right' });

  rowY += 18;
  doc.text('BTW (21%)', boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.vatAmount), valueX, rowY, { width: valueWidth, align: 'right' });

  rowY += 24;
  doc.moveTo(boxX + boxPadding, rowY - 8).lineTo(boxX + boxWidth - boxPadding, rowY - 8).stroke('#CBD3DB');

  doc.font('Inter-Bold').fontSize(12).fillColor('#1F4E78');
  doc.text('Totaalprijs incl. BTW', boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.totalPrice), valueX, rowY, { width: valueWidth, align: 'right' });

  yPos += boxHeight + 24;

  // Trade-in (inruilwagen) — a purely informational deduction, shown separately from
  // the summary box above so "Totaalprijs incl. BTW" always keeps meaning what it says
  // (the vehicle's own price) rather than being silently reduced by the trade-in.
  if (quote.tradeInEnabled) {
    const tiBoxHeight = 92;
    doc.roundedRect(boxX, yPos, boxWidth, tiBoxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

    let tiY = yPos + 16;
    doc.font('Inter-Bold').fontSize(9).fillColor('#1F4E78').text('INRUILWAGEN', boxX + boxPadding, tiY, { characterSpacing: 1 });
    tiY += 16;
    const tradeInLabel = [quote.tradeInMake, quote.tradeInModel].filter(Boolean).join(' ') || 'Inruilwagen';
    const tradeInDetail = [
      quote.tradeInYear ? `bouwjaar ${quote.tradeInYear}` : null,
      quote.tradeInMileage ? `${Number(quote.tradeInMileage).toLocaleString('nl-BE')} km` : null,
    ].filter(Boolean).join(', ');
    doc.font('Inter').fontSize(9).fillColor('#333').text(tradeInDetail ? `${tradeInLabel} (${tradeInDetail})` : tradeInLabel, boxX + boxPadding, tiY, { width: boxWidth - boxPadding * 2 });
    tiY += 18;

    doc.text('Geschatte inruilwaarde', boxX + boxPadding, tiY, { width: labelWidth });
    doc.text('-' + formatPrice(quote.tradeInValue), valueX, tiY, { width: valueWidth, align: 'right' });
    tiY += 24;
    doc.moveTo(boxX + boxPadding, tiY - 8).lineTo(boxX + boxWidth - boxPadding, tiY - 8).stroke('#CBD3DB');

    doc.font('Inter-Bold').fontSize(12).fillColor('#1F4E78');
    doc.text('Te betalen na inruil', boxX + boxPadding, tiY, { width: labelWidth });
    doc.text(formatPrice(Math.max(0, quote.totalPrice - quote.tradeInValue)), valueX, tiY, { width: valueWidth, align: 'right' });

    doc.font('Inter').fontSize(7).fillColor('#999')
      .text('Schatting door de verkoper, geen bindende taxatie.', boxX, yPos + tiBoxHeight + 4, { width: boxWidth, align: 'right' });

    yPos += tiBoxHeight + 28;
  }

  // Financing simulation — an indicative monthly payment, never a binding offer (the
  // disclaimer says so explicitly). Uses the same net amount as the trade-in box above
  // (after trade-in deduction, if any) since that's what the customer would actually
  // need to finance.
  const financingPrincipal = Math.max(0, quote.totalPrice - (quote.tradeInEnabled ? quote.tradeInValue : 0));
  if (financing && financing.terms.length > 0 && financingPrincipal > 0) {
    const finBoxHeight = 66;
    doc.roundedRect(PAGE_LEFT, yPos, CONTENT_WIDTH, finBoxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

    doc.font('Inter-Bold').fontSize(9).fillColor('#1F4E78').text('FINANCIERINGSSIMULATIE', PAGE_LEFT + 18, yPos + 14, { characterSpacing: 1 });

    const termColWidth = (CONTENT_WIDTH - 36) / financing.terms.length;
    financing.terms.forEach((term, i) => {
      const x = PAGE_LEFT + 18 + i * termColWidth;
      const monthly = calculateMonthlyPayment(financingPrincipal, financing.annualRatePercent, term);
      doc.font('Inter-Bold').fontSize(13).fillColor('#000').text(formatPrice(monthly), x, yPos + 30, { width: termColWidth });
      doc.font('Inter').fontSize(8).fillColor('#666').text(`per maand · ${term} mnd`, x, yPos + 47, { width: termColWidth });
    });

    yPos += finBoxHeight + 6;
    doc.font('Inter').fontSize(7).fillColor('#999').text(
      `Indicatieve schatting o.b.v. ${financing.annualRatePercent}% jaarrente, geen bindend aanbod. Neem contact op met onze financieringspartner voor een persoonlijk voorstel.`,
      PAGE_LEFT, yPos, { width: CONTENT_WIDTH }
    );
    yPos += 22;
  }

  // Notes
  if (quote.notes) {
    doc.fillColor('#000').fontSize(9).font('Inter-Bold').text('Opmerkingen:', PAGE_LEFT, yPos);
    yPos += 14;
    doc.fontSize(8).font('Inter').fillColor('#333');
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
  doc.fillColor('#999').fontSize(8).font('Inter-Bold');
  doc.text('HANDTEKENING VERKOPER', PAGE_LEFT + 12, yPos + 12, { characterSpacing: 0.5 });
  doc.text('HANDTEKENING KLANT — VOOR AKKOORD', 317, yPos + 12, { width: sigWidth - 24, characterSpacing: 0.5 });
  doc.fontSize(8).font('Inter').fillColor('#999');
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

  // ===================== Standard equipment (one page, two columns) =====================
  const equipment = getStandardEquipment(vehicle.name, vehicle.model);
  if (equipment.length > 0) {
    doc.addPage();
    doc.image(LOGO_PATH, PAGE_RIGHT - smallLogoWidth, 40, { width: smallLogoWidth });
    doc.fillColor('#1F4E78').fontSize(18).font('Inter-Bold').text('Standaarduitrusting', PAGE_LEFT, 40);
    doc.fontSize(10).font('Inter').fillColor('#666').text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, 66);
    doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');

    drawEquipmentColumns(doc, equipment, 108);
  }

  // ===================== Technische gegevens & afmetingen (own page, two columns) =====================
  const techSpecs = getTechnicalSpecs(vehicle.name, vehicle.model);
  if (techSpecs) {
    doc.addPage();
    doc.image(LOGO_PATH, PAGE_RIGHT - smallLogoWidth, 40, { width: smallLogoWidth });
    doc.fillColor('#1F4E78').fontSize(18).font('Inter-Bold').text('Technische gegevens', PAGE_LEFT, 40);
    doc.fontSize(10).font('Inter').fillColor('#666').text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, 66);
    doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');

    const sections = Object.entries(SPEC_SECTION_TITLES)
      .filter(([key]) => techSpecs[key]?.length)
      .map(([key, title]) => ({ title, rows: techSpecs[key] }));
    drawSpecColumns(doc, sections, 108);
  }

  // ===================== Garantie & service (own page) =====================
  // T&C's are appended after this on their own page(s) by whatever calls renderQuotePdf next.
  doc.addPage();
  doc.image(LOGO_PATH, PAGE_RIGHT - smallLogoWidth, 40, { width: smallLogoWidth });
  doc.fillColor('#1F4E78').fontSize(18).font('Inter-Bold').text('Garantie & service', PAGE_LEFT, 40);
  doc.fontSize(10).font('Inter').fillColor('#666').text(`${vehicle.name} ${vehicle.model}`, PAGE_LEFT, 66);
  doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');
  drawWarrantyTiles(doc, WARRANTY_INFO, 108);

  // Page numbers on every page. Drawing this far down the page would normally trip pdfkit's
  // auto page-break (it would silently insert a fresh blank page and draw there instead) —
  // temporarily zeroing the bottom margin for this one draw call prevents that.
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor('#AAA').fontSize(8).font('Inter')
      .text(`Pagina ${i + 1} van ${pageRange.count}`, PAGE_LEFT, 760, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
}

// Loads everything a quote's PDF needs. Throws a descriptive Error if the quote or its
// vehicle can't be found, so callers (route handler or e-mail sender) can turn that into
// the right HTTP status / error message for their context.
async function loadFinancingSettings() {
  const rows = await allAsync('SELECT key, value FROM settings WHERE key IN (?, ?)', ['financingAnnualRatePercent', 'financingTerms']);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const annualRatePercent = parseFloat(byKey.financingAnnualRatePercent ?? '6.9');
  const terms = (byKey.financingTerms ?? '36,48,60').split(',').map((t) => parseInt(t.trim(), 10)).filter((t) => Number.isFinite(t) && t > 0);
  return { annualRatePercent, terms };
}

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
  const financing = await loadFinancingSettings();
  return { quote, vehicle, items, financing };
}

// Renders a quote to an in-memory PDF buffer (used for e-mail attachments).
export function generateQuotePdfBuffer({ quote, vehicle, items, financing }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      renderQuotePdf(doc, { quote, vehicle, items, financing });
    } catch (err) {
      reject(err);
    }
  });
}

// Generate PDF quote
router.get('/:quoteId', requireAuth, blockPendingPasswordChange, async (req, res) => {
  try {
    const { quote, vehicle, items, financing } = await loadQuoteForPdf(req.params.quoteId);

    const doc = new PDFDocument({ bufferPages: true, margin: 40 });
    const filename = `Offerte_Geely_${quote.customerName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    renderQuotePdf(doc, { quote, vehicle, items, financing });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
