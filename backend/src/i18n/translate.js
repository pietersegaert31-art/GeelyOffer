// Bilingual (NL/FR) support for customer-facing output only — the quote PDF and the
// e-mail that delivers it. The internal app UI (admin panel, quote builder, etc.) stays
// Dutch-only for staff; only what a customer actually reads switches with quote.language.
//
// AI-drafted French — flagged for a native-speaker review pass before relying on it for
// real customer-facing quotes, especially the automotive terminology in
// standardEquipment.js and technicalSpecs.js.

export const LOCALE = { nl: 'nl-BE', fr: 'fr-BE' };

// Every quote.language value should already be 'nl' or 'fr' (the column defaults to
// 'nl' and the API validates it), but this is the single point every consumer routes
// through so a stray/legacy value can never crash rendering — it just falls back to nl.
export function resolveLang(lang) {
  return lang === 'fr' ? 'fr' : 'nl';
}

const FUEL_LABELS = {
  fr: { 'Elektrisch': 'Électrique', 'Plug-in Hybrid': 'Hybride rechargeable' },
};

// Vehicle.fuel is free-text from the DB (Dutch, set by an admin) — only the known seeded
// values are translated; anything else passes through unchanged rather than guessing.
export function translateFuel(fuel, lang) {
  return FUEL_LABELS[resolveLang(lang)]?.[fuel] || fuel;
}

const TRANSMISSION_LABELS = {
  fr: { 'Automatisch': 'Automatique', 'Manueel': 'Manuelle' },
};

export function translateTransmission(transmission, lang) {
  return TRANSMISSION_LABELS[resolveLang(lang)]?.[transmission] || transmission;
}

export function powerUnit(lang) {
  return resolveLang(lang) === 'fr' ? 'ch' : 'pk';
}

const FUEL_KICKER = {
  nl: { 'Elektrisch': '100% ELEKTRISCH', 'Plug-in Hybrid': 'PLUG-IN HYBRIDE' },
  fr: { 'Elektrisch': '100% ÉLECTRIQUE', 'Plug-in Hybrid': 'HYBRIDE RECHARGEABLE' },
};

export function fuelKicker(fuel, lang) {
  const l = resolveLang(lang);
  return FUEL_KICKER[l]?.[fuel] || (fuel || '').toUpperCase();
}

// Accessory/option names are free text copied from the (admin-managed, Dutch) accessories
// catalog into each quote at creation time — not structured data. Only the small set of
// known catalog-prefix conventions gets swapped for a French quote; the product name
// itself (a color, a pack) is a proper noun and stays as-is.
const ACCESSORY_PREFIXES_FR = [
  ['Bekleding:', 'Sellerie :'],
  ['Metallic:', 'Métallisé :'],
];

export function translateAccessoryName(name, lang) {
  if (resolveLang(lang) !== 'fr' || !name) return name;
  if (name === 'Delivery Pack') return 'Pack de livraison';
  for (const [nl, fr] of ACCESSORY_PREFIXES_FR) {
    if (name.startsWith(nl)) return fr + name.slice(nl.length);
  }
  return name;
}

