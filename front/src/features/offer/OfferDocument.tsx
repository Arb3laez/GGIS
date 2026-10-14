import {
  addDaysIso,
  BUSINESS_UNIT_LABELS,
  computeQuote,
  formatCop,
  formatLongDate,
  PAYMENT_MODE_LABELS,
  type BusinessUnit,
  type CompanyProfile,
  type Quote,
} from '@ggis/domain';
import offerCss from './offer.css?raw';

export const BRAND_LOGOS = {
  company: '/brand/gyg.png',
  partners: [
    { src: '/brand/solt.png', alt: 'SOLT' },
    { src: '/brand/sensormatic.png', alt: 'Sensormatic' },
    { src: '/brand/potter.png', alt: 'Potter' },
  ],
};

/** Texto de la condición de pago, con los días de financiación cuando aplican. */
export function paymentText(q: Quote): string {
  const days = q.terms.financingDays;
  let text = PAYMENT_MODE_LABELS[q.terms.paymentMode];
  if (days > 0) {
    text = text.includes('X días')
      ? text.replace('X días', `${days} días`)
      : `${text} — saldo a ${days} días`;
  }
  return text;
}

function UnitIcon({ unit }: { unit: BusinessUnit | null }) {
  const s = {
    stroke: '#0094F8',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const paths: Record<string, JSX.Element> = {
    cctv: (
      <>
        <rect x="9" y="20" width="26" height="16" rx="3" {...s} />
        <circle cx="22" cy="28" r="5" {...s} />
        <path d="M35 25 L46 20 V36 L35 31" {...s} />
      </>
    ),
    fire: (
      <path
        d="M28 10c4 6 -4 8 -4 14 0 4 3 7 7 7 5 0 9-4 9-9 0-8-6-9-6-14 0 3-2 4-2 7 0 2 1 3 1 5-1-4-5-4-5-10z"
        {...s}
      />
    ),
    access_control: (
      <>
        <rect x="17" y="24" width="22" height="19" rx="3" {...s} />
        <path d="M21 24v-4a7 7 0 0114 0v4" {...s} />
        <circle cx="28" cy="33.5" r="2.6" {...s} />
      </>
    ),
    anti_theft: (
      <>
        <path d="M13 15 L34 15 L45 27.5 L34 41 L13 41 Z" {...s} />
        <circle cx="21" cy="28" r="2.8" {...s} />
      </>
    ),
    solt: (
      <>
        <path
          d="M28 9c7.5 0 13 5.9 13 13.4C41 32.5 28 47 28 47S15 32.5 15 22.4C15 14.9 20.5 9 28 9z"
          {...s}
        />
        <circle cx="28" cy="22" r="4.8" {...s} />
      </>
    ),
  };
  return (
    <svg width="40" height="40" viewBox="0 0 56 56" aria-hidden="true">
      {paths[unit ?? ''] ?? (
        <>
          <rect x="11" y="11" width="34" height="34" rx="6" {...s} />
          <path d="M19 28h20M28 18v20" {...s} />
        </>
      )}
    </svg>
  );
}

/** Oferta comercial para el cliente. No muestra costos internos ni personal: solo precios de venta. */
export function OfferDocument({ quote: q, company }: { quote: Quote; company: CompanyProfile }) {
  const { totals: t, items, aiuAdminPct } = computeQuote(q);
  const validUntil = formatLongDate(addDaysIso(q.issueDate, q.validDays));
  const billable = q.items.map((it, i) => ({ it, b: items[i]! })).filter(({ b }) => b.isBillable);
  const payments = [
    { label: 'Anticipo a la firma de la orden de compra', pct: q.terms.advancePct },
    { label: 'Avance por ejecución de obra (cortes parciales)', pct: q.terms.progressPct },
    { label: 'Contra entrega y recibo a satisfacción', pct: q.terms.onDeliveryPct },
  ]
    .filter((p) => p.pct > 0)
    // Cuotas al peso; si los % suman 100, la última absorbe el redondeo para que sumen el total exacto.
    .map((p, i, all) => {
      const sumPct = all.reduce((s, x) => s + x.pct, 0);
      const isLast = i === all.length - 1;
      const before = all.slice(0, i).reduce((s, x) => s + Math.round((t.total * x.pct) / 100), 0);
      const amount =
        isLast && Math.abs(sumPct - 100) < 0.001 ? t.total - before : Math.round((t.total * p.pct) / 100);
      return { ...p, amount };
    });
  const p = q.pricing;

  return (
    <div className="oferta-doc">
      <style>{offerCss}</style>
      <div className="od-top">
        <div className="marca">
          <div className="logo-box">
            <img src={BRAND_LOGOS.company} alt={company.tradeName} />
          </div>
          <div className="empresa">
            <b>{company.legalName}</b>
            {[company.address, company.city].filter(Boolean).join(' · ')}
            {company.phones ? (
              <>
                <br />
                Tel: {company.phones}
              </>
            ) : null}
          </div>
        </div>
        <div className="od-doc-tag">
          <div className="et">Oferta comercial</div>
          <div className="num">{q.number}</div>
          <div className="modo">Modalidad {p.method === 'simple' ? 'IVA' : 'AIU'}</div>
        </div>
      </div>

      <div className="od-meta">
        <div className="celda">
          <div className="k">Fecha de emisión</div>
          <div className="v">{formatLongDate(q.issueDate)}</div>
        </div>
        <div className="celda">
          <div className="k">Válida hasta</div>
          <div className="v">{validUntil}</div>
        </div>
        <div className="celda">
          <div className="k">TRM del día</div>
          <div className="v">{formatCop(q.exchangeRate)}</div>
        </div>
      </div>

      <div className="od-body">
        <div className="od-somos">
          <div className="ico">
            <UnitIcon unit={q.businessUnit} />
          </div>
          <div className="txt">
            <b>{company.tradeName}</b> — {company.about}
          </div>
        </div>

        <div className="od-cli">
          <Par label="Cliente" value={q.client.name} full />
          <Par label="Proyecto" value={q.client.project} full />
          <Par label="Contacto" value={q.client.contact} />
          <Par label="Correo" value={q.client.email} />
          <Par label="Ciudad del servicio" value={q.client.city} />
          <Par label="Unidad de negocio" value={q.businessUnit ? BUSINESS_UNIT_LABELS[q.businessUnit] : ''} />
        </div>

        <div className="od-resumen">
          {q.terms.installationTime ? (
            <div className="r-item">
              <div className="r-k">Instalación</div>
              <div className="r-v">{q.terms.installationTime}</div>
            </div>
          ) : null}
          <div className="r-item">
            <div className="r-k">Válida hasta</div>
            <div className="r-v">{validUntil}</div>
          </div>
          <div className="r-item">
            <div className="r-k">Ítems cotizados</div>
            <div className="r-v">{billable.length}</div>
          </div>
          <div className="r-item">
            <div className="r-k">Total oferta</div>
            <div className="r-v">{formatCop(t.total)}</div>
          </div>
        </div>

        <div className="od-h">Detalle de la oferta</div>
        <table className="od-items">
          <colgroup>
            <col className="n" />
            <col className="d" />
            <col className="u" />
            <col className="c" />
            <col className="pu" />
            <col className="pt" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Descripción</th>
              <th className="c">UN</th>
              <th className="c">Cant.</th>
              <th className="r">Precio unit.</th>
              <th className="r">Precio total</th>
            </tr>
          </thead>
          <tbody>
            {billable.map(({ it, b }, i) => (
              <tr key={it.id} className={i % 2 === 1 ? 'zebra' : undefined}>
                <td className="c-num">{String(i + 1).padStart(2, '0')}</td>
                <td className="c-desc">{it.description}</td>
                <td className="c-und">{it.unit || 'UN'}</td>
                <td className="c-cant">{it.quantity}</td>
                <td className="c-vu">{formatCop(b.saleUnitPrice)}</td>
                <td className="c-vt">{formatCop(b.saleTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="od-tot-wrap">
          <div className="od-tot">
            <table>
              <tbody>
                <TotRow label="Subtotal" value={t.subtotal} />
                {t.aiu ? (
                  <>
                    <TotRow label={`Administración (${aiuAdminPct}%)`} value={t.aiu.admin} />
                    <TotRow label={`Imprevistos (${p.aiu.contingencyPct}%)`} value={t.aiu.contingency} />
                    <TotRow label={`Utilidad (${p.aiu.profitPct}%)`} value={t.aiu.profit} />
                    <TotRow
                      label={`IVA sobre utilidad (${p.aiu.vatOnProfitPct}%)`}
                      value={t.aiu.vatOnProfit}
                    />
                  </>
                ) : (
                  <TotRow label={`IVA (${p.vatPct}%)`} value={t.vat} />
                )}
                <tr className="total-row">
                  <td className="bk-lbl">Total</td>
                  <td className="bk-val">{formatCop(t.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="od-sec">
          <div className="od-h">Alcance del suministro</div>
          <p>{q.terms.scope}</p>
        </div>

        <div className="od-sec">
          <div className="od-h">Tiempos de entrega</div>
          <div className="od-tiempos">
            <Tiempo label="Equipos nacionales" value={q.terms.deliveryNational} />
            <Tiempo label="Importación" value={q.terms.deliveryImport} />
            <Tiempo label="Instalación" value={q.terms.installationTime} />
          </div>
        </div>

        <div className="od-sec">
          <div className="od-h">Forma de pago</div>
          <div className="od-cond">
            <div className="k">Condición</div>
            <div className="v">{paymentText(q)}</div>
          </div>
          <table className="od-pago">
            <tbody>
              {payments.length ? (
                payments.map((pay) => (
                  <tr key={pay.label}>
                    <td>{pay.label}</td>
                    <td className="pg-pct">{pay.pct}%</td>
                    <td className="pg-val">{formatCop(pay.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>Según acuerdo entre las partes</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="od-legal">
          <Bloque title="Garantía" text={q.terms.warranty} />
          <Bloque title="Exclusiones y comentarios" text={q.terms.exclusions} />
          {q.bid.clarifications.length ? (
            <div className="bloque">
              <div className="bt">Aclaraciones</div>
              <ol className="bx od-aclaraciones">
                {q.bid.clarifications.map((c) => (
                  <li key={c.id}>
                    <b>{c.topic}</b>
                    {c.observation ? `: ${c.observation}` : ''}
                    {c.impact ? <span className="od-impacto"> ({c.impact})</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <Bloque
            title="Condiciones generales"
            text={`${q.terms.generalConditions} Salvo mención en contrario, la oferta expira automáticamente a los ${q.validDays} días corridos, contados desde la fecha de emisión.`}
          />
        </div>

        <div className="od-marcas">
          <div className="mt">Marcas que representamos</div>
          <div className="logos">
            {BRAND_LOGOS.partners.map((l) => (
              <img key={l.alt} src={l.src} alt={l.alt} />
            ))}
          </div>
        </div>

        <div className="od-firma">
          <div>
            <div className="nombre">{company.signatoryName}</div>
            <div className="cargo">{company.signatoryTitle}</div>
            <div className="cont">{company.signatoryContact}</div>
          </div>
          <div className="slogan">
            <span className="big">G&amp;G</span>
            {company.slogan}
          </div>
        </div>
      </div>
    </div>
  );
}

function Par({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'full' : undefined}>
      <span className="lbl">{label}</span>
      <span className="dato">{value || '—'}</span>
    </div>
  );
}

function TotRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="bk-lbl">{label}</td>
      <td className="bk-val">{formatCop(value)}</td>
    </tr>
  );
}

function Tiempo({ label, value }: { label: string; value: string }) {
  return (
    <div className="t">
      <div className="tl">{label}</div>
      <div className="tv">{value || '—'}</div>
    </div>
  );
}

function Bloque({ title, text }: { title: string; text: string }) {
  return (
    <div className="bloque">
      <div className="bt">{title}</div>
      <div className="bx">{text}</div>
    </div>
  );
}
