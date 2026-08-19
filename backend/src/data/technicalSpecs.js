// Transcribed from the official Geely price lists (juli 2026): "BE - Prijslijst Geely E5 -
// NL.pdf" and "BE - Prijslijst Starray EM-i - NL.pdf". Values that differ by trim (PRO /
// PRO+ / MAX+) are looked up per model; everything else is shared across the range.
export const TECHNICAL_SPECS = {
  'Geely E5': {
    drivetrain: (model) => [
      { label: 'Motorvermogen', value: '160 kW · 218 pk' },
      { label: 'Koppel', value: '320 Nm' },
      { label: 'Aandrijving', value: 'Voorwielaandrijving' },
      { label: 'Batterijtype', value: 'LFP' },
      { label: 'Capaciteit', value: { PRO: '60 kWh', 'PRO+': '68 kWh', 'MAX+': '68 kWh' }[model] },
      { label: 'Rijmodi', value: 'ECO · NORMAL · SPORT' },
    ],
    chassis: (model) => [
      { label: 'Carrosserie', value: 'SUV · 5 zitplaatsen' },
      { label: 'Vering voor', value: 'McPherson' },
      { label: 'Vering achter', value: 'Multilink' },
      { label: 'Remmen', value: 'Voor geventileerd / achter massief' },
      { label: 'Draaicirkel', value: '10,8 m' },
      { label: 'Banden', value: { PRO: '225/55 R18', 'PRO+': '225/55 R18', 'MAX+': '235/50 R19' }[model] },
    ],
    performance: (model) => [
      { label: 'Topsnelheid', value: '180 km/u' },
      { label: '0–100 km/u', value: { PRO: '6,9 s', 'PRO+': '7,4 s', 'MAX+': '7,6 s' }[model] },
      { label: 'Verbruik', value: { PRO: '15,8 kWh/100 km', 'PRO+': '16,0 kWh/100 km', 'MAX+': '16,9 kWh/100 km' }[model] },
      { label: 'CO₂-uitstoot', value: '0 g/km (WLTP)' },
    ],
    weight: (model) => [
      { label: 'Leeggewicht', value: { PRO: '1.690 kg', 'PRO+': '1.741 kg', 'MAX+': '1.790 kg' }[model] },
      { label: 'Rijklaar gewicht', value: { PRO: '1.790 kg', 'PRO+': '1.841 kg', 'MAX+': '1.890 kg' }[model] },
      { label: 'Aanhanger (ge-/ongeremd)', value: { PRO: 'Niet mogelijk', 'PRO+': '750 kg', 'MAX+': '750 kg' }[model] },
      { label: 'Max. kogeldruk', value: { PRO: 'Niet mogelijk', 'PRO+': '75 kg', 'MAX+': '75 kg' }[model] },
    ],
    charging: (model) => [
      { label: 'WLTP-actieradius', value: { PRO: '430 km', 'PRO+': '475 km', 'MAX+': '450 km' }[model] },
      { label: 'AC-laden 10–100%', value: { PRO: '6,1 u', 'PRO+': '7 u', 'MAX+': '7 u' }[model] },
      { label: 'Max. AC-vermogen', value: '11 kW' },
      { label: 'DC-snelladen 30–80%', value: '20 min · max. 100 kW' },
    ],
    dimensions: () => [
      { label: 'Lengte × breedte × hoogte', value: '4.615 × 1.901 × 1.670 mm' },
      { label: 'Wielbasis', value: '2.750 mm' },
      { label: 'Overhang voor / achter', value: '928 / 937 mm' },
      { label: 'Kofferbak (min / max)', value: '461 / 1.877 liter' },
    ],
  },

  'Starray EM-i': {
    drivetrain: (model) => [
      { label: 'Systeemvermogen', value: '262 pk · 193 kW' },
      { label: 'Systeem', value: 'GEELY EM-i Hybrid System' },
      { label: 'Verbrandingsmotor', value: '1.5L 4 cilinders · 73 kW / 125 Nm' },
      { label: 'Elektromotor', value: '160 kW / 262 Nm' },
      { label: 'Transmissie', value: '1DHT Automatic' },
      { label: 'Batterijtype', value: 'LFP' },
      { label: 'Batterijcapaciteit', value: { PRO: '18,4 kWh', 'PRO+': '29,8 kWh', 'MAX+': '29,8 kWh' }[model] },
      { label: 'Brandstoftank', value: '51 L' },
      { label: 'Brandstofsoort', value: '#95 E10' },
      { label: 'Emissienorm', value: 'Euro 6e-bis' },
    ],
    chassis: (model) => [
      { label: 'Carrosserie', value: 'SUV · 5 zitplaatsen' },
      { label: 'Aandrijving', value: 'Voorwielaandrijving' },
      { label: 'Vering voor', value: 'McPherson' },
      { label: 'Vering achter', value: 'Multilink' },
      { label: 'Remmen', value: 'Voor geventileerd / achter massief' },
      { label: 'Draaicirkel', value: '10,4 m' },
      { label: 'Banden', value: { PRO: '225/55 R18', 'PRO+': '235/50 R19', 'MAX+': '235/50 R19' }[model] },
      { label: 'Rijmodi', value: 'Pure · Hybrid · Power' },
    ],
    performance: (model) => [
      { label: 'Topsnelheid', value: '170 km/u' },
      { label: '0–100 km/u', value: { PRO: '8 s', 'PRO+': '8,2 s', 'MAX+': '8,2 s' }[model] },
      { label: 'Brandstofverbruik', value: { PRO: '2,4 L/100 km', 'PRO+': '1,5 L/100 km', 'MAX+': '1,5 L/100 km' }[model] },
      { label: 'CO₂-uitstoot', value: { PRO: '54 g/km', 'PRO+': '33 g/km', 'MAX+': '33 g/km' }[model] },
    ],
    weight: (model) => [
      { label: 'Leeggewicht', value: { PRO: '1.702 kg', 'PRO+': '1.790 kg', 'MAX+': '1.790 kg' }[model] },
      { label: 'Rijklaar gewicht', value: { PRO: '1.802 kg', 'PRO+': '1.890 kg', 'MAX+': '1.890 kg' }[model] },
      { label: 'Aanhanger (ge-/ongeremd)', value: { PRO: 'Niet mogelijk', 'PRO+': '750 kg', 'MAX+': '750 kg' }[model] },
      { label: 'Max. kogeldruk', value: { PRO: 'Niet mogelijk', 'PRO+': '75 kg', 'MAX+': '75 kg' }[model] },
    ],
    charging: (model) => [
      { label: 'Elektrisch bereik (gecombineerd)', value: { PRO: '83 km', 'PRO+': '136 km', 'MAX+': '136 km' }[model] },
      { label: 'Elektrisch bereik (stad)', value: { PRO: '112 km', 'PRO+': '185 km', 'MAX+': '185 km' }[model] },
      { label: 'Totale actieradius', value: { PRO: '1.002 km', 'PRO+': '1.055 km', 'MAX+': '1.055 km' }[model] },
      { label: 'AC-laden 25–100%', value: { PRO: '3 u', 'PRO+': '4,6 u', 'MAX+': '4,6 u' }[model] },
      { label: 'Max. AC-vermogen', value: '6,6 kW' },
      { label: 'DC-snelladen 30–80%', value: { PRO: '20 min · max. 30 kW', 'PRO+': '16 min · max. 60 kW', 'MAX+': '16 min · max. 60 kW' }[model] },
    ],
    dimensions: () => [
      { label: 'Lengte × breedte × hoogte', value: '4.740 × 1.905 × 1.685 mm' },
      { label: 'Wielbasis', value: '2.755 mm' },
      { label: 'Overhang voor / achter', value: '968 / 1.017 mm' },
      { label: 'Kofferbak (rechtop / plat)', value: '528 / 2.065 liter' },
    ],
  },
};

