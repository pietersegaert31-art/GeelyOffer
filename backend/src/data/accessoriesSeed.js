// One-time seed data for the `accessories` table (paint colors, upholstery, add-ons).
// After first boot, the database is the source of truth — edit accessories via the
// admin panel (or the /api/accessories endpoints), not this file.
//
// colorHex is a representative swatch, not an exact OEM paint code (Geely doesn't
// publish those publicly) — cross-checked against Geely's official color lineups
// (an official Peru "ficha técnica" PDF for the E5/EX5, and independent listings for
// the Starray EM-i) so the name and approximate shade are accurate, close enough to
// give a customer a fair idea of the color, while pixel-perfect matching would need
// the actual paint sample.
export const STANDARD_ACCESSORIES = [
  // Geely E5 - Paint colors (verified against Geely's official 5-color E5/EX5 lineup:
  // Carbon Black, Frost Grey, Moonlight Silver, Snowy White, Turquoise Green — "Moss
  // Green" was not a real Geely color and has been corrected to Snowy White below)
  { id: 'e5-paint-turquoise', name: 'Metallic: Turquoise Green', price: 650, category: 'exterior', vehicleModels: ['Geely E5'], colorHex: '#5E9284' },
  { id: 'e5-paint-black', name: 'Metallic: Carbon Black', price: 650, category: 'exterior', vehicleModels: ['Geely E5'], colorHex: '#1B1B1D' },
  { id: 'e5-paint-grey', name: 'Metallic: Frost Grey', price: 650, category: 'exterior', vehicleModels: ['Geely E5'], colorHex: '#9CA3A8' },
  { id: 'e5-paint-silver', name: 'Metallic: Moonlight Silver', price: 650, category: 'exterior', vehicleModels: ['Geely E5'], colorHex: '#CDD0D2' },
  { id: 'e5-paint-moss', name: 'Metallic: Snowy White', price: 650, category: 'exterior', vehicleModels: ['Geely E5'], colorHex: '#F5F5F2' },
  // Geely E5 - Upholstery
  { id: 'e5-upholstery-ivory', name: 'Bekleding: Ivory White TEP-leder', price: 500, category: 'interior', vehicleModels: ['Geely E5'] },

  // Starray EM-i - Paint colors (verified: Glacier Blue, Polar Black, Volcanic Grey,
  // Cloudveil Silver, Jungle Green all confirmed as genuine Geely Starray EM-i colors)
  { id: 'emi-paint-glacier', name: 'Metallic: Glacier Blue', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'], colorHex: '#7098BE' },
  { id: 'emi-paint-polar', name: 'Metallic: Polar Black', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'], colorHex: '#18181A' },
  { id: 'emi-paint-volcanic', name: 'Metallic: Volcanic Grey', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'], colorHex: '#4B4C4E' },
  { id: 'emi-paint-cloudveil', name: 'Metallic: Cloudveil Silver', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'], colorHex: '#C9CBCD' },
  { id: 'emi-paint-jungle', name: 'Metallic: Jungle Green', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'], colorHex: '#2F4B3C' },
  // Starray EM-i - Upholstery
  { id: 'emi-upholstery-amber', name: 'Bekleding: Amber Brown TEP-leder', price: 500, category: 'interior', vehicleModels: ['Starray EM-i'] }
];
