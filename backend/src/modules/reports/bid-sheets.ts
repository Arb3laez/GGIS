import {
  adminPersonCost,
  analyzeBid,
  apuContext,
  apuLineValue,
  effectiveQuantity,
  PRICE_REVIEW_LABELS,
  SUPPLY_PRICE_TYPE_LABELS,
  SUPPLY_TYPE_LABELS,
  supplyIndex,
  supplyUnitPrice,
  type Quote,
  type QuoteBreakdown,
} from '@ggis/domain';

/** Hoja del libro: filas, anchos de columna y columnas con formato de pesos. */
export interface SheetSpec {
  name: string;
  rows: unknown[][];
  widths: number[];
  moneyCols: number[];
}

/** ¿La cotización usa el análisis de licitación (insumos, APU o AIU licitación)? */
export function hasBidData(quote: Quote): boolean {
  return (
    quote.pricing.method === 'aiu_bid' ||
    quote.supplies.length > 0 ||
    quote.items.some((i) => (i.apu?.length ?? 0) > 0)
  );
}

/**
 * Hojas de licitación del análisis de costos (equivalentes al Excel de análisis de precios):
 * INSUMOS, APU, REVISIÓN DEL SUBCONTRATISTA y AIU / TOPES / LICIFY / ACLARACIONES.
 */
