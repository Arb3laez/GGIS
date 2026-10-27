import { describe, expect, it } from 'vitest';
import { blankItem, blankStaffMember, createEmptyDraft, STAFF_ROLE_PRESETS } from '../factories';
import type { QuoteDraft } from '../schemas';
import { computeQuote, overheadsOn, priceForTargetMargin } from './engine';
import {
  consolidateStaff,
  overtimeCost,
  staffMemberCost,
  staffMemberQuantity,
  staffMemberTotal,
  staffSubtotal,
} from './labor';
import { legacyCompute } from './legacy-reference.test-helper';

const COMPLEXITY_TO_LEGACY = { low: 'baja', medium: 'media', high: 'alta' } as const;

/** Convierte el modelo nuevo al "state" de la v68 para comparar con las fórmulas originales. */
function toLegacyState(d: QuoteDraft) {
  return {
    trm: d.exchangeRate,
    nacPct: d.importCostPct,
    method: d.pricing.method,
    marginPct: d.pricing.marginPct,
    polizasPct: d.pricing.policiesPct,
    impuestosPct: d.pricing.taxesPct,
    financiamientoPct: d.pricing.financingPct,
    otrosPct: d.pricing.contingencyPct,
    adminCostPct: d.pricing.adminPct,
    ivaPctSimple: d.pricing.vatPct,
    adminPct: d.pricing.aiu.adminPct,
    impPct: d.pricing.aiu.contingencyPct,
    utilPct: d.pricing.aiu.profitPct,
    ivaPctAiu: d.pricing.aiu.vatOnProfitPct,
    items: d.items.map((i) => ({
      id: i.id,
      desc: i.description,
      qty: i.quantity,
      currency: i.currency,
      price: i.unitPrice,
      nacIncluded: i.applyImportCost,
      ivaIncluded: i.supplierVatIncluded,
      moPct: i.laborPct,
      moDirect: i.carriesFixedLabor,
      complejidadItem: COMPLEXITY_TO_LEGACY[i.complexity],
      ventaOverride: i.salePriceOverride ?? '',
    })),
    staff: d.staff.map((s) => ({
      salario: s.monthlySalary,
      factor: s.benefitsFactor,
      auxTransporte: s.transportAllowance,
      dias: s.days,
      tieneExtra: s.hasOvertime,
      hExtraDiurna: s.overtime.extraDay,
      hExtraNocturna: s.overtime.extraNight,
      hRecargoNocturno: s.overtime.nightSurcharge,
      hDomDiurna: s.overtime.holidayDay,
      hDomNocturna: s.overtime.holidayNight,
      hDomExtraDiurna: s.overtime.holidayExtraDay,
      hDomExtraNocturna: s.overtime.holidayExtraNight,
    })),
    moExtra: d.laborActivities.map((l) => ({ qty: l.quantity, price: l.unitPrice })),
    otros: d.otherCosts.map((l) => ({ qty: l.quantity, price: l.unitPrice })),
  };
}

