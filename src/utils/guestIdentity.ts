import type { VehicleTypeId } from '../types';
import { getVehicleType } from '../data/vehicleTypes';
type Identity = {
  requestId: string;
  guestName: string;
  roomNumber: string;
  vehicleType?: VehicleTypeId;
};
export const shortBookingId = (requestId: string) =>
  requestId
    .replace(/[^a-z0-9]/gi, '')
    .slice(-8)
    .toUpperCase();
export const vehicleTypeLabel = (guest: Identity) =>
  guest.vehicleType
    ? getVehicleType(guest.vehicleType)?.label || 'Simulated vehicle'
    : 'Custom simulation vehicle';
export function guestLabel(guest: Identity, peers: Identity[] = []): string {
  const name = guest.guestName.trim();
  if (!name) return `Guest ${shortBookingId(guest.requestId)}`;
  const same = peers.filter(
    (other) => other.guestName.trim().toLowerCase() === name.toLowerCase(),
  );
  if (same.length < 2) return name;
  const room = guest.roomNumber.trim();
  const distinctRoom =
    room &&
    same.filter((other) => other.roomNumber.trim() === room).length === 1;
  return `${name} · ${distinctRoom ? `Room ${room}` : `Booking ${shortBookingId(guest.requestId)}`}`;
}
export const guestDetails = (guest: Identity) =>
  `${guest.roomNumber.trim() ? `Room ${guest.roomNumber.trim()} · ` : ''}${vehicleTypeLabel(guest)} · Booking ${shortBookingId(guest.requestId)}`;
