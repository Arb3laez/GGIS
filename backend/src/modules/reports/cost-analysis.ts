import * as XLSX from 'xlsx';
import {
  computeQuote,
  costLineTotal,
  formatLongDate,
  monthlyLoadedCost,
  overtimeCost,
  PRICING_METHOD_LABELS,
  QUOTE_STATUS_LABELS,
  BUSINESS_UNIT_LABELS,
  SERVICE_TYPE_LABELS,
  safeFileName,
  staffMemberCost,
  staffMemberQuantity,
  staffMemberTotal,
  type CompanyProfile,
  type Quote,
} from '@ggis/domain';

/**
 * Hoja de análisis de costos (documento INTERNO de auditoría, no se entrega al cliente).
 * Cuatro hojas: resumen, materiales y M.O., personal fijo y otros costos.
 */
export function buildCostAnalysisWorkbook(quote: Quote, company: CompanyProfile) {
  const breakdown = computeQuote(quote);
  const { totals: t, items } = breakdown;
  const pct = (part: number) => (t.total > 0 ? `${((part / t.total) * 100).toFixed(1)}%` : '0%');
  const r = Math.round;
  const p = quote.pricing;
  const method = PRICING_METHOD_LABELS[p.method];
  const header = (title: string) => [
    [`${company.legalName} · Análisis de costos`],
    [title],
    [`${quote.number} · ${quote.client.name}`],
    [],
  ];

  const summary: unknown[][] = [
    ['HOJA DE ANÁLISIS DE COSTOS — DOCUMENTO INTERNO DE AUDITORÍA'],
    [company.legalName],
    [],
    [
      'Cotización',
      quote.number,
      '',
      'Unidad / servicio',
      [
        quote.businessUnit ? BUSINESS_UNIT_LABELS[quote.businessUnit] : '',
        quote.serviceType ? SERVICE_TYPE_LABELS[quote.serviceType] : '',
      ]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    ['Estado', QUOTE_STATUS_LABELS[quote.status], '', 'Modalidad', method],
    ['Cliente', quote.client.name || '—', '', 'Proyecto', quote.client.project || '—'],
    ['Contacto', quote.client.contact || '—', '', 'Ciudad', quote.client.city || '—'],
    ['Fecha de emisión', formatLongDate(quote.issueDate), '', 'Válida (días)', quote.validDays],
    ['TRM aplicada', quote.exchangeRate, '', '% nacionalización/transporte', `${quote.importCostPct}%`],
    [],
    ['ESTRUCTURA DEL COSTO Y CONSTRUCCIÓN DEL PRECIO', '', '', '', 'VALOR', '% DEL TOTAL'],
    ['1. Materiales', '', '', '', r(t.materials), pct(t.materials)],
    ['2. Mano de obra instalación', '', '', '', r(t.itemLabor), pct(t.itemLabor)],
    ['3. Mano de obra por actividad', '', '', '', r(t.laborActivities), pct(t.laborActivities)],
    ['4. Personal fijo del proyecto', '', '', '', r(t.staff), pct(t.staff)],
    ['5. Otros costos del proyecto', '', '', '', r(t.otherCosts), pct(t.otherCosts)],
    ['= COSTO DIRECTO', '', '', '', r(t.directCost), pct(t.directCost)],
  ];
  summary.push(
    [`6. Pólizas (${p.policiesPct}% sobre costo directo)`, '', '', '', r(t.policies), pct(t.policies)],
    [`7. Impuestos (${p.taxesPct}% sobre costo directo)`, '', '', '', r(t.taxes), pct(t.taxes)],
    [
      `8. Financiamiento (${p.financingPct}% sobre costo directo)`,
      '',
      '',
      '',
      r(t.financing),
      pct(t.financing),
    ],
    [`9. Imprevistos internos (${p.contingencyPct}%)`, '', '', '', r(t.contingency), pct(t.contingency)],
    [`10. Administración interna (${p.adminPct}%)`, '', '', '', r(t.adminCost), pct(t.adminCost)],
    ['= COSTO TOTAL DEL PROYECTO', '', '', '', r(t.totalCost), pct(t.totalCost)],
    [`+ UTILIDAD (${p.marginPct}% sobre el precio de venta)`, '', '', '', r(t.profit), pct(t.profit)],
    ['= SUBTOTAL (valor de venta)', '', '', '', r(t.subtotal), pct(t.subtotal)],
  );
  if (t.aiu) {
    summary.push(
      [`+ Administración A (${p.aiu.adminPct}%)`, '', '', '', r(t.aiu.admin), pct(t.aiu.admin)],
      [
        `+ Imprevistos I (${p.aiu.contingencyPct}%)`,
        '',
        '',
        '',
        r(t.aiu.contingency),
        pct(t.aiu.contingency),
      ],
      [`+ Utilidad U (${p.aiu.profitPct}%)`, '', '', '', r(t.aiu.profit), pct(t.aiu.profit)],
      [
        `+ IVA sobre la utilidad (${p.aiu.vatOnProfitPct}%)`,
        '',
        '',
        '',
        r(t.aiu.vatOnProfit),
        pct(t.aiu.vatOnProfit),
      ],
    );
  } else {
    summary.push([`+ IVA (${p.vatPct}%)`, '', '', '', r(t.vat), pct(t.vat)]);
  }
  const grossProfit = t.total - t.directCost;
  summary.push(
    [],
    ['TOTAL DE LA OFERTA', '', '', '', r(t.total), '100%'],
    [],
    ['INDICADORES DE RENTABILIDAD (para auditoría)'],
    ['Costo directo', '', '', '', r(t.directCost)],
    ['Ganancia bruta (total − costo directo)', '', '', '', r(grossProfit)],
    ['Margen bruto sobre venta', '', '', '', pct(grossProfit)],
    [
      'Markup sobre costo',
      '',
      '',
      '',
      t.directCost > 0 ? `${((grossProfit / t.directCost) * 100).toFixed(1)}%` : '—',
    ],
  );

  const materials: unknown[][] = [
    ...header('DETALLE DE MATERIALES Y MANO DE OBRA'),
    [
      '#',
      'Descripción',
      'Und',
      'Cant',
      'Moneda',
      'Precio unit. origen',
      'TRM',
      '¿Nac/transp?',
      '¿IVA?',
      '% M.O.',
      'Costo material COP',
      'Costo M.O. COP',
      'Costo unit. total',
      'COSTO TOTAL ÍTEM',
      'Venta unit.',
      'VENTA TOTAL ÍTEM',
    ],
  ];
  let n = 0;
  quote.items.forEach((it, i) => {
    if (!it.description.trim()) return;
    const b = items[i]!;
    materials.push([
      ++n,
      it.description,
      it.unit,
      it.quantity,
      it.currency,
      it.unitPrice,
      it.currency === 'USD' ? quote.exchangeRate : '—',
      it.applyImportCost ? 'Sí' : 'No',
      it.supplierVatIncluded ? 'Sí' : 'No',
      `${it.laborPct}%`,
      r(b.unitMaterialCost),
      r(b.unitLaborCost),
      r(b.unitCost),
      r(b.totalCost),
      r(b.saleUnitPrice),
      r(b.saleTotal),
    ]);
  });
  materials.push(
    [],
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'TOTALES',
      '',
      '',
      '',
      r(items.reduce((s, b) => s + b.totalCost, 0)),
      '',
      r(items.reduce((s, b) => s + b.saleTotal, 0)),
    ],
  );

  const staff: unknown[][] = [
    ...header('PERSONAL FIJO DEL PROYECTO (costo interno — no aparece en la oferta)'),
    [
      'Cargo',
      'Personal',
      'Salario mes',
      'Factor prestacional',
      'Aux. transporte',
      'Valor día',
      'Días trabajados',
      'Extra/noche grupo',
      'Costo unit.',
      'COSTO TOTAL',
    ],
    ...quote.staff.map((m) => [
      m.role,
      staffMemberQuantity(m),
      m.monthlySalary,
      m.benefitsFactor,
      m.transportAllowance ? 'Sí' : 'No',
      r(monthlyLoadedCost(m) / 30),
      m.days,
      r(overtimeCost(m) * staffMemberQuantity(m)),
      r(staffMemberCost(m)),
      r(staffMemberTotal(m)),
    ]),
    [],
    ['', '', '', '', '', '', '', '', 'SUBTOTAL PERSONAL', r(t.staff)],
  ];

  const others: unknown[][] = [
    ...header('MANO DE OBRA POR ACTIVIDAD Y OTROS COSTOS (costo interno — no aparece en la oferta)'),
    ['Tipo', 'Concepto', 'Cantidad', 'Valor unitario', 'COSTO TOTAL'],
    ...quote.laborActivities.map((l) => [
      'M.O. actividad',
      l.concept,
      l.quantity,
      l.unitPrice,
      r(costLineTotal(l)),
    ]),
    ...quote.otherCosts.map((l) => ['Otro costo', l.concept, l.quantity, l.unitPrice, r(costLineTotal(l))]),
    [],
    ['', '', '', 'SUBTOTAL', r(t.laborActivities + t.otherCosts)],
  ];

  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Resumen auditoría', summary, [44, 16, 4, 22, 18, 12], [4]);
  addSheet(
    wb,
    'Materiales y M.O.',
    materials,
    [4, 44, 6, 7, 8, 16, 8, 10, 7, 7, 16, 14, 15, 17, 16, 17],
    [10, 11, 12, 13, 14, 15],
  );
  addSheet(wb, 'Personal fijo', staff, [50, 9, 14, 16, 14, 12, 14, 16, 14, 16], [2, 5, 7, 8, 9]);
  addSheet(wb, 'Otros costos', others, [16, 44, 12, 16, 16], [3, 4]);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { buffer, fileName: `Analisis costos ${quote.number} - ${safeFileName(quote.client.name)}.xlsx` };
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: unknown[][], widths: number[], moneyCols: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (const C of moneyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })] as XLSX.CellObject | undefined;
      if (cell && typeof cell.v === 'number') cell.z = '"$"#,##0';
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
}