export function buildBidSheets(
  quote: Quote,
  breakdown: QuoteBreakdown,
  header: (title: string) => unknown[][],
): SheetSpec[] {
  const r = Math.round;
  const ctx = apuContext(quote);
  const index = supplyIndex(quote);
  const analysis = analyzeBid(quote, breakdown);
  const pct = (v: number) => `${v.toFixed(2)}%`;
  const sheets: SheetSpec[] = [];

  // ---- Insumos
  sheets.push({
    name: 'Insumos',
    rows: [
      ...header(
        `BASE DE INSUMOS · TRM ${quote.exchangeRate} · factor importación ${quote.apuParams.importFactor} · escalamiento ${quote.apuParams.escalationFactor}`,
      ),
      [
        'Código',
        'Descripción',
        'Und',
        'Tipo',
        'Valor base',
        'Tipo de precio',
        'Precio COP',
        'Fuente',
        'Estimado',
      ],
      ...quote.supplies.map((s) => [
        s.code,
        s.description,
        s.unit,
        SUPPLY_TYPE_LABELS[s.type],
        s.baseValue,
        SUPPLY_PRICE_TYPE_LABELS[s.priceType],
        r(supplyUnitPrice(s, ctx)),
        s.source,
        s.estimated ? 'Sí — verificar' : 'No',
      ]),
    ],
    widths: [10, 44, 7, 14, 14, 16, 14, 34, 14],
    moneyCols: [6],
  });

  // ---- APU por ítem
  const apuRows: unknown[][] = [
    ...header(
      `ANÁLISIS DE PRECIOS UNITARIOS · desperdicio ${quote.apuParams.wastePct}% · herramienta ${quote.apuParams.toolsPctOfLabor}% de M.O. · IVA 19% excepto M.O.`,
    ),
    [
      'Ítem',
      'Tipo',
      'Código',
      'Descripción',
      'Und',
      'Cantidad',
      'Rend./día',
      'Cant. efectiva',
      'Desperdicio',
      'Precio insumo',
      'Valor parcial',
    ],
  ];
  quote.items.forEach((it, i) => {
    const b = breakdown.items[i]!;
    if (!b.apu || !it.apu?.length) return;
    apuRows.push([i + 1, '', '', it.description, it.unit, it.quantity]);
    for (const l of it.apu) {
      const s = index.get(l.supplyId);
      apuRows.push([
        '',
        s ? s.type : '?',
        s?.code ?? '(eliminado)',
        s?.description ?? '',
        s?.unit ?? '',
        l.quantity,
        l.yieldPerDay || '',
        Number(effectiveQuantity(l).toFixed(6)),
        l.applyWaste ? `${quote.apuParams.wastePct}%` : '',
        s ? r(supplyUnitPrice(s, ctx)) : '',
        s ? r(apuLineValue(l, s, ctx)) : '',
      ]);
    }
    apuRows.push(
      [
        '',
        'HER',
        '',
        `Herramienta menor (${quote.apuParams.toolsPctOfLabor}% M.O.)`,
        '',
        '',
        '',
        '',
        '',
        '',
        r(b.apu.tools),
      ],
      ['', '', '', 'Suministro / M.O. / Servicios', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'Suministro', '', '', r(b.apu.supply)],
      ['', '', '', '', '', '', '', 'Mano de obra', '', '', r(b.apu.labor)],
      ['', '', '', '', '', '', '', 'Servicios', '', '', r(b.apu.services)],
      ['', '', '', `COSTO DIRECTO POR ${it.unit || 'UND'}`, '', '', '', '', '', '', r(b.apu.total)],
      [],
    );
  });
  sheets.push({
    name: 'APU',
    rows: apuRows,
    widths: [6, 6, 10, 46, 7, 10, 10, 13, 11, 14, 15],
    moneyCols: [9, 10],
  });

  // ---- Revisión del subcontratista
  const review = analysis.review;
  const reviewRows: unknown[][] = [
    ...header(
      `REVISIÓN DE PRECIOS DEL SUBCONTRATISTA${quote.bid.subcontractorName ? ` · ${quote.bid.subcontractorName}` : ''}`,
    ),
    [
      'Ítem',
      'Descripción',
      'Cant.',
      'Costo directo unit.',
      'PU subcontratista',
      'Diferencia',
      'Estado',
      'Total oferta',
      'Total subcontratista',
      'Sobrecosto',
    ],
  ];
  if (review) {
    review.rows.forEach((row) => {
      reviewRows.push([
        quote.items.findIndex((i) => i.id === row.id) + 1,
        row.description,
        row.quantity,
        r(row.ownUnitCost),
        row.subUnitPrice,
        pct(row.diff * 100),
        PRICE_REVIEW_LABELS[row.status],
        r(row.offerTotal),
        r(row.subTotal),
        r(row.overcost),
      ]);
    });
    reviewRows.push(
      [],
      [
        '',
        'TOTALES',
        '',
        '',
        '',
        pct(review.diff * 100),
        '',
        r(review.offerTotal),
        r(review.subTotal),
        r(review.subTotal - review.offerTotal),
      ],
      [],
      [
        '',
        'Resultado si se subcontrata (valor sin IVA − subcontratista − administración)',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        r(review.resultIfSubcontracted),
      ],
      [
        '',
        'Precio máximo de subcontrato (conserva imprevistos y utilidad)',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        r(review.maxSubcontractPrice),
      ],
      [
        '',
        'Reducción necesaria sobre lo cotizado por el subcontratista',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        pct(review.requiredReduction * 100),
      ],
    );
    if (review.missing)
      reviewRows.push([
        '',
        `${review.missing} ítem(s) sin precio del subcontratista no entran en la comparación.`,
      ]);
    if (review.topOvercosts.length) {
      reviewRows.push(
        [],
        ['', 'MAYORES SOBRECOSTOS'],
        ...review.topOvercosts.map((x) => [
          '',
          x.description,
          '',
          '',
          '',
          pct(x.diff * 100),
          PRICE_REVIEW_LABELS[x.status],
          '',
          '',
          r(x.overcost),
        ]),
      );
    }
  } else {
    reviewRows.push(['', 'Sin precios del subcontratista.']);
  }
  sheets.push({
    name: 'Revisión subcontratista',
    rows: reviewRows,
    widths: [6, 50, 8, 16, 16, 11, 11, 16, 18, 16],
    moneyCols: [3, 4, 7, 8, 9],
  });

  // ---- AIU, topes, Licify y aclaraciones
  const bid = quote.bid;
  const t = breakdown.totals;
  const adm = breakdown.adminBreakdown;
  const aiuRows: unknown[][] = [...header('AIU, TOPES DEL PLIEGO, DATOS LICIFY Y ACLARACIONES')];
  aiuRows.push(['Costo directo', '', '', '', r(t.subtotal)]);
  if (adm) {
    aiuRows.push([], ['A.1 PERSONAL DE ADMINISTRACIÓN', 'Costo mensual', 'Dedicación', 'Meses', 'Valor']);
    for (const p of bid.adminPersonnel) {
      aiuRows.push([
        p.role,
        p.monthlyCost,
        `${p.dedicationPct}%`,
        p.period === 'contract' ? bid.contractMonths : bid.fieldMonths,
        r(adminPersonCost(p, bid)),
      ]);
    }
    aiuRows.push(['A.2 GASTOS GENERALES']);
    for (const e of bid.adminExpenses) aiuRows.push([e.concept, '', '', '', r(e.value)]);
    aiuRows.push(
      ['Subtotal administración de obra y oficina (A.1 + A.2)', '', '', '', r(adm.officeAndSite)],
      ['A.3 OTROS INDIRECTOS (% del costo directo)'],
    );
    for (const x of bid.adminIndirects)
      aiuRows.push([x.concept, '', `${x.pct}%`, '', r((x.pct / 100) * t.subtotal)]);
    aiuRows.push(['Total administración', '', pct(adm.pct), '', r(adm.total)]);
  }
  if (t.aiu) {
    aiuRows.push(
      [],
      [`Administración (${pct(breakdown.aiuAdminPct)})`, '', '', '', r(t.aiu.admin)],
      [`Imprevistos (${quote.pricing.aiu.contingencyPct}%)`, '', '', '', r(t.aiu.contingency)],
      [`Utilidad (${quote.pricing.aiu.profitPct}%)`, '', '', '', r(t.aiu.profit)],
      ['Valor total sin IVA', '', '', '', r(t.aiu.subtotal)],
      [`IVA sobre la utilidad (${quote.pricing.aiu.vatOnProfitPct}%)`, '', '', '', r(t.aiu.vatOnProfit)],
      ['VALOR TOTAL OFERTA CON IVA', '', '', '', r(t.total)],
    );
  }
  aiuRows.push([], ['TOPES DEL PLIEGO (sobre valor sin IVA)', 'Valor', 'Participación', 'Tope', '¿Cumple?']);
  for (const c of analysis.caps)
    aiuRows.push([c.label, r(c.value), pct(c.sharePct), pct(c.maxPct), c.ok ? 'SÍ' : 'NO']);
  if (!bid.caps.enabled) aiuRows.push(['(Verificación de topes desactivada en la cotización)']);
  if (analysis.minProfitPctForMaterialsCap !== null) {
    aiuRows.push([
      'Utilidad mínima para cumplir el tope de materiales',
      '',
      pct(analysis.minProfitPctForMaterialsCap),
    ]);
  }
  const l = analysis.licify;
  aiuRows.push(
    [],
    ['DATOS PARA LICIFY'],
    ['Suministro', '', '', '', r(l.supply)],
    ['Instalación', '', '', '', r(l.installation)],
    ['Costo directo', '', '', '', r(l.directCost)],
    ['% Administración', '', pct(l.adminPct)],
    ['% Imprevistos', '', pct(l.contingencyPct)],
    ['% Utilidad', '', pct(l.profitPct)],
    ['% IVA', '', pct(l.vatPct)],
    ['Valor total', '', '', '', r(l.total)],
  );
  if (bid.clarifications.length) {
    aiuRows.push([], ['ACLARACIONES', 'Observación', '', 'Impacto']);
    bid.clarifications.forEach((c, i) => aiuRows.push([`${i + 1}. ${c.topic}`, c.observation, '', c.impact]));
  }
  sheets.push({ name: 'AIU y topes', rows: aiuRows, widths: [52, 40, 14, 18, 18], moneyCols: [1, 4] });

  return sheets;
}
