import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Entrada numérica controlada que permite escribir libremente ("1.", "", "0,5") y solo envía el
 * número cuando es válido. Acepta coma decimal.
 */
export function NumberInput({
  value,
  onChange,
  step,
  min = 0,
  className = 'cell num',
  placeholder,
  ariaLabel,
  allowNull = false,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  step?: number;
  min?: number;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  allowNull?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value));
  }, [value]);

  return (
    <input
      className={className}
      inputMode="decimal"
      type="text"
      value={text}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value === null ? '' : String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const normalized = raw.replace(/\s/g, '').replace(',', '.');
        if (normalized === '') {
          onChange(allowNull ? null : 0);
          return;
        }
        const n = Number(normalized);
        if (Number.isFinite(n) && n >= min) onChange(n);
      }}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'date';
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: ReactNode;
  step?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput className="" value={value} step={step} onChange={(n) => onChange(n ?? 0)} />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  emptyLabel,
}: {
  label: string;
  value: T | null;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (v: T | null) => void;
  hint?: ReactNode;
  emptyLabel?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as T | null)}>
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  const id = useId();
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      title={title}
      aria-label={title}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
