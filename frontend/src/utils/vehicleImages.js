import e5Default from '../assets/vehicles/geely-e5.jpg'
import starrayDefault from '../assets/vehicles/starray-emi.jpg'
import geelyE2 from '../assets/vehicles/geely-e2.jpg'

import e5FrostGreyFront from '../assets/vehicles/colors/e5-frost-grey-front.jpg'
import e5CarbonBlackFront from '../assets/vehicles/colors/e5-carbon-black-front.jpg'
import e5MoonlightSilverFront from '../assets/vehicles/colors/e5-moonlight-silver-front.jpg'
import e5SnowyWhiteFront from '../assets/vehicles/colors/e5-snowy-white-front.jpg'
import e5TurquoiseGreenFront from '../assets/vehicles/colors/e5-turquoise-green-front.jpg'
import e5Rear from '../assets/vehicles/colors/e5-rear.jpg'

import starrayCloudveilSilverFront from '../assets/vehicles/colors/starray-cloudveil-silver-front.jpg'
import starrayJungleGreenFront from '../assets/vehicles/colors/starray-jungle-green-front.jpg'
import starrayGlacierBlueFront from '../assets/vehicles/colors/starray-glacier-blue-front.jpg'
import starrayVolcanicGreyFront from '../assets/vehicles/colors/starray-volcanic-grey-front.jpg'
import starrayPolarBlackFront from '../assets/vehicles/colors/starray-polar-black-front.jpg'
import starrayRear from '../assets/vehicles/colors/starray-rear.jpg'

// Default (uncolored) photo per model — shown before a paint color is picked, and for a
// model with no per-color photos at all (Geely E2 is still "coming soon", no configurator).
export const VEHICLE_IMAGES = {
  'Geely E5': e5Default,
  'Starray EM-i': starrayDefault,
  'Geely E2': geelyE2,
}

// Real front 3/4 photos per exterior color, sourced from Geely's own Belgian site
// (geelyauto.be) and keyed by the exact accessory name used in accessoriesSeed.js. Geely
// only publishes a front photo per color there (see VEHICLE_REAR_IMAGES below) — a color
// with no entry here just falls back to the model's default photo above.
export const VEHICLE_COLOR_FRONT_IMAGES = {
  'Metallic: Frost Grey': e5FrostGreyFront,
  'Metallic: Carbon Black': e5CarbonBlackFront,
  'Metallic: Moonlight Silver': e5MoonlightSilverFront,
  'Metallic: Snowy White': e5SnowyWhiteFront,
  'Metallic: Turquoise Green': e5TurquoiseGreenFront,
  'Metallic: Cloudveil Silver': starrayCloudveilSilverFront,
  'Metallic: Jungle Green': starrayJungleGreenFront,
  'Metallic: Glacier Blue': starrayGlacierBlueFront,
  'Metallic: Volcanic Grey': starrayVolcanicGreyFront,
  'Metallic: Polar Black': starrayPolarBlackFront,
}

// One rear 3/4 photo per model — Geely doesn't publish a rear photo per color (only the
// front photo above changes with the selected color), so this is a fixed reference for
// the car's overall shape rather than a color match for whatever the customer picked.
export const VEHICLE_REAR_IMAGES = {
  'Geely E5': e5Rear,
  'Starray EM-i': starrayRear,
}
