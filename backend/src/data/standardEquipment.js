// Standard equipment per model, sourced from the official Geely Belgium price lists (juli 2026).
// PRO and PRO+ share the same standard equipment for both models; MAX+ adds items on top of PRO+.
export const STANDARD_EQUIPMENT = {
  'Geely E5': {
    base: [
      {
        category: 'Veiligheid & assistentie',
        items: [
          'Automatische noodremassistent (AEB)',
          'Adaptieve & intelligente cruise control (ACC)',
          'Rijstrookhandhavingsassistent (LKA)',
          'Nood-rijstrookhandhaving (ELKA)',
          'Rijstrookwisselassistent (LCA & ALCA)',
          'Dodehoekdetectie (BSD)',
          'Verkeersbordherkenning (TSI)',
          'Intelligent Speed Assistance (ISA)',
          'Uitwijkmanoeuvreassistent (EMA)',
          'Waarschuwing kruisend verkeer voor (FCTA)',
          'Support botsing afwenden voor & achter',
          'Traction Control System (G-TCS)',
          '7 airbags incl. middenairbag',
          'ISOFIX voor- & achterbank',
          'Bandenspanningscontrole (TPMS)',
          '360° camera met Ground View',
          'Parkeersensoren achter',
        ],
      },
      {
        category: 'Comfort',
        items: [
          'Elektrisch inklapbare buitenspiegels',
          'Bestuurdersstoel 6-voudig elektrisch',
          'Voorpassagiersstoel 4-voudig elektrisch',
          'Verwarmde & geventileerde voorstoelen',
          'Klimaatregeling + uitstroom achterin',
          'Automatisch dimmende binnenspiegel',
          'Regensensor',
          'Autohold & elektrische handrem',
        ],
      },
      {
        category: 'Interieur',
        items: [
          'Vegan lederen multifunctioneel stuurwiel',
          'Geperforeerde kunstlederen stoelen',
          'Achterbank 60/40 deelbaar, verstelbaar',
          'Opberglade onder achterbank',
        ],
      },
      {
        category: 'Technologie',
        items: [
          '15,4" HD centraal touchscreen',
          '10,2" digitaal instrumentarium',
          'FLYME AUTO infotainment · E04-chipset',
          'Apple CarPlay & Android Auto',
          '4G, wifi, online navigatie & OTA-updates',
          'Handsfree kaart voor open & start',
          '6-speaker audio · DAB · Bluetooth',
          'Draadloos laden & USB-A/C voorin',
        ],
      },
      {
        category: 'Elektrisch & exterieur',
        items: [
          '11 kW AC- & 100 kW DC-lader',
          'Warmtepomp',
          'V2L & V2V (3,3 / 6,6 kW)',
          '18" lichtmetalen wielen',
          'Volledig LED',
          'Privacy glass',
        ],
      },
    ],
    // Items removed from the base list when the trim is MAX+, because MAX+ replaces them
    // rather than adding to them (e.g. it rides on 19" wheels instead of PRO/PRO+'s 18").
    maxPlusRemovals: ['18" lichtmetalen wielen'],
    maxPlusAdditional: [
      {
        category: 'Comfort',
        items: [
          'Elektrisch bedienbare achterklep',
          'Geheugen- & massagefunctie voorstoelen',
          'Voorpassagiersstoel met elektrische beensteun',
          'Panoramisch schuifdak met elektrisch zonnescherm',
          'Verwarmbare achterbank (buitenste plaatsen)',
          'Verwarmbare voorruit & ruitensproeiers',
        ],
      },
      {
        category: 'Interieur & sfeer',
        items: [
          'Ambient Lighting met 256 kleuren',
          'Zonnekleppen met verlichte spiegeltjes',
        ],
      },
      {
        category: 'Technologie & multimedia',
        items: [
          'W-HUD head-up display op de voorruit',
          '16-speaker FLYME SOUND audiosysteem',
          'Speakers in de hoofdsteunen voorin',
          'Preconditioning interieur via de app',
        ],
      },
      {
        category: 'Exterieur & veiligheid',
        items: [
          '19" lichtmetalen wielen',
          'Parkeersensoren vóór én achter',
        ],
      },
    ],
  },

  'Starray EM-i': {
    base: [
      {
        category: 'Veiligheid',
        items: [
          'Automatische noodremassistent (AEB)',
          'Adaptieve & intelligente cruise control (ACC)',
          'Active emergency braking voor & achter',
          'Achteruitrijwaarschuwing kruisend verkeer & remondersteuning',
          'Rijstrookhandhavingsassistent (LKA)',
          'Verkeersbordherkenning (TSI)',
          'Rijstrookwisselassistent (LCA)',
          'Dodehoekdetectie (BSD)',
          'Nood-rijstrookhandhavingsassistent (ELKA)',
          'Intelligent Speed Assistance (ISA)',
          'Uitwijkmanoeuvreassistent (EMA)',
          'Waarschuwing kruisend verkeer voor (FCTA)',
          'Actieve rijstrookwisselassistent (ALCA)',
          'Electronic Parking Brake (EPB) & Auto Hold (AVH)',
          'Geely Traction Control System (G-TCS)',
          '7 airbags (front, zij voorin, zijgordijn, midden)',
          'ISOFIX voor- & achterbank',
          'Tyre Pressure Monitoring System',
          'Parkeersensoren achter',
          '360° Camera met Ground View',
        ],
      },
      {
        category: 'Elektrisch rijden',
        items: [
          '6,6 kW AC-lader',
          'V2L & V2V (3,3 / 6,6 kW)',
        ],
      },
      {
        category: 'Technologie en multimedia',
        items: [
          'Handsfree kaart voor ontgrendelen en starten',
          'FLYME AUTO infotainment · E04-chipset',
          '15,4" HD centraal scherm & 10,2" LCD instrumentarium',
          'Dual-zone audio control voorin',
          'Bluetooth',
          '4G, wifi, online navigatie & OTA-updates',
          'Apple CarPlay & Android Auto',
          'FM radio & DAB',
          'USB aansluitingen voorin (Type-A & Type-C)',
          '6-speakers audiosysteem',
          '12V-aansluiting voorin',
        ],
      },
      {
        category: 'Interieur',
        items: [
          'Microfiber vegan lederen multifunctioneel stuurwiel',
          '4-weg handmatig verstelbaar stuurwiel',
          'Achterbankleuning met tweevoudige hoekinstelling, 60/40 deelbaar',
          'Opberglade onder achterbank',
          'Zonnekleppen met spiegeltjes voor',
          'Geperforeerde kunstlederen stoelen',
        ],
      },
      {
        category: 'Comfort',
        items: [
          'Elektrisch bedienbare en inklapbare buitenspiegels',
          'Regensensor',
          'Bestuurdersstoel 6-voudig elektrisch instelbaar',
          'Voorpassagiersstoel 4-voudig elektrisch instelbaar',
          'Verwarmde voorstoelen',
          'Automatisch dimmende binnenspiegel',
          'Klimaatregeling',
          'Uitstroomopening airconditioning achterbank',
          'Autohold en elektrische handrem',
          'Verwarmde ruitensproeiers',
          'Verwarmbare voorruit',
        ],
      },
      {
        category: 'Exterieur',
        items: [
          'LED-verlichting (incl. Follow Me Home)',
          'LED dagrijverlichting (DRL)',
          'Intelligent High Beam Control (IHBC)',
          'AGS actieve sluiting grille voor minder weerstand',
          'Dakdragers',
          'Privacy glass',
        ],
      },
    ],
    maxPlusAdditional: [
      {
        category: 'Comfort',
        items: [
          'Panoramisch elektrisch schuifdak met elektrisch zonnescherm',
          'Elektrisch bedienbare achterklep',
          'Voorstoelen geventileerd en met massagefunctie',
          'Stoel bestuurder met geheugenfunctie',
          'Voorpassagiersstoel met elektrisch verstelbare beensteun (2-weg)',
          'Verwarmbare achterbank (buitenste zitplaatsen)',
        ],
      },
      {
        category: 'Veiligheid',
        items: [
          'Parkeersensoren vóór en achter',
        ],
      },
      {
        category: 'Technologie & multimedia',
        items: [
          'W-HUD (Head-Up Display op voorruit)',
          '16-speaker FLYME SOUND audiosysteem (incl. speakers in hoofdsteunen)',
          'Draadloos opladen mobiele telefoon',
        ],
      },
      {
        category: 'Interieur',
        items: [
          'Ambient Lighting met 256 kleuren',
          'Zonnekleppen met verlichte spiegeltjes voor',
        ],
      },
      {
        category: 'Exterieur',
        items: [
          '19" lichtmetalen wielen met lage rolweerstand',
        ],
      },
    ],
  },
};

// Returns [{ category, items }] for the given vehicle name + submodel (PRO / PRO+ / MAX+),
// merging the MAX+-only additions into their matching category when applicable.
export function getStandardEquipment(vehicleName, model) {
  const data = STANDARD_EQUIPMENT[vehicleName];
  if (!data) return [];

  const removals = model === 'MAX+' ? (data.maxPlusRemovals || []) : [];
  const categories = data.base
    .map(group => ({ category: group.category, items: group.items.filter(item => !removals.includes(item)) }))
    .filter(group => group.items.length > 0);

  if (model === 'MAX+') {
    for (const extra of data.maxPlusAdditional) {
      const existing = categories.find(c => c.category === extra.category);
      if (existing) {
        existing.items.push(...extra.items);
      } else {
        categories.push({ category: extra.category, items: [...extra.items] });
      }
    }
  }

  return categories;
}
