// An accessory is scoped to a vehicle (trim) in two independent ways: by whole-model name
// (`vehicleModels`) and by exact trim id (`vehicleTrims`). It applies to a vehicle when it
// has neither list set (universal — "Alle modellen"), OR the vehicle's model name is in
// `vehicleModels`, OR the vehicle's exact id is in `vehicleTrims`.
//
// `vehicle` is a vehicle row with at least `{ id, name }`. During quote building the
// specific trim may not be chosen yet — passing `{ name }` alone still resolves
// whole-model scoping correctly; a trim-only accessory just won't match until the trim is
// picked, which is fine (we don't know which trim it is yet).
//
// Mirrors accessoryAppliesToVehicle() in backend/src/routes/quotes.js — keep the two in
// sync.
export function accessoryAppliesToVehicle(accessory, vehicle) {
  if (!vehicle) return false
  const models = accessory.vehicleModels || []
  const trims = accessory.vehicleTrims || []
  if (models.length === 0 && trims.length === 0) return true
  return models.includes(vehicle.name) || trims.includes(vehicle.id)
}