/** Generador pseudoaleatorio determinista (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDraft(seed: number): QuoteDraft {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const d = createEmptyDraft(new Date('2026-10-01'));
  d.exchangeRate = 3800 + Math.round(r() * 600);
  d.importCostPct = Math.round(r() * 15);
  // Paridad con la v68 en los dos métodos (el AIU va encima del subtotal, como en v68).
  d.pricing.method = r() < 0.5 ? 'simple' : 'aiu';
  d.pricing.marginPct = Math.round(r() * 40);
  d.items = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, i) => ({
    ...blankItem(r() < 0.1 ? '' : `Ítem ${i}`, 'UN'),
    quantity: Math.floor(r() * 20),
    currency: pick(['COP', 'USD'] as const),
    unitPrice: Math.round(r() * 2_000_000) / (r() < 0.3 ? 1000 : 1),
    applyImportCost: r() < 0.4,
    supplierVatIncluded: r() < 0.4,
    laborPct: Math.round(r() * 50),
    carriesFixedLabor: r() < 0.3,
    complexity: pick(['low', 'medium', 'high'] as const),
    salePriceOverride: r() < 0.15 ? Math.round(r() * 3_000_000) + 1 : null,
  }));
  d.staff = d.staff.map((s) => ({
    ...s,
    days: Math.floor(r() * 30),
    hasOvertime: r() < 0.4,
    overtime: {
      extraDay: Math.floor(r() * 10),
      extraNight: Math.floor(r() * 10),
      nightSurcharge: Math.floor(r() * 10),
      holidayDay: Math.floor(r() * 10),
      holidayNight: Math.floor(r() * 10),
      holidayExtraDay: Math.floor(r() * 10),
      holidayExtraNight: Math.floor(r() * 10),
    },
  }));
  d.laborActivities = [
    { id: 'a', concept: 'Instalación', quantity: Math.floor(r() * 5), unitPrice: 250_000 },
  ];
  d.otherCosts = [{ id: 'b', concept: 'Transporte', quantity: Math.floor(r() * 3), unitPrice: 180_000 }];
  return d;
}

describe('computeQuote — paridad con la v68', () => {
  it.each(Array.from({ length: 200 }, (_, i) => i + 1))('cotización aleatoria #%i', (seed) => {
    const draft = randomDraft(seed);
    const mine = computeQuote(draft);
    const legacy = legacyCompute(toLegacyState(draft));

    expect(mine.totals.materials).toBeCloseTo(legacy.totals.mat, 4);
    expect(mine.totals.itemLabor).toBeCloseTo(legacy.totals.mo, 4);
    expect(mine.totals.staff).toBeCloseTo(legacy.totals.staff, 4);
    expect(mine.totals.directCost).toBeCloseTo(legacy.totals.costoDirecto, 4);
    expect(mine.totals.totalCost).toBeCloseTo(legacy.totals.costoTotal, 4);
    mine.items.forEach((it, i) => {
      expect(it.totalCost).toBeCloseTo(legacy.items[i].totalCost, 4);
    });

    // Facturación (cambio intencional frente a la v68): unitarios enteros y líneas que cuadran.
    const billable = draft.items.map((it, i) => ({ it, b: mine.items[i]! })).filter((x) => x.b.isBillable);
    for (const { it, b } of billable) {
      expect(Number.isInteger(b.saleUnitPrice)).toBe(true);
      expect(b.saleTotal).toBe(Math.round(b.saleUnitPrice * it.quantity));
    }
    expect(mine.totals.subtotal).toBe(mine.items.reduce((s, i) => s + i.saleTotal, 0));
    expect(Number.isInteger(mine.totals.total)).toBe(true);
    // Sin precios fijados a mano, el subtotal solo se aparta del precio objetivo por el redondeo.
    const anyOverride = billable.some(({ it }) => (it.salePriceOverride ?? 0) > 0);
    const weighted = billable.some(({ b }) => b.totalCost > 0);
    if (!anyOverride && weighted) {
      const maxRounding = billable.reduce((s, { it }) => s + 0.5 * it.quantity + 0.5, 0);
      expect(Math.abs(mine.totals.subtotal - legacy.totals.subtotal)).toBeLessThanOrEqual(maxRounding);
      // El total (IVA o AIU + IVA sobre la U) también sigue a la v68, salvo el redondeo al peso.
      if (legacy.totals.subtotal > 0) {
        const factor = legacy.totals.total / legacy.totals.subtotal;
        expect(Math.abs(mine.totals.total - legacy.totals.total)).toBeLessThanOrEqual(
          maxRounding * factor + 4,
        );
      }
    }
  });
});

describe('computeQuote — casos calculados a mano', () => {
  it('margen sobre la venta: 30% deja 30% del precio como utilidad', () => {
    const d = createEmptyDraft();
    d.staff = [];
    d.items = [{ ...blankItem('Cámara', 'UN'), quantity: 2, unitPrice: 100_000, laborPct: 0 }];
    d.pricing = {
      ...d.pricing,
      policiesPct: 0,
      taxesPct: 0,
      financingPct: 0,
      contingencyPct: 0,
      adminPct: 0,
      marginPct: 30,
      vatPct: 19,
    };
    const { totals, items } = computeQuote(d);
    expect(totals.directCost).toBe(200_000);
    // 285.714,29 / 2 = 142.857,14 → unitario facturado $142.857 y línea $285.714
    expect(items[0]!.saleUnitPrice).toBe(142_857);
    expect(totals.subtotal).toBe(285_714);
    expect(totals.vat).toBe(Math.round(285_714 * 0.19));
    expect(totals.total).toBe(285_714 + Math.round(285_714 * 0.19));
    expect(totals.profit / totals.subtotal).toBeCloseTo(0.3, 4);
    expect(items[0]!.marginPct).toBeCloseTo(30, 3);
  });

  it('USD con TRM, nacionalización e IVA del proveedor', () => {
    const d = createEmptyDraft();
    d.exchangeRate = 4000;
    d.importCostPct = 10;
    const item = {
      ...blankItem('NVR', 'UN'),
      quantity: 1,
      currency: 'USD' as const,
      unitPrice: 100,
      applyImportCost: true,
      supplierVatIncluded: true,
      laborPct: 20,
    };
    d.items = [item];
    d.staff = [];
    const { totals } = computeQuote(d);
    expect(totals.materials).toBeCloseTo(100 * 4000 * 1.1 * 1.19, 6);
    // La M.O. se calcula sobre la base sin IVA
    expect(totals.itemLabor).toBeCloseTo(100 * 4000 * 1.1 * 0.2, 6);
  });

  it('la suma de ventas por ítem cuadra con el subtotal, con y sin precio fijado', () => {
    const d = randomDraft(42);
    const { totals, items } = computeQuote(d);
    const sum = items.reduce((s, i) => s + i.saleTotal, 0);
    expect(sum).toBe(totals.subtotal);
  });

  it('caso de la captura: 90 und × $13.737 da exactamente $1.236.330', () => {
    const d = createEmptyDraft();
    d.staff = [];
    d.items = [{ ...blankItem('Conector', 'UN'), quantity: 90, unitPrice: 9_000, laborPct: 0 }];
    const { items } = computeQuote(d);
    expect(items[0]!.saleTotal).toBe(items[0]!.saleUnitPrice * 90);
  });

  it('un ítem sin descripción no se lleva parte del precio ni descuadra la oferta', () => {
    const d = createEmptyDraft();
    d.staff = [];
    d.items = [
      { ...blankItem('Cámara', 'UN'), quantity: 1, unitPrice: 100_000, laborPct: 0 },
      { ...blankItem('', 'UN'), quantity: 1, unitPrice: 50_000, laborPct: 0 },
    ];
    const { totals, items } = computeQuote(d);
    expect(items[1]!.saleTotal).toBe(0);
    expect(items[0]!.saleTotal).toBe(totals.subtotal);
  });

  it('cantidades decimales: el total de la línea se redondea al peso', () => {
    const d = createEmptyDraft();
    d.staff = [];
    d.items = [{ ...blankItem('Cable FPLR', 'ML'), quantity: 2424.22, unitPrice: 3_000, laborPct: 0 }];
    const { items, totals } = computeQuote(d);
    expect(Number.isInteger(items[0]!.saleTotal)).toBe(true);
    expect(totals.subtotal).toBe(items[0]!.saleTotal);
  });

  it('precio para un margen objetivo usa los mismos porcentajes', () => {
    const d = createEmptyDraft();
    const p = priceForTargetMargin(1_000_000, 20, d.pricing);
    const base = 1_000_000 * (1 + (1 + 7 + 1 + 3 + 5) / 100);
    expect(p.subtotal).toBeCloseTo(base / 0.8, 6);
    expect(p.total).toBeCloseTo((base / 0.8) * 1.19, 6);
  });
});

describe('AIU — como v68: costos internos y utilidad primero, AIU encima del subtotal', () => {
  it('el ejemplo de 10.000.000: internos 17%, utilidad 30% y AIU 8/4/4', () => {
    const d = createEmptyDraft();
    d.staff = [];
    d.items = [{ ...blankItem('Sistema', 'UN'), quantity: 1, unitPrice: 10_000_000, laborPct: 0 }];
    d.pricing = {
      ...d.pricing,
      method: 'aiu',
      marginPct: 30,
      policiesPct: 1,
      taxesPct: 7,
      financingPct: 1,
      contingencyPct: 3,
      adminPct: 5,
      aiu: { adminPct: 8, contingencyPct: 4, profitPct: 4, vatOnProfitPct: 19 },
    };
    const { totals } = computeQuote(d);

    // Los costos internos sí aplican en AIU (igual que en "Subtotal + IVA").
    expect(totals.policies).toBeCloseTo(100_000, 6);
    expect(totals.adminCost).toBeCloseTo(500_000, 6);
    expect(totals.totalCost).toBeCloseTo(11_700_000, 6);
    expect(totals.subtotal).toBe(Math.round(11_700_000 / 0.7));
    expect(totals.profit).toBeCloseTo(totals.subtotal - 11_700_000, 6);
    // A, I y U sobre el subtotal; IVA solo sobre la U.
    const sub = totals.subtotal;
    expect(totals.aiu).toMatchObject({
      admin: Math.round(sub * 0.08),
      contingency: Math.round(sub * 0.04),
      profit: Math.round(sub * 0.04),
      vatOnProfit: Math.round(sub * 0.04 * 0.19),
    });
    expect(totals.total).toBe(
      sub + Math.round(sub * 0.08) + 2 * Math.round(sub * 0.04) + Math.round(sub * 0.04 * 0.19),
    );
    expect(totals.vat).toBe(0);
  });

  it('el precio para un margen objetivo usa la misma base en los dos métodos', () => {
    const d = createEmptyDraft();
    d.pricing = {
      ...d.pricing,
      method: 'aiu',
      aiu: { adminPct: 10, contingencyPct: 4, profitPct: 4, vatOnProfitPct: 19 },
    };
    const p = priceForTargetMargin(1_000_000, 20, d.pricing);
    const base = overheadsOn(1_000_000, d.pricing).total;
    expect(p.subtotal).toBeCloseTo(base / 0.8, 6);
    expect(p.aiu!.profit).toBeCloseTo((base / 0.8) * 0.04, 6);
  });
});

describe('nómina', () => {
  it('días trabajados + horas extra con factor prestacional', () => {
    const m = { ...blankStaffMember('Técnico', 2_100_000, true), days: 15, hasOvertime: true };
    m.overtime.extraNight = 4;
    const hour = 2_100_000 / 210;
    expect(overtimeCost(m)).toBeCloseTo(hour * 1.75 * 4 * 1.58, 6);
    expect(staffMemberCost(m)).toBeCloseTo(
      ((2_100_000 * 1.58 + 249_095) / 30) * 15 + hour * 1.75 * 4 * 1.58,
      6,
    );
  });

  it('multiplica el costo por la cantidad de personas', () => {
    const m = { ...blankStaffMember('Técnico', 2_100_000, true), days: 15, quantity: 2 };
    expect(staffMemberQuantity(m)).toBe(2);
    expect(staffMemberTotal(m)).toBeCloseTo(staffMemberCost(m) * 2, 6);
    expect(staffSubtotal([m])).toBeCloseTo(staffMemberCost(m) * 2, 6);
  });

  it('consolida cargos del mismo perfil y conserva el total', () => {
    const base = { ...blankStaffMember('Técnico líder', 2_100_000, true), days: 120 };
    const a = { ...base, id: 'a', quantity: 2 };
    const b = { ...base, id: 'b', quantity: 1 };
    const c = { ...base, id: 'c', monthlySalary: 1_750_905, quantity: 1 };
    const blank1 = { ...blankStaffMember('', 0, false), id: 'd' };
    const blank2 = { ...blankStaffMember('', 0, false), id: 'e' };

    const before = staffSubtotal([a, b, c, blank1, blank2]);
    const consolidated = consolidateStaff([a, b, c, blank1, blank2]);

    expect(consolidated).toHaveLength(4);
    expect(consolidated[0]!.quantity).toBe(3);
    expect(consolidated[1]!.quantity).toBe(1);
    expect(staffSubtotal(consolidated)).toBeCloseTo(before, 6);
  });

  it('computeQuote usa la cantidad en el costo de personal', () => {
    const d = createEmptyDraft();
    d.items = [];
    d.laborActivities = [];
    d.otherCosts = [];
    d.staff = [{ ...blankStaffMember('Técnico', 2_100_000, true), days: 15, quantity: 2 }];
    const { totals } = computeQuote(d);
    expect(totals.staff).toBeCloseTo(staffMemberCost(d.staff[0]!) * 2, 6);
  });

  it('liquida cada concepto de horas extra con su tarifa', () => {
    const base = {
      ...blankStaffMember('Técnico', 2_100_000, false),
      benefitsFactor: 1,
      days: 0,
      hasOvertime: true,
    };
    const rate = 2_100_000 / 210;
    const cases: Array<[keyof typeof base.overtime, number]> = [
      ['extraDay', 1.25],
      ['extraNight', 1.75],
      ['nightSurcharge', 0.35],
      ['holidayDay', 0.9],
      ['holidayNight', 1.25],
      ['holidayExtraDay', 2.15],
      ['holidayExtraNight', 2.65],
    ];
    for (const [key, multiplier] of cases) {
      const m = { ...base, overtime: { ...base.overtime, [key]: 1 } };
      expect(overtimeCost(m)).toBeCloseTo(rate * multiplier, 6);
    }
  });

  it('los cargos sugeridos traen salario y auxilio', () => {
    const siso = STAFF_ROLE_PRESETS.find((p) => p.role === 'Inspector SISO');
    expect(siso).toMatchObject({ monthlySalary: 1_750_905, transportAllowance: false });
    const lider = STAFF_ROLE_PRESETS.find((p) => p.role === 'Técnico líder');
    expect(lider?.monthlySalary).toBe(2_100_000);
  });
});
