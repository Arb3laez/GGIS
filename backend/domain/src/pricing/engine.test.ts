import { describe, expect, it } from 'vitest';
import { blankItem, blankStaffMember, createEmptyDraft } from '../factories';
import type { QuoteDraft } from '../schemas';
import { computeQuote, priceForTargetMargin } from './engine';
import { overtimeCost, staffMemberCost } from './labor';
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
  d.pricing.method = pick(['simple', 'aiu'] as const);
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
  d.laborActivities = [{ id: 'a', concept: 'Instalación', quantity: Math.floor(r() * 5), unitPrice: 250_000 }];
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
    expect(mine.totals.subtotal).toBeCloseTo(legacy.totals.subtotal, 4);
    expect(mine.totals.total).toBeCloseTo(legacy.totals.total, 4);
    mine.items.forEach((it, i) => {
      expect(it.totalCost).toBeCloseTo(legacy.items[i].totalCost, 4);
      expect(it.saleTotal).toBeCloseTo(legacy.items[i].saleTotal, 4);
    });
  });
});

describe('computeQuote — casos calculados a mano', () => {
  it('margen sobre la venta: 30% deja 30% del precio como utilidad', () => {
    const d = createEmptyDraft();
    d.staff = [];
    d.items = [{ ...blankItem('Cámara', 'UN'), quantity: 2, unitPrice: 100_000, laborPct: 0 }];
    d.pricing = { ...d.pricing, policiesPct: 0, taxesPct: 0, financingPct: 0, contingencyPct: 0, adminPct: 0, marginPct: 30, vatPct: 19 };
    const { totals, items } = computeQuote(d);
    expect(totals.directCost).toBe(200_000);
    expect(totals.subtotal).toBeCloseTo(200_000 / 0.7, 6);
    expect(totals.profit / totals.subtotal).toBeCloseTo(0.3, 10);
    expect(totals.total).toBeCloseTo((200_000 / 0.7) * 1.19, 6);
    expect(items[0]!.marginPct).toBeCloseTo(30, 10);
  });

  it('USD con TRM, nacionalización e IVA del proveedor', () => {
    const d = createEmptyDraft();
    d.exchangeRate = 4000;
    d.importCostPct = 10;
    const item = { ...blankItem('NVR', 'UN'), quantity: 1, currency: 'USD' as const, unitPrice: 100, applyImportCost: true, supplierVatIncluded: true, laborPct: 20 };
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
    expect(sum).toBeCloseTo(totals.subtotal, 4);
  });

  it('precio para un margen objetivo usa los mismos porcentajes', () => {
    const d = createEmptyDraft();
    const p = priceForTargetMargin(1_000_000, 20, d.pricing);
    const base = 1_000_000 * (1 + (1 + 7 + 1 + 3 + 5) / 100);
    expect(p.subtotal).toBeCloseTo(base / 0.8, 6);
    expect(p.total).toBeCloseTo((base / 0.8) * 1.19, 6);
  });
});

describe('nómina', () => {
  it('días trabajados + horas extra con factor prestacional', () => {
    const m = { ...blankStaffMember('Técnico', 2_100_000, true), days: 15, hasOvertime: true };
    m.overtime.extraNight = 4;
    const hour = 2_100_000 / 210;
    expect(overtimeCost(m)).toBeCloseTo(hour * 1.75 * 4 * 1.58, 6);
    expect(staffMemberCost(m)).toBeCloseTo(((2_100_000 * 1.58 + 249_095) / 30) * 15 + hour * 1.75 * 4 * 1.58, 6);
  });
});
