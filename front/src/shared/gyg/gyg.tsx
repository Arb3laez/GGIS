import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  findStage,
  FOLLOW_UP_STAGES,
  formatCop,
  SEND_STATUS_LABELS,
  TEMPERATURE_LABELS,
  type SendStatus,
  type Temperature,
} from '@ggis/domain';

/**
 * Componentes del sistema de diseño GYG Innova (gyg-design-system/components/bundle.js),
 * reescritos en React + TypeScript con los mismos nombres de clases y props. Estilos en
 * styles/gyg.css y tokens en styles/tokens.css.
 */

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Iconos (trazo 1.75px, 24px) */
const PATHS: Record<string, Array<[string, Record<string, string | number>]>> = {
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  download: [['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14' }]],
  upload: [['path', { d: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14' }]],
  search: [
    ['circle', { cx: 11, cy: 11, r: 6 }],
    ['path', { d: 'M20 20l-4.5-4.5' }],
  ],
  chevron: [['path', { d: 'M6 9l6 6 6-6' }]],
  phone: [
    [
      'path',
      { d: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z' },
    ],
  ],
  offer: [
    ['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }],
    ['path', { d: 'M14 3v5h5M9 13h6M9 17h6' }],
  ],
  edit: [['path', { d: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4' }]],
  duplicate: [
    ['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }],
    ['path', { d: 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2' }],
  ],
  copy: [
    ['rect', { x: 6, y: 5, width: 12, height: 16, rx: 2 }],
    ['rect', { x: 9, y: 3, width: 6, height: 4, rx: 1 }],
    ['path', { d: 'M9.5 12h5M9.5 16h5' }],
  ],
  trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3' }]],
  calendar: [
    ['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }],
    ['path', { d: 'M4 10h16M8 3v4M16 3v4' }],
  ],
  mail: [
    ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
    ['path', { d: 'M3 7l9 6 9-6' }],
  ],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
};

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={cx('gyg-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {(PATHS[name] ?? []).map(([tag, attrs], i) => {
        const El = tag as 'path';
        return <El key={i} {...attrs} />;
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ Botones */
export function Button({
  variant = 'primary',
  icon,
  collapse,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; icon?: string; collapse?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('gyg-btn', 'body-strong', `gyg-btn--${variant}`, collapse && 'gyg-btn--collapse', className)}
    >
      {icon ? <Icon name={icon} /> : null}
      {children != null ? <span className="gyg-btn__label">{children}</span> : null}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  tone,
  onClick,
  disabled,
  className,
}: {
  icon: string;
  label: string;
  tone?: 'danger';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx('gyg-ib', tone === 'danger' && 'gyg-ib--danger', className)}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

/* ------------------------------------------------------------------ Filtros */
export interface Option {
  value: string;
  label: string;
}

export function FilterPills({
  options,
  value,
  onChange,
  label = 'Filtrar por estado',
}: {
  options: Array<Option & { count?: number }>;
  value: string;
  onChange?: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="gyg-pills" role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            className={cx('gyg-pill', 'body-strong', on && 'is-on')}
            onClick={() => onChange?.(o.value)}
          >
            {o.label}
            {o.count != null ? <span className="gyg-pill__count meta">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar',
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cx('gyg-field', 'gyg-field--search', className)}>
      <Icon name="search" />
      <input
        type="search"
        className="gyg-field__input body"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </label>
  );
}

function withCaption(caption: string | undefined, className: string | undefined, field: ReactNode) {
  return caption ? (
    <div className={cx('gyg-fw', className)}>
      <span className="meta gyg-fw__cap">{caption}</span>
      {field}
    </div>
  ) : (
    field
  );
}

export function SelectField({
  label,
  caption,
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  label?: string;
  caption?: string;
  value: string;
  onChange?: (v: string) => void;
  options: Option[];
  className?: string;
  disabled?: boolean;
}) {
  const field = (
    <label className={cx('gyg-field', 'gyg-field--select', !caption && className)}>
      <select
        className="gyg-field__input body"
        value={value}
        aria-label={label ?? caption}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron" className="gyg-field__chev" />
    </label>
  );
  return withCaption(caption, className, field);
}

export function TextField({
  caption,
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  multiline,
  rows = 3,
  placeholder,
  className,
  disabled,
  maxLength,
}: {
  caption?: string;
  label?: string;
  value?: string | number | null;
  onChange?: (v: string) => void;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'decimal';
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const common = {
    className: 'gyg-field__input body',
    value: value ?? '',
    placeholder,
    disabled,
    maxLength,
    'aria-label': label ?? caption,
  };
  const control = multiline ? (
    <textarea rows={rows} {...common} onChange={(e) => onChange?.(e.target.value)} />
  ) : (
    <input type={type} inputMode={inputMode} {...common} onChange={(e) => onChange?.(e.target.value)} />
  );
  const field = (
    <label className={cx('gyg-field', 'gyg-field--text', multiline && 'gyg-field--area', !caption && className)}>
      {control}
    </label>
  );
  return withCaption(caption, className, field);
}

/* ------------------------------------------------------------------ Estado */
/** Estados del sistema de diseño (negotiation = En negociación). */
export type GygStatus = 'sent' | 'negotiation' | 'won' | 'lost' | 'replaced';
export const GYG_STATUSES: Array<{ value: GygStatus; label: string }> = [
  { value: 'sent', label: 'Enviada' },
  { value: 'negotiation', label: 'En negociación' },
  { value: 'won', label: 'Adjudicada' },
  { value: 'lost', label: 'Perdida' },
  { value: 'replaced', label: 'Sustituida' },
];

export function StatusSelect({
  value,
  onChange,
  label = 'Estado de la cotización',
  disabled,
  className,
}: {
  value: GygStatus;
  onChange?: (v: GygStatus) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const current = GYG_STATUSES.find((o) => o.value === value) ?? GYG_STATUSES[0]!;
  return (
    <span className={cx('gyg-status', `gyg-status--${current.value}`, className)}>
      <span className="gyg-status__dot" aria-hidden="true" />
      <span className="gyg-status__label body-strong">{current.label}</span>
      <Icon name="chevron" size={16} />
      <select
        className="gyg-status__select"
        value={current.value}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value as GygStatus)}
      >
        {GYG_STATUSES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/* ------------------------------------------------------------------ Tarjeta de cotización */
export type QuoteAction = 'view' | 'edit' | 'duplicate' | 'copy' | 'delete';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
export function monthOf(date: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})/.exec(date ?? '');
  return m ? (MONTHS[Number(m[1]) - 1] ?? '') : '';
}
export const MONTH_OPTIONS = MONTHS;
const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface QuoteCardProps {
  client?: string;
  /** Destino del enlace del nombre del cliente (abre el editor completo). */
  href?: string;
  identification?: string;
  project?: string;
  type?: string;
  temperature?: Temperature | null;
  sendStatus?: SendStatus | null;
  closeDate?: string | null;
  phone2?: string;
  code?: string;
  date?: string;
  age?: string;
  unit?: string | null;
  service?: string | null;
  contactName?: string;
  phone?: string;
  status: GygStatus;
  stage?: string | null;
  probability?: number | null;
  due?: { label: string; overdue?: boolean } | null;
  responded?: boolean;
  note?: string;
  total?: number;
  onStatusChange?: (v: GygStatus) => void;
  onAction?: (k: QuoteAction) => void;
  /** Acciones adicionales de la app (p. ej. Sustituir, Análisis de costos) dentro de "Más detalles". */
  extraActions?: ReactNode;
}

export function QuoteCard(p: QuoteCardProps) {
  const [open, setOpen] = useState(false);
  const act = (k: QuoteAction) => () => p.onAction?.(k);
  const st = findStage(p.stage);
  const pct = p.probability != null ? p.probability : st ? st.pct : null;
  const stageText = [st ? st.label : p.stage || 'Etapa sin definir'];
  if (pct != null) stageText.push(`${pct}% de cierre`);
  const tags = [p.unit, p.service].filter(Boolean) as string[];
  const metaParts = [p.code, p.date && p.date + (p.age ? ` (${p.age})` : '')].filter(Boolean).join(' · ');
  const tempLabel = p.temperature ? TEMPERATURE_LABELS[p.temperature] : null;
  const sendLabel = p.sendStatus ? SEND_STATUS_LABELS[p.sendStatus] : null;
  const dash = '—';
  const detail: Array<[string, string]> = [
    ['Tipo de transacción', p.type || 'Cotización'],
    ['Identificación (NIT / CC)', p.identification || dash],
    ['Sucursal / proyecto', p.project || dash],
    ['Estado de envío', sendLabel ?? dash],
    ['Mes', cap1(monthOf(p.date)) || dash],
    ['Cierre estimado', p.closeDate || dash],
    ['Temperatura', tempLabel ?? dash],
    ['Teléfono 2', p.phone2 || dash],
    ['Observación', p.note || dash],
  ];
  const clientName = p.client || '(sin cliente)';

  return (
    <div className="gyg-qwrap">
      <article className={cx('gyg-q', open && 'is-open')}>
        <div className="gyg-q__client">
          {p.href ? (
            <Link to={p.href} className={cx('card-title', !p.client && 'gyg-muted')}>
              {clientName}
            </Link>
          ) : (
            <div className={cx('card-title', !p.client && 'gyg-muted')}>{clientName}</div>
          )}
          {p.project ? <div className="body gyg-q__project">{p.project}</div> : null}
          <div className="meta gyg-muted gyg-q__meta">
            {metaParts}
            {tags.map((t) => (
              <span key={t} className="gyg-tag">
                {t}
              </span>
            ))}
          </div>
          <button type="button" className="gyg-q__more meta" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Ocultar detalle' : 'Más detalles'}
            <Icon name="chevron" size={14} />
          </button>
        </div>

        <div className="gyg-q__contact">
          <div className={cx('body', !p.contactName && 'gyg-muted')}>{p.contactName || 'Sin contacto'}</div>
          {p.phone ? (
            <a className="gyg-q__phone body" href={`tel:${p.phone.replace(/[^+\d]/g, '')}`}>
              <Icon name="phone" size={16} />
              {p.phone}
            </a>
          ) : (
            <div className="meta gyg-muted">Sin teléfono</div>
          )}
        </div>

        <div className="gyg-q__status">
          <div className="gyg-q__chips">
            <StatusSelect value={p.status} onChange={p.onStatusChange} label={`Estado de ${p.code ?? 'la cotización'}`} />
            {p.temperature === 'caliente' || p.temperature === 'tibio' ? (
              <span className={cx('gyg-temp', `gyg-temp--${p.temperature}`, 'meta')}>{tempLabel}</span>
            ) : null}
          </div>
          <div className="meta gyg-muted">{stageText.join(' · ')}</div>
        </div>

        <div className="gyg-q__follow">
          {p.due ? (
            <div className={cx('meta', 'gyg-q__due', p.due.overdue && 'is-overdue')}>
              <Icon name="calendar" size={14} />
              {p.due.label}
            </div>
          ) : (
            <div className="meta gyg-muted">Sin seguimiento</div>
          )}
          {sendLabel ? (
            <span className="gyg-chip meta">
              <Icon name="mail" size={14} />
              {sendLabel}
            </span>
          ) : null}
          {p.responded ? (
            <span className="gyg-chip meta">
              <Icon name="check" size={14} />
              Cliente respondió
            </span>
          ) : null}
          {p.note ? <div className="meta gyg-muted gyg-q__note">{p.note}</div> : null}
        </div>

        <div className="gyg-q__total amount">{formatCop(p.total ?? 0)}</div>

        <div className="gyg-q__actions">
          <Button variant="secondary" icon="offer" onClick={act('view')} className="gyg-q__offer">
            Oferta
          </Button>
          <IconButton icon="edit" label="Editar" onClick={act('edit')} />
          <IconButton icon="duplicate" label="Duplicar" onClick={act('duplicate')} />
          <IconButton icon="copy" label="Copiar" onClick={act('copy')} />
          <IconButton icon="trash" label="Eliminar" tone="danger" onClick={act('delete')} />
        </div>

        {open ? (
          <dl className="gyg-q__detail">
            {detail.map(([k, v]) => (
              <div
                key={k}
                className={cx('gyg-q__kv', (k === 'Observación' || k === 'Sucursal / proyecto') && 'is-wide')}
              >
                <dt className="meta gyg-muted">{k}</dt>
                <dd className="body">{v}</dd>
              </div>
            ))}
            {p.extraActions ? <div className="gyg-q__extra">{p.extraActions}</div> : null}
          </dl>
        ) : null}
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ Resumen por etapa */
export interface StageItem {
  value: string;
  label: string;
  pct: number | null;
  count: number;
  total?: number;
}

const ofertas = (n: number) => `${n} ${n === 1 ? 'oferta' : 'ofertas'}`;

export function StageSummary({
  items,
  allCount,
  allTotal,
  value,
  onChange,
  label = 'Seguimiento de ofertas por etapa',
}: {
  items: StageItem[];
  allCount?: number;
  allTotal?: number;
  value: string;
  onChange?: (v: string) => void;
  label?: string;
}) {
  const all: StageItem = {
    value: 'all',
    label: 'Todas las etapas',
    pct: null,
    count: allCount ?? items.reduce((n, i) => n + i.count, 0),
    total: allTotal ?? items.reduce((n, i) => n + (i.total ?? 0), 0),
  };
  return (
    <div className="gyg-stages" role="group" aria-label={label}>
      {[all, ...items].map((i) => {
        const on = i.value === value;
        return (
          <button
            key={i.value}
            type="button"
            aria-pressed={on}
            className={cx('gyg-stage', on && 'is-on')}
            onClick={() => onChange?.(i.value)}
          >
            <span className="gyg-stage__top">
              <span className="body-strong">{i.label}</span>
              {i.pct != null ? <span className="gyg-stage__pct meta">{i.pct}%</span> : null}
            </span>
            <span className="gyg-stage__n meta">{ofertas(i.count)}</span>
            <span className="gyg-stage__sum body-strong">{formatCop(i.total ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Opciones del selector de nivel de oferta, con su probabilidad. */
export const STAGE_OPTIONS: Option[] = [
  { value: '', label: 'Etapa sin definir' },
  ...FOLLOW_UP_STAGES.map((s) => ({ value: s.value, label: s.label + (s.pct != null ? ` (${s.pct}%)` : '') })),
];

/* ------------------------------------------------------------------ Contenedores */
export function QuoteList({
  children,
  showHeader = true,
  label = 'Listado de cotizaciones',
}: {
  children?: ReactNode;
  showHeader?: boolean;
  label?: string;
}) {
  const labels = ['Cliente / proyecto', 'Contacto', 'Estado y etapa', 'Seguimiento', 'Total', ''];
  return (
    <section className="gyg-list" aria-label={label}>
      {showHeader ? (
        <div className="gyg-list__head col-label" aria-hidden="true">
          {labels.map((l, i) => (
            <span key={i} className={i === 4 ? 'is-right' : ''}>
              {l}
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="gyg-hwrap">
      <header className="gyg-header">
        <div>
          <h1 className="page-title gyg-header__title">{title}</h1>
          {subtitle ? <p className="body gyg-muted gyg-header__sub">{subtitle}</p> : null}
        </div>
        <div className="gyg-header__actions">{children}</div>
      </header>
    </div>
  );
}
