// One-time seed data for the `accessories` table (paint colors, upholstery, add-ons).
// After first boot, the database is the source of truth — edit accessories via the
// admin panel (or the /api/accessories endpoints), not this file.
export const STANDARD_ACCESSORIES = [
  // Geely E5 - Paint colors
  { id: 'e5-paint-turquoise', name: 'Metallic: Turquoise Green', price: 650, category: 'exterior', vehicleModels: ['Geely E5'] },
  { id: 'e5-paint-black', name: 'Metallic: Carbon Black', price: 650, category: 'exterior', vehicleModels: ['Geely E5'] },
  { id: 'e5-paint-grey', name: 'Metallic: Frost Grey', price: 650, category: 'exterior', vehicleModels: ['Geely E5'] },
  { id: 'e5-paint-silver', name: 'Metallic: Moonlight Silver', price: 650, category: 'exterior', vehicleModels: ['Geely E5'] },
  { id: 'e5-paint-moss', name: 'Metallic: Moss Green', price: 650, category: 'exterior', vehicleModels: ['Geely E5'] },
  // Geely E5 - Upholstery
  { id: 'e5-upholstery-ivory', name: 'Bekleding: Ivory White TEP-leder', price: 500, category: 'interior', vehicleModels: ['Geely E5'] },

  // Starray EM-i - Paint colors
  { id: 'emi-paint-glacier', name: 'Metallic: Glacier Blue', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'] },
  { id: 'emi-paint-polar', name: 'Metallic: Polar Black', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'] },
  { id: 'emi-paint-volcanic', name: 'Metallic: Volcanic Grey', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'] },
  { id: 'emi-paint-cloudveil', name: 'Metallic: Cloudveil Silver', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'] },
  { id: 'emi-paint-jungle', name: 'Metallic: Jungle Green', price: 650, category: 'exterior', vehicleModels: ['Starray EM-i'] },
  // Starray EM-i - Upholstery
  { id: 'emi-upholstery-amber', name: 'Bekleding: Amber Brown TEP-leder', price: 500, category: 'interior', vehicleModels: ['Starray EM-i'] }
];
