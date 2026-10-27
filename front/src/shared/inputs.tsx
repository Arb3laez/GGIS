import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Pesos con punto de miles (admite decimales): $16.000 · $12,5. */
export const formatPesos = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;

/** Precio en la moneda del ítem: $16.000 · US$ 650. */
export const formatPrice = (n: number, currency: 'COP' | 'USD') =>
  currency === 'USD' ? `US$ ${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })}` : formatPesos(n);

/**
 * Entrada numérica controlada que permite escribir libremente ("1.", "", "0,5") y solo envía el
 * número cuando es válido. Acepta coma decimal. Con `format`, fuera de foco muestra el valor
 * formateado (p. ej. "$3.238.113") y al enfocarlo vuelve al número limpio para editarlo.
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
  format,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  step?: number;
  min?: number;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  allowNull?: boolean;
  format?: (n: number) => string;
}) {
  const shown = (v: number | null) => (v === null ? '' : format ? format(v) : String(v));
  const [text, setText] = useState(() => shown(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(shown(value));
    // `format` puede ser una función nueva en cada render; basta con reaccionar al valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      onFocus={() => {
        focused.current = true;
        if (format) setText(value === null ? '' : String(value));
      }}
      onBlur={() => {
        focused.current = false;
        setText(shown(value));
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
  type?: 'text' | 'email' | 'date' | 'tel';
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
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: ReactNode;
  step?: number;
  /** Formato a mostrar fuera de foco (p. ej. pesos). */
  format?: (n: number) => string;
}) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput className="" value={value} step={step} format={format} onChange={(n) => onChange(n ?? 0)} />
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
