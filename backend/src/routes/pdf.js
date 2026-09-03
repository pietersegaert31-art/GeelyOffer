import express from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAsync, allAsync } from '../database/init.js';
import { formatPrice } from '../utils/pricing.js';
import { getStandardEquipment } from '../data/standardEquipment.js';
import { getTechnicalSpecs, getWarrantyInfo } from '../data/technicalSpecs.js';
import { requireAuth, blockPendingPasswordChange } from '../middleware/auth.js';
import { LOCALE, PDF, resolveLang, translateFuel, translateTransmission, powerUnit, fuelKicker, translateAccessoryName } from '../i18n/translate.js';
import { formatQuoteNumber } from '../utils/quoteNumber.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../assets/geely-logo.png');
const LOGO_ASPECT = 114 / 459; // height / width of the source logo file

const VEHICLE_IMAGES = {
  'Geely E5': path.join(__dirname, '../assets/vehicles/geely-e5.jpg'),
  'Starray EM-i': path.join(__dirname, '../assets/vehicles/starray-emi.jpg'),
  'Geely E2': path.join(__dirname, '../assets/vehicles/geely-e2.jpg'),
};

// Real front 3/4 photos per exterior color (same source and mapping as
// frontend/src/utils/vehicleImages.js), keyed by the exact accessory name stored on the
// quote_items row. A color without an entry here just falls back to VEHICLE_IMAGES above.
const VEHICLE_COLOR_IMAGES = {
  'Metallic: Frost Grey': path.join(__dirname, '../assets/vehicles/colors/e5-frost-grey-front.jpg'),
  'Metallic: Carbon Black': path.join(__dirname, '../assets/vehicles/colors/e5-carbon-black-front.jpg'),
  'Metallic: Moonlight Silver': path.join(__dirname, '../assets/vehicles/colors/e5-moonlight-silver-front.jpg'),
  'Metallic: Snowy White': path.join(__dirname, '../assets/vehicles/colors/e5-snowy-white-front.jpg'),
  'Metallic: Turquoise Green': path.join(__dirname, '../assets/vehicles/colors/e5-turquoise-green-front.jpg'),
  'Metallic: Cloudveil Silver': path.join(__dirname, '../assets/vehicles/colors/starray-cloudveil-silver-front.jpg'),
  'Metallic: Jungle Green': path.join(__dirname, '../assets/vehicles/colors/starray-jungle-green-front.jpg'),
  'Metallic: Glacier Blue': path.join(__dirname, '../assets/vehicles/colors/starray-glacier-blue-front.jpg'),
  'Metallic: Volcanic Grey': path.join(__dirname, '../assets/vehicles/colors/starray-volcanic-grey-front.jpg'),
  'Metallic: Polar Black': path.join(__dirname, '../assets/vehicles/colors/starray-polar-black-front.jpg'),
};

// One interior photo per model — each model currently has only a single upholstery option
// in the catalog, so (unlike the exterior colors above) there's no per-choice variant to
// key this by; it just shows the upholstery that's actually sold.
const VEHICLE_INTERIOR_IMAGES = {
  'Geely E5': path.join(__dirname, '../assets/vehicles/interior/e5-interior.jpg'),
  'Starray EM-i': path.join(__dirname, '../assets/vehicles/interior/starray-interior.jpg'),
};

// The legal entity actually issuing the quote (a Geely dealer) — distinct from "Geely",
// the vehicle brand shown via the logo/imagery elsewhere on the PDF. Not per-branch or
// per-quote data, so it's a plain constant rather than something stored on the quote.
const SELLER_COMPANY = { name: 'ABS NV', vatNumber: 'BE0475949603' };

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