// Returns { drivetrain, chassis, performance, weight, charging, dimensions }, each an array
// of {label, value}, or null if this vehicle/model isn't in the price list data above (e.g.
// the Geely E2, which has no published specs yet). lang='fr' translates each row's label
// and value for a French quote — see translateSpecLabel/translateSpecValue below.
export function getTechnicalSpecs(vehicleName, model, lang = 'nl') {
  const data = TECHNICAL_SPECS[vehicleName];
  if (!data) return null;
  const sections = {
    drivetrain: data.drivetrain(model),
    chassis: data.chassis(model),
    performance: data.performance(model),
    weight: data.weight(model),
    charging: data.charging(model),
    dimensions: data.dimensions(model),
  };
  if (lang !== 'fr') return sections;
  return Object.fromEntries(
    Object.entries(sections).map(([key, rows]) => [
      key,
      rows.map((row) => ({ label: translateSpecLabel(row.label), value: translateSpecValue(row.value) })),
    ])
  );
}

// Labels are a small closed set shared across both vehicles' spec tables — translated by
// exact lookup. Falls back to the Dutch original for anything not in the map, rather than
// dropping the row, so an unrecognized label still renders instead of disappearing.
// AI-drafted — flag for a native French speaker to review before this reaches a real
// customer quote.
const SPEC_LABEL_FR = {
  'Motorvermogen': 'Puissance moteur',
  'Koppel': 'Couple',
  'Aandrijving': 'Type de traction',
  'Batterijtype': 'Type de batterie',
  'Capaciteit': 'Capacité',
  'Rijmodi': 'Modes de conduite',
  'Carrosserie': 'Carrosserie',
  'Vering voor': 'Suspension avant',
  'Vering achter': 'Suspension arrière',
  'Remmen': 'Freins',
  'Draaicirkel': 'Rayon de braquage',
  'Banden': 'Pneus',
  'Topsnelheid': 'Vitesse maximale',
  '0–100 km/u': '0–100 km/h',
  'Verbruik': 'Consommation',
  'CO₂-uitstoot': 'Émissions de CO₂',
  'Leeggewicht': 'Poids à vide',
  'Rijklaar gewicht': 'Poids en ordre de marche',
  'Aanhanger (ge-/ongeremd)': 'Remorque (freinée/non freinée)',
  'Max. kogeldruk': 'Charge max. sur attelage',
  'WLTP-actieradius': 'Autonomie WLTP',
  'AC-laden 10–100%': 'Charge AC 10–100 %',
  'Max. AC-vermogen': 'Puissance AC max.',
  'DC-snelladen 30–80%': 'Charge rapide DC 30–80 %',
  'Lengte × breedte × hoogte': 'Longueur × largeur × hauteur',
  'Wielbasis': 'Empattement',
  'Overhang voor / achter': 'Porte-à-faux avant / arrière',
  'Kofferbak (min / max)': 'Coffre (min / max)',
  'Systeemvermogen': 'Puissance système',
  'Systeem': 'Système',
  'Verbrandingsmotor': 'Moteur thermique',
  'Elektromotor': 'Moteur électrique',
  'Transmissie': 'Transmission',
  'Batterijcapaciteit': 'Capacité de la batterie',
  'Brandstoftank': 'Réservoir de carburant',
  'Brandstofsoort': 'Type de carburant',
  'Emissienorm': "Norme d'émissions",
  'Elektrisch bereik (gecombineerd)': 'Autonomie électrique (mixte)',
  'Elektrisch bereik (stad)': 'Autonomie électrique (ville)',
  'Totale actieradius': 'Autonomie totale',
  'AC-laden 25–100%': 'Charge AC 25–100 %',
  'Kofferbak (rechtop / plat)': 'Coffre (relevé / rabattu)',
  'Brandstofverbruik': 'Consommation de carburant',
};