export const PDF = {
  nl: {
    kickerPrefix: 'OFFERTE',
    personalQuoteFor: 'Persoonlijke offerte voor',
    rangeLabel: 'Actieradius',
    priceExclVat: 'PRIJS EXCL. BTW',
    vat21: 'BTW (21%)',
    totalInclVatBar: 'TOTAALPRIJS INCL. BTW',
    quoteTitle: 'Offerte',
    quoteInfoHeader: 'OFFERTEGEGEVENS',
    customerInfoHeader: 'KLANTGEGEVENS',
    quoteNumberLabel: 'Offertenummer',
    dateLabel: 'Datum',
    validUntilLabel: 'Geldig tot',
    deliveryTimeLabel: 'Levertijd',
    branchLabel: 'Vestiging',
    vatNumberLabel: 'BTW',
    priceDisclaimer: 'Alle vermelde prijzen zijn Geely-adviesprijzen, inclusief 21% BTW.',
    colDescription: 'Omschrijving',
    colUnitPrice: 'Eenheidsprijs',
    colQuantity: 'Aantal',
    colTotal: 'Totaal',
    subtotalInclVat: 'Subtotaal (incl. BTW):',
    discountLabel: (pct) => `Korting (${pct}%):`,
    tradeInPrefix: 'Inruilwagen',
    tradeInFallback: 'Inruilwagen',
    tradeInYearWord: 'bouwjaar',
    totalExclVat: 'Totaalprijs excl. BTW',
    totalInclVatLine: 'Totaalprijs incl. BTW',
    tradeInValueLabel: 'Inruilwaarde (geschat)',
    payableAfterTradeIn: 'Te betalen na inruil',
    tradeInDisclaimer: 'Schatting door de verkoper, geen bindende taxatie.',
    financingHeader: 'FINANCIERINGSSIMULATIE',
    perMonth: (term) => `per maand · ${term} mnd`,
    financingDisclaimer: (rate) => `Indicatieve schatting o.b.v. ${rate}% jaarrente, geen bindend aanbod. Neem contact op met onze financieringspartner voor een persoonlijk voorstel.`,
    notesLabel: 'Opmerkingen:',
    signatureIntro: 'Bedankt voor uw interesse in deze Geely. Onderteken hieronder voor akkoord.',
    sigSeller: 'HANDTEKENING VERKOPER',
    sigCustomer: 'HANDTEKENING KLANT — VOOR AKKOORD',
    signatureDateLine: 'Datum: ____________________',
    footerTagline: 'Geely Belgium | Professionele Voertuigoplossingen',
    footerValidity: 'Deze offerte is 30 dagen geldig vanaf bovenstaande datum.',
    equipmentTitle: 'Standaarduitrusting',
    specsTitle: 'Technische gegevens',
    warrantyTitle: 'Garantie & service',
    pageOf: (page, total) => `Pagina ${page} van ${total}`,
    filenamePrefix: 'Offerte_Geely_',
    specSections: {
      drivetrain: 'Aandrijflijn',
      chassis: 'Chassis',
      performance: 'Prestaties',
      weight: 'Gewicht & trekken',
      charging: 'Actieradius & laden',
      dimensions: 'Afmetingen',
    },
  },
  fr: {
    kickerPrefix: 'DEVIS',
    personalQuoteFor: 'Devis personnalisé pour',
    rangeLabel: 'Autonomie',
    priceExclVat: 'PRIX HORS TVA',
    vat21: 'TVA (21 %)',
    totalInclVatBar: 'PRIX TOTAL TVA INCL.',
    quoteTitle: 'Devis',
    quoteInfoHeader: 'DÉTAILS DU DEVIS',
    customerInfoHeader: 'COORDONNÉES CLIENT',
    quoteNumberLabel: 'Numéro de devis',
    dateLabel: 'Date',
    validUntilLabel: 'Valable jusqu\'au',
    deliveryTimeLabel: 'Délai de livraison',
    branchLabel: 'Agence',
    vatNumberLabel: 'TVA',
    priceDisclaimer: 'Tous les prix indiqués sont des prix conseillés Geely, TVA de 21 % incluse.',
    colDescription: 'Description',
    colUnitPrice: 'Prix unitaire',
    colQuantity: 'Quantité',
    colTotal: 'Total',
    subtotalInclVat: 'Sous-total (TVA incl.) :',
    discountLabel: (pct) => `Remise (${pct}%) :`,
    tradeInPrefix: 'Reprise',
    tradeInFallback: 'Véhicule de reprise',
    tradeInYearWord: 'année',
    totalExclVat: 'Prix total hors TVA',
    totalInclVatLine: 'Prix total TVA incl.',
    tradeInValueLabel: 'Valeur de reprise (estimée)',
    payableAfterTradeIn: 'À payer après reprise',
    tradeInDisclaimer: 'Estimation du vendeur, non contractuelle.',
    financingHeader: 'SIMULATION DE FINANCEMENT',
    perMonth: (term) => `par mois · ${term} mois`,
    financingDisclaimer: (rate) => `Estimation indicative sur base d'un taux annuel de ${rate} %, offre non contractuelle. Contactez notre partenaire financier pour une proposition personnalisée.`,
    notesLabel: 'Remarques :',
    signatureIntro: 'Merci pour votre intérêt pour ce modèle Geely. Signez ci-dessous pour accord.',
    sigSeller: 'SIGNATURE VENDEUR',
    sigCustomer: 'SIGNATURE CLIENT — POUR ACCORD',
    signatureDateLine: 'Date : ____________________',
    footerTagline: 'Geely Belgium | Solutions Automobiles Professionnelles',
    footerValidity: 'Ce devis est valable 30 jours à compter de la date ci-dessus.',
    equipmentTitle: 'Équipement de série',
    specsTitle: 'Données techniques',
    warrantyTitle: 'Garantie & service',
    pageOf: (page, total) => `Page ${page} sur ${total}`,
    filenamePrefix: 'Devis_Geely_',
    specSections: {
      drivetrain: 'Groupe motopropulseur',
      chassis: 'Châssis',
      performance: 'Performances',
      weight: 'Poids & remorquage',
      charging: 'Autonomie & recharge',
      dimensions: 'Dimensions',
    },
  },
};

export const EMAIL = {
  nl: {
    quoteSubject: (vehicleLabel) => `Uw Geely offerte — ${vehicleLabel}`,
    greeting: (name) => `Beste ${name},`,
    attachedIntro: (vehicleLabel) => `Bijgevoegd vindt u uw persoonlijke offerte voor de ${vehicleLabel}.`,
    acceptIntro: 'Akkoord met deze offerte? Bevestig online, zonder te moeten afdrukken of ondertekenen:',
    signOff: 'Met vriendelijke groeten,',
  },
  fr: {
    quoteSubject: (vehicleLabel) => `Votre devis Geely — ${vehicleLabel}`,
    greeting: (name) => `Bonjour ${name},`,
    attachedIntro: (vehicleLabel) => `Vous trouverez ci-joint votre devis personnalisé pour la ${vehicleLabel}.`,
    acceptIntro: 'Vous marquez votre accord sur ce devis ? Confirmez-le en ligne, sans devoir l\'imprimer ni le signer :',
    signOff: 'Cordialement,',
  },
};