function formatDate(value, lang) {
  return new Date(value).toLocaleDateString(LOCALE[resolveLang(lang)]);
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
function drawPriceBar(doc, { exclVat, vat, inclVat }, y, T) {
  const boxHeight = 76;
  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, boxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

  const colWidth = CONTENT_WIDTH / 3;
  const columns = [
    { label: T.priceExclVat, value: formatPrice(exclVat), accent: false },
    { label: T.vat21, value: formatPrice(vat), accent: false },
    { label: T.totalInclVatBar, value: formatPrice(inclVat), accent: true },
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
  const colWidth = CONTENT_WIDTH / tiles.length;
  const padding = 18;
  const subtitleYOffset = 44;
  const minBoxHeight = 130;

  // Measured first (dry run, same approach as the equipment/spec columns above), so the
  // box is always tall enough for the actual content — the fixed 130 this used to be
  // assumed a single-line subtitle; a longer French subtitle can wrap to two lines (see
  // subtitleY below), and content only a little longer than today's could otherwise spill
  // past the rounded border while the box itself stayed the same height.
  let contentHeight = 0;
  tiles.forEach((tile, i) => {
    const textWidth = colWidth - padding * (i === tiles.length - 1 ? 2 : 1.5);
    doc.fontSize(10).font('Inter-SemiBold');
    const subtitleHeight = doc.heightOfString(tile.subtitle, { width: textWidth });
    doc.fontSize(8).font('Inter');
    const bodyHeight = doc.heightOfString(tile.text, { width: textWidth });
    contentHeight = Math.max(contentHeight, subtitleYOffset + subtitleHeight + 4 + bodyHeight);
  });
  const boxHeight = Math.max(minBoxHeight, contentHeight + 18);

  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, boxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

  tiles.forEach((tile, i) => {
    const x = PAGE_LEFT + i * colWidth;
    if (i > 0) {
      doc.moveTo(x, y + 16).lineTo(x, y + boxHeight - 16).stroke('#DADFE5');
    }
    const textX = x + padding;
    const textWidth = colWidth - padding * (i === tiles.length - 1 ? 2 : 1.5);

    doc.fillColor('#1F4E78').fontSize(20).font('Inter-Bold').text(tile.title, textX, y + 18, { width: textWidth });

    // Body text is positioned from the subtitle's measured height rather than a fixed
    // offset — the French subtitles are longer than their Dutch originals and can wrap to
    // two lines in this narrow a column, which a fixed single-line offset would let the
    // body text overlap.
    doc.fontSize(10).font('Inter-SemiBold');
    const subtitleY = y + subtitleYOffset;
    doc.fillColor('#000').text(tile.subtitle, textX, subtitleY, { width: textWidth });
    const subtitleHeight = doc.heightOfString(tile.subtitle, { width: textWidth });

    doc.fillColor('#666').fontSize(8).font('Inter').text(tile.text, textX, subtitleY + subtitleHeight + 4, { width: textWidth });
  });

  return y + boxHeight;
}

// Repeated on every continuation page (2 onward): small corner logo, page title, vehicle
// subtitle, divider. Factored out so the 5 call sites below can never drift apart from
// each other, or forget to translate one when the other four were updated.
function drawContinuationHeader(doc, title, vehicleLabel, smallLogoWidth) {
  doc.image(LOGO_PATH, PAGE_RIGHT - smallLogoWidth, 40, { width: smallLogoWidth });
  doc.fillColor('#1F4E78').fontSize(18).font('Inter-Bold').text(title, PAGE_LEFT, 40);
  doc.fillColor('#666').fontSize(10).font('Inter').text(vehicleLabel, PAGE_LEFT, 66);
  doc.moveTo(PAGE_LEFT, 88).lineTo(PAGE_RIGHT, 88).stroke('#1F4E78');
}

// Draws the full multi-page quote document onto an already-created PDFDocument and ends it.
// Shared by both the direct-download route and the e-mail attachment generator so the two
// paths can never drift out of sync with each other.
function renderQuotePdf(doc, { quote, vehicle, items }) {
  registerFonts(doc);
  const lang = resolveLang(quote.language);
  const T = PDF[lang];
  const vehicleLabel = `${vehicle.name} ${vehicle.model}`;
  // A showroomaanbieding drops everything customer-specific: no customer card, no offer
  // number, no "valid until" date, a different title/kicker. The vehicle, pricing, specs,
  // equipment and warranty pages are all kept — that's the point of the sheet.
  const isShowroom = !!quote.isShowroom;
  const docTitle = isShowroom ? T.showroomTitle : T.quoteTitle;

  // ===================== PAGE 1 — Cover =====================
  const coverLogoWidth = 110;
  doc.image(LOGO_PATH, PAGE_LEFT, 40, { width: coverLogoWidth });

  const kickerLabel = `${isShowroom ? T.showroomKickerPrefix : T.kickerPrefix} · ${new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', year: 'numeric' }).format(new Date(quote.createdAt)).toUpperCase()}`;
  doc.fillColor('#999').fontSize(9).font('Inter')
    .text(kickerLabel, 300, 40 + (coverLogoWidth * LOGO_ASPECT - 9) / 2, { width: 250, align: 'right', characterSpacing: 1 });

  doc.moveTo(PAGE_LEFT, 85).lineTo(PAGE_RIGHT, 85).stroke('#1F4E78');

  // Hero vehicle photo — matches whichever exterior color the quote actually has on it
  // (a quote_items row whose name is a known paint color), falling back to the model's
  // default photo for a color Geely hasn't been photographed in yet, or none picked.
  const selectedColorItem = items.find((item) => VEHICLE_COLOR_IMAGES[item.itemName]);
  const heroImagePath = (selectedColorItem && VEHICLE_COLOR_IMAGES[selectedColorItem.itemName]) || VEHICLE_IMAGES[vehicle.name];
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
    .text(fuelKicker(vehicle.fuel, lang), PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center', characterSpacing: 1.5 });
  cursorY += 22;

  doc.fillColor('#0F0F0F').fontSize(28).font('Inter-Bold')
    .text(vehicleLabel, PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center' });
  cursorY += 40;

  doc.fillColor('#666').fontSize(11).font('Inter')
    .text(isShowroom ? T.showroomSubtitle : `${T.personalQuoteFor} ${quote.customerName}`, PAGE_LEFT, cursorY, { width: CONTENT_WIDTH, align: 'center' });
  cursorY += 32;

  const specs = parseSpecifications(vehicle.specifications);
  const rangeValue = specs.range || specs.totalRange || specs.evRange || null;
  const badges = [
    translateFuel(vehicle.fuel, lang),
    translateTransmission(vehicle.transmission, lang),
    vehicle.power ? `${vehicle.power} ${powerUnit(lang)}` : null,
    rangeValue ? `${T.rangeLabel} ${rangeValue}` : null,
  ].filter(Boolean);
  cursorY = drawBadgeRow(doc, badges, cursorY);
  cursorY += 24;

  drawPriceBar(doc, { exclVat: quote.subtotal, vat: quote.vatAmount, inclVat: quote.totalPrice }, cursorY, T);

  // ===================== PAGE 2 — Offer details & pricing =====================
  doc.addPage();
  const smallLogoWidth = 70;
  drawContinuationHeader(doc, docTitle, vehicleLabel, smallLogoWidth);

  // Offer + customer info cards — height is computed from actual content instead of a
  // fixed number, since a company customer now carries a name, VAT number, and full
  // address, and a fixed height would clip that (or leave awkward extra space for a
  // private customer with fewer lines).
  const cardY = 108;
  // A showroom sheet has no customer card, so the info card spans the full width instead
  // of sharing the row.
  const cardWidth = isShowroom ? CONTENT_WIDTH : 245;

  const rightLines = [];
  if (!isShowroom) {
    if (quote.customerType === 'bedrijf' && quote.customerCompany) rightLines.push(quote.customerCompany);
    if (quote.customerType === 'bedrijf' && quote.customerVatNumber) rightLines.push(`${T.vatNumberLabel}: ${quote.customerVatNumber}`);
    if (quote.customerStreet) rightLines.push(quote.customerStreet);
    const cityLine = [quote.customerPostalCode, quote.customerCity].filter(Boolean).join(' ');
    if (cityLine) rightLines.push(cityLine);
    if (quote.customerEmail) rightLines.push(quote.customerEmail);
    if (quote.customerPhone) rightLines.push(quote.customerPhone);
  }

  const salespersonLineCount = quote.createdByName
    ? 1 + (quote.createdByEmail ? 1 : 0) + (quote.createdByPhone ? 1 : 0)
    : 0;
  // Non-showroom: aanbieder + (offertenr, datum, geldig-tot) + levertijd + vestiging(2) + verkoper.
  // Showroom drops the offer number and "geldig tot", keeping just aanbieder + datum.
  const infoLineCount = 1 + (isShowroom ? 1 : 3) + (vehicle.deliveryEstimate ? 1 : 0) + (quote.branchName ? 2 : 0) + salespersonLineCount;
  const cardHeight = Math.max(34 + infoLineCount * 16, 34 + 16 + rightLines.length * 16) + 8;

  doc.lineWidth(1);
  doc.roundedRect(PAGE_LEFT, cardY, cardWidth, cardHeight, 6).fillAndStroke('#F6F7F9', '#E5E7EB');
  if (!isShowroom) {
    doc.roundedRect(305, cardY, 245, cardHeight, 6).fillAndStroke('#F6F7F9', '#E5E7EB');
  }

  let cy = cardY + 16;
  doc.fillColor('#1F4E78').fontSize(9).font('Inter-Bold').text(T.quoteInfoHeader, 56, cy, { characterSpacing: 1 });
  cy += 18;
  doc.fillColor('#000').fontSize(9).font('Inter');
  doc.text(`${SELLER_COMPANY.name} · ${T.vatNumberLabel} ${SELLER_COMPANY.vatNumber}`, 56, cy); cy += 16;
  if (!isShowroom) {
    doc.text(`${T.quoteNumberLabel}: ${formatQuoteNumber(quote)}`, 56, cy); cy += 16;
  }
  doc.text(`${T.dateLabel}: ${formatDate(quote.createdAt, lang)}`, 56, cy);
  if (!isShowroom) {
    cy += 16;
    doc.text(`${T.validUntilLabel}: ${formatDate(quote.expiresAt, lang)}`, 56, cy);
  }
  if (vehicle.deliveryEstimate) {
    cy += 16;
    doc.text(`${T.deliveryTimeLabel}: ${vehicle.deliveryEstimate}`, 56, cy);
  }
  if (quote.branchName) {
    cy += 16;
    doc.fillColor('#000').fontSize(9).font('Inter').text(`${T.branchLabel}: ${quote.branchName}`, 56, cy);
    cy += 13;
    doc.fillColor('#666').fontSize(8).font('Inter').text(quote.branchAddress || '', 56, cy);
  }
  if (quote.createdByName) {
    cy += 16;
    doc.fillColor('#000').fontSize(9).font('Inter').text(`${T.salespersonLabel}: ${quote.createdByName}`, 56, cy);
    if (quote.createdByEmail) {
      cy += 13;
      doc.fillColor('#666').fontSize(8).font('Inter').text(quote.createdByEmail, 56, cy);
    }
    if (quote.createdByPhone) {
      cy += 13;
      doc.fillColor('#666').fontSize(8).font('Inter').text(quote.createdByPhone, 56, cy);
    }
  }

  if (!isShowroom) {
    let cy2 = cardY + 16;
    doc.fillColor('#1F4E78').fontSize(9).font('Inter-Bold').text(T.customerInfoHeader, 321, cy2, { characterSpacing: 1 });
    cy2 += 18;
    doc.fillColor('#000').fontSize(9).font('Inter-Bold').text(quote.customerName, 321, cy2);
    cy2 += 16;
    doc.font('Inter');
    rightLines.forEach((line) => { doc.text(line, 321, cy2); cy2 += 16; });
  }

  let yPos = cardY + cardHeight + 18;

  doc.fillColor('#999').fontSize(8).font('Inter')
    .text(T.priceDisclaimer, PAGE_LEFT, yPos);
  yPos += 12;

  // Pricing breakdown table
  const drawTableHeaderBar = (y) => {
    doc.fontSize(9).font('Inter-Bold').fillColor('#FFF');
    doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 24).fill('#1F4E78');
    doc.fillColor('#FFF').text(T.colDescription, 50, y + 7);
    doc.text(T.colUnitPrice, 350, y + 7);
    doc.text(T.colQuantity, 430, y + 7);
    doc.text(T.colTotal, 480, y + 7);
  };
  drawTableHeaderBar(yPos);
  yPos += 24;

  // A non-discountable line (the delivery pack, a towing hook, ...) gets a visible tag
  // appended to its name so a customer can see at a glance why the discount didn't touch
  // that particular line, rather than it just quietly not adding up.
  const rows = [
    { name: vehicleLabel, unitPrice: quote.basePrice, quantity: 1, totalPrice: quote.basePrice },
    ...items.map(item => ({
      name: translateAccessoryName(item.itemName, lang) + (item.discountable ? '' : ` (${T.nonDiscountableTag})`),
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      totalPrice: item.totalPrice,
    })),
  ];

  const rowHeight = 18;
  const pageBottomForTable = doc.page.height - doc.page.margins.bottom;
  doc.font('Inter').fontSize(9);
  rows.forEach((row, index) => {
    // A catalog with enough options selected can push this table past the bottom
    // margin — pdfkit's own auto-pagination on .text() would silently insert a page
    // here without this yPos tracker knowing, corrupting every section drawn below
    // (subtotal, VAT box, trade-in). Break proactively instead,
    // with a fresh header and a repeated column bar so the continuation reads cleanly.
    if (yPos + rowHeight > pageBottomForTable) {
      doc.addPage();
      drawContinuationHeader(doc, docTitle, vehicleLabel, smallLogoWidth);
      yPos = 108;
      drawTableHeaderBar(yPos);
      yPos += 24;
      doc.font('Inter').fontSize(9);
    }
    if (index % 2 === 1) {
      doc.rect(PAGE_LEFT, yPos, CONTENT_WIDTH, rowHeight).fill('#F9FAFB');
    }
    doc.fillColor('#000');
    doc.text(row.name, 50, yPos + 4, { width: 290 });
    doc.text(formatPrice(row.unitPrice), 350, yPos + 4);
    doc.text(row.quantity.toString(), 430, yPos + 4);
    doc.text(formatPrice(row.totalPrice), 480, yPos + 4);
    yPos += rowHeight;
  });

  doc.moveTo(PAGE_LEFT, yPos + 4).lineTo(PAGE_RIGHT, yPos + 4).stroke('#CCC');
  yPos += 16;

  const hasTradeIn = quote.tradeInEnabled && quote.tradeInValue > 0;

  // The subtotal/discount lines and the excl./incl.-BTW box below all belong to one
  // visual unit (the running price ladder) — if it doesn't fit as a whole, break before
  // any of it starts rather than splitting it awkwardly across two pages.
  const priceLadderHeight = 18 + (quote.discountAmount > 0 ? 18 : 0) + 6
    + (hasTradeIn ? 13 : 0) + (hasTradeIn ? 118 : 76) + (hasTradeIn ? 12 : 0);
  if (yPos + priceLadderHeight > pageBottomForTable) {
    doc.addPage();
    drawContinuationHeader(doc, docTitle, vehicleLabel, smallLogoWidth);
    yPos = 108;
  }

  doc.fontSize(9).font('Inter').fillColor('#000');
  doc.text(T.subtotalInclVat, 350, yPos, { width: 120 });
  doc.text(formatPrice(quote.basePrice + quote.accessories), 480, yPos, { width: 70, align: 'right' });
  yPos += 18;

  // Gated on discountAmount (what was actually deducted) rather than discountPercentage —
  // a 'fixed' discount stores its value in discountEuro/discountAmount and leaves
  // discountPercentage at 0, so checking only discountPercentage skipped this line
  // entirely for a fixed discount even though the totals below are already net of it.
  if (quote.discountAmount > 0) {
    const label = quote.discountType === 'fixed' ? T.discountLabelFixed : T.discountLabel(quote.discountPercentage.toLocaleString(LOCALE[lang]));
    doc.text(label, 350, yPos, { width: 120 });
    doc.text('-' + formatPrice(quote.discountAmount), 480, yPos, { width: 70, align: 'right' });
    yPos += 18;
  }
  yPos += 6;

  // Excl./BTW/incl. summary box — a trade-in deduction (if any) is added as two more
  // rows of the SAME box, right below the incl.-BTW total, instead of a second separate
  // card. It's really just the next two lines of one running total ("this is the car's
  // price, this is what you get for your old one, this is what's left to pay"), and
  // folding it in keeps the whole price ladder compact — worth doing deliberately, not
  // just to save space, since one continuous box also reads more clearly than two.
  const boxWidth = 260;
  const boxX = PAGE_RIGHT - boxWidth;
  const boxPadding = 14;
  const labelWidth = 140;
  const valueX = boxX + boxPadding + labelWidth;
  const valueWidth = boxWidth - boxPadding * 2 - labelWidth;

  if (hasTradeIn) {
    const tradeInLabel = [quote.tradeInMake, quote.tradeInModel].filter(Boolean).join(' ') || T.tradeInFallback;
    const tradeInDetail = [
      quote.tradeInYear ? `${T.tradeInYearWord} ${quote.tradeInYear}` : null,
      quote.tradeInMileage ? `${Number(quote.tradeInMileage).toLocaleString(LOCALE[lang])} km` : null,
    ].filter(Boolean).join(', ');
    doc.font('Inter').fontSize(8).fillColor('#999').text(
      tradeInDetail ? `${T.tradeInPrefix}: ${tradeInLabel} (${tradeInDetail})` : `${T.tradeInPrefix}: ${tradeInLabel}`,
      boxX, yPos, { width: boxWidth, align: 'right' }
    );
    yPos += 13;
  }

  const boxHeight = hasTradeIn ? 118 : 76;
  doc.roundedRect(boxX, yPos, boxWidth, boxHeight, 8).fillAndStroke('#F6F7F9', '#E5E7EB');

  let rowY = yPos + 14;
  doc.font('Inter').fontSize(9).fillColor('#333');
  doc.text(T.totalExclVat, boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.subtotal), valueX, rowY, { width: valueWidth, align: 'right' });

  rowY += 16;
  doc.text(T.vat21, boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.vatAmount), valueX, rowY, { width: valueWidth, align: 'right' });

  rowY += 20;
  doc.moveTo(boxX + boxPadding, rowY - 7).lineTo(boxX + boxWidth - boxPadding, rowY - 7).stroke('#CBD3DB');

  doc.font('Inter-Bold').fontSize(12).fillColor('#1F4E78');
  doc.text(T.totalInclVatLine, boxX + boxPadding, rowY, { width: labelWidth });
  doc.text(formatPrice(quote.totalPrice), valueX, rowY, { width: valueWidth, align: 'right' });

  if (hasTradeIn) {
    rowY += 26;
    doc.font('Inter').fontSize(9).fillColor('#333');
    doc.text(T.tradeInValueLabel, boxX + boxPadding, rowY, { width: labelWidth });
    doc.text('-' + formatPrice(quote.tradeInValue), valueX, rowY, { width: valueWidth, align: 'right' });

    rowY += 20;
    doc.moveTo(boxX + boxPadding, rowY - 7).lineTo(boxX + boxWidth - boxPadding, rowY - 7).stroke('#CBD3DB');

    doc.font('Inter-Bold').fontSize(12).fillColor('#1F4E78');
    doc.text(T.payableAfterTradeIn, boxX + boxPadding, rowY, { width: labelWidth });
    doc.text(formatPrice(Math.max(0, quote.totalPrice - quote.tradeInValue)), valueX, rowY, { width: valueWidth, align: 'right' });
  }

  yPos += boxHeight;
  if (hasTradeIn) {
    yPos += 3;
    doc.font('Inter').fontSize(7).fillColor('#999')
      .text(T.tradeInDisclaimer, boxX, yPos, { width: boxWidth, align: 'right' });
    yPos += 9;
  }
  yPos += 12;

  // Notes — if the full block wouldn't fit in what's left of this page, start a fresh
  // page for it (with its own header) instead of letting pdfkit's default text-flow
  // silently auto-paginate mid-paragraph. That auto page-break happens inside the
  // doc.text() call itself, invisibly to the yPos this function tracks by hand — the
  // footer placement right after this would then be computed from a yPos that no longer
  // corresponds to where the page cursor actually ended up.
  if (quote.notes) {
    const notesLabelHeight = 12;
    doc.fontSize(8).font('Inter');
    const notesHeight = doc.heightOfString(quote.notes, { width: CONTENT_WIDTH });
    const pageBottomForNotes = doc.page.height - doc.page.margins.bottom;
    if (yPos + notesLabelHeight + notesHeight + 10 > pageBottomForNotes) {
      doc.addPage();
      drawContinuationHeader(doc, docTitle, vehicleLabel, smallLogoWidth);
      yPos = 108;
    }

    doc.fillColor('#000').fontSize(9).font('Inter-Bold').text(T.notesLabel, PAGE_LEFT, yPos);
    yPos += notesLabelHeight;
    doc.fontSize(8).font('Inter').fillColor('#333');
    doc.text(quote.notes, PAGE_LEFT, yPos, { width: CONTENT_WIDTH });
    yPos += notesHeight + 10;
  }

  // Footer — break to a new page only if it genuinely doesn't fit against the real page
  // geometry, so it never lands stranded below the bottom margin.
  const footerHeight = 24;
  const pageBottomForFooter = doc.page.height - doc.page.margins.bottom;
  if (yPos + footerHeight > pageBottomForFooter) {
    doc.addPage();
    drawContinuationHeader(doc, docTitle, vehicleLabel, smallLogoWidth);
    yPos = 108;
  }
  doc.fontSize(8).fillColor('#666');
  doc.text(T.footerTagline, PAGE_LEFT, yPos, { width: CONTENT_WIDTH, align: 'center' });
  doc.text(isShowroom ? T.showroomFooterValidity : T.footerValidity, PAGE_LEFT, yPos + 12, { width: CONTENT_WIDTH, align: 'center' });

  // ===================== Standard equipment (one page, two columns) =====================
  const equipment = getStandardEquipment(vehicle.name, vehicle.model, lang);
  if (equipment.length > 0) {
    doc.addPage();
    drawContinuationHeader(doc, T.equipmentTitle, vehicleLabel, smallLogoWidth);

    drawEquipmentColumns(doc, equipment, 108);
  }

  // ===================== Interieur (own page, one full-width photo) =====================
  const interiorImagePath = VEHICLE_INTERIOR_IMAGES[vehicle.name];
  if (interiorImagePath) {
    doc.addPage();
    drawContinuationHeader(doc, T.interiorTitle, vehicleLabel, smallLogoWidth);

    const img = doc.openImage(interiorImagePath);
    const aspect = img.width / img.height;
    const drawWidth = CONTENT_WIDTH;
    const drawHeight = CONTENT_WIDTH / aspect;
    doc.image(interiorImagePath, PAGE_LEFT, 108, { width: drawWidth, height: drawHeight });
  }

  // ===================== Technische gegevens & afmetingen (own page, two columns) =====================
  const techSpecs = getTechnicalSpecs(vehicle.name, vehicle.model, lang);
  if (techSpecs) {
    doc.addPage();
    drawContinuationHeader(doc, T.specsTitle, vehicleLabel, smallLogoWidth);

    const sections = Object.entries(T.specSections)
      .filter(([key]) => techSpecs[key]?.length)
      .map(([key, title]) => ({ title, rows: techSpecs[key] }));
    drawSpecColumns(doc, sections, 108);
  }

  // ===================== Garantie & service (own page) =====================
  // T&C's are appended after this on their own page(s) by whatever calls renderQuotePdf next.
  doc.addPage();
  drawContinuationHeader(doc, T.warrantyTitle, vehicleLabel, smallLogoWidth);
  drawWarrantyTiles(doc, getWarrantyInfo(lang), 108);

  // Page numbers on every page. Drawing this far down the page would normally trip pdfkit's
  // auto page-break (it would silently insert a fresh blank page and draw there instead) —
  // temporarily zeroing the bottom margin for this one draw call prevents that.
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor('#AAA').fontSize(8).font('Inter')
      .text(T.pageOf(i + 1, pageRange.count), PAGE_LEFT, 760, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
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
router.get('/:quoteId', requireAuth, blockPendingPasswordChange, async (req, res) => {
  try {
    const { quote, vehicle, items } = await loadQuoteForPdf(req.params.quoteId);

    const doc = new PDFDocument({ bufferPages: true, margin: 40 });
    const T = PDF[resolveLang(quote.language)];
    const filename = quote.isShowroom
      ? `${T.showroomTitle.replace(/\s+/g, '_')}_${`${vehicle.name} ${vehicle.model}`.replace(/\s+/g, '_')}.pdf`
      : `${T.filenamePrefix}${formatQuoteNumber(quote)}_${quote.customerName.replace(/\s+/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    renderQuotePdf(doc, { quote, vehicle, items });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