function translateSpecLabel(label) {
  return SPEC_LABEL_FR[label] || label;
}

// Values are mostly numbers + units shared unchanged between nl-BE and fr-BE (kg, km, Nm,
// kW, mm, s, g/km, L/100km, decimal commas). Only the handful of Dutch words/unit
// abbreviations mixed into them need translating — exact phrases first (safest), then a
// few word-boundary unit swaps ('pk'->'ch', 'km/u'->'km/h', a trailing hour 'u'->'h',
// 'liter'->'litres', 'cilinders'->'cylindres') for whatever numeric value they're attached to.
const SPEC_VALUE_EXACT_FR = {
  'Niet mogelijk': 'Non disponible',
  'Voorwielaandrijving': 'Traction avant',
  'Voor geventileerd / achter massief': "Ventilés à l'avant / pleins à l'arrière",
  'SUV · 5 zitplaatsen': 'SUV · 5 places',
};

function translateSpecValue(value) {
  if (typeof value !== 'string') return value;
  if (SPEC_VALUE_EXACT_FR[value]) return SPEC_VALUE_EXACT_FR[value];
  return value
    .replace(/\bpk\b/g, 'ch')
    .replace(/\bkm\/u\b/g, 'km/h')
    .replace(/(\d)\s+u\b/g, '$1 h')
    .replace(/\bliter\b/g, 'litres')
    .replace(/\bcilinders\b/g, 'cylindres');
}

// Identical across the range per both price lists (page 8 of each).
const WARRANTY_INFO_NL = [
  {
    title: '8 jaar',
    subtitle: 'Fabrieksgarantie',
    text: 'Standaard 8 jaar fabrieksgarantie (of 200.000 km). Daarnaast 12 jaar garantie op de carrosserie.',
  },
  {
    title: '8 jaar',
    subtitle: 'Batterijgarantie',
    text: '8 jaar of 200.000 km garantie op de batterij, op een minimale 70% state-of-health.',
  },
  {
    title: '24/7',
    subtitle: 'Pechhulp in Europa',
    text: 'Onze pechhulp staat in heel Europa elke dag, dag en nacht, voor u klaar. Gratis: 0800-76181.',
  },
];

const WARRANTY_INFO_FR = [
  {
    title: '8 ans',
    subtitle: 'Garantie constructeur',
    text: 'Garantie constructeur standard de 8 ans (ou 200 000 km). Garantie carrosserie de 12 ans en complément.',
  },
  {
    title: '8 ans',
    subtitle: 'Garantie batterie',
    text: "Garantie batterie de 8 ans ou 200 000 km, avec un état de santé minimal garanti de 70 %.",
  },
  {
    title: '24/7',
    subtitle: 'Assistance dépannage en Europe',
    text: "Notre assistance dépannage est à votre disposition partout en Europe, jour et nuit. Gratuit : 0800-76181.",
  },
];

export function getWarrantyInfo(lang = 'nl') {
  return lang === 'fr' ? WARRANTY_INFO_FR : WARRANTY_INFO_NL;
}
