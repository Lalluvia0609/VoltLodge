import type { VehicleTypeId } from '../../types';
import { VEHICLE_TYPES, getVehicleType } from '../../data/vehicleTypes';
import { Field, fieldClass } from './GuestFields';
export function VehicleTypeSelector({
  value,
  onChange,
}: {
  value: VehicleTypeId;
  onChange: (value: VehicleTypeId) => void;
}) {
  const type = getVehicleType(value);
  return (
    <div className="space-y-2">
      <Field label="Vehicle type">
        <select
          required
          aria-label="Vehicle type"
          className={fieldClass}
          value={value}
          onChange={(event) => onChange(event.target.value as VehicleTypeId)}
        >
          {VEHICLE_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-slate-400">
        For this demo, choose one of four simulated vehicle types. Each type has
        a preset battery capacity and maximum AC charging power.
      </p>
      {type && (
        <p className="text-xs text-slate-400">
          {type.batteryCapacityKwh} kWh usable battery · up to{' '}
          {type.maxChargeKw} kW AC. Actual charging power varies.
        </p>
      )}
    </div>
  );
}
