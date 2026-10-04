import type { VehicleTypeId } from '../types';

// Fictional demo parameters, not verified specifications of real models.
export const VEHICLE_TYPES = [
  { id: 'A', label: 'Type A', batteryCapacityKwh: 60, maxChargeKw: 11 },
  { id: 'B', label: 'Type B', batteryCapacityKwh: 60, maxChargeKw: 11 },
  { id: 'C', label: 'Type C', batteryCapacityKwh: 64, maxChargeKw: 9 },
  { id: 'D', label: 'Type D', batteryCapacityKwh: 75, maxChargeKw: 12 },
] as const;
export const getVehicleType = (id: VehicleTypeId) =>
  VEHICLE_TYPES.find((type) => type.id === id);

// Vehicle labels identify sessions, independently of their shared vehicle type.
export function nextVehicleLabel(existing: string[]): string {
  const used = new Set(existing);
  for (let index = 0; ; index++) {
    let number = index + 1,
      label = '';
    while (number > 0) {
      number--;
      label = String.fromCharCode(65 + (number % 26)) + label;
      number = Math.floor(number / 26);
    }
    if (!used.has(label)) return label;
  }
}

export function vehicleTypeParameters(id: VehicleTypeId) {
  const type = getVehicleType(id);
  if (!type) throw new Error('Unknown simulated vehicle type');
  return {
    vehicleType: type.id,
    batteryCapacityKwh: type.batteryCapacityKwh,
    maxChargeKw: type.maxChargeKw,
  };
}
