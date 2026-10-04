import type { ReactNode } from 'react';
import { toAucklandInput, fromAucklandInput } from '../../utils/time';
export const fieldClass =
  'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
export const buttonClass =
  'px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed';
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function TimeField({
  label,
  value,
  onChange,
  min,
  max,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        required={required}
        aria-label={label}
        type="datetime-local"
        className={fieldClass}
        value={toAucklandInput(value)}
        min={min ? toAucklandInput(min) : undefined}
        max={max ? toAucklandInput(max) : undefined}
        onChange={(e) =>
          onChange(e.target.value ? fromAucklandInput(e.target.value) : '')
        }
      />
      <span className="text-xs text-slate-500">
        Pacific/Auckland · DST included. A repeated autumn hour uses the earlier
        occurrence.
      </span>
    </Field>
  );
}
export function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-300"
    >
      {message}
    </p>
  ) : null;
}
