import { describe, expect, it } from 'vitest';
import { blankItem, createEmptyDraft } from '../factories';
import { computeQuote } from './engine';
import { monthlyCuts, paymentSchedule, summarizePaymentPlan } from './payments';
import { quoteWarnings } from './suggestions';

function draftWithPump() {
  const d = createEmptyDraft(new Date('2026-11-01'));
  d.items = [
    { ...blankItem('Bomba contra incendio 250 GPM', 'UND'), id: 'pump', quantity: 1, unitPrice: 60_000_000 },
    { ...blankItem('Tubería y accesorios', 'GL'), id: 'pipe', quantity: 1, unitPrice: 20_000_000 },
  ];
  return d;
}

describe('plan de pagos por cortes', () => {
  it('sin plan propio usa los tres porcentajes de siempre', () => {
    const d = draftWithPump();
    d.terms.advancePct = 40;
    d.terms.progressPct = 60;
    d.terms.onDeliveryPct = 0;
    const s = paymentSchedule(d, computeQuote(d));
    expect(s.rows.map((r) => r.concept)).toEqual(['Anticipo', 'Avance por ejecución']);
    expect(Math.abs(s.difference)).toBeLessThanOrEqual(1);
  });

  it('anticipo del 50% de la bomba + 30% del resto, cortes mensuales y pago final cuadran con el total', () => {
    const d = draftWithPump();
    const b = computeQuote(d);
    const factor = b.totals.total / b.totals.subtotal;
    const pumpValue = b.items[0]!.saleTotal * factor;
    d.terms.paymentPlan = [
      {
        id: 'a1',
        kind: 'advance',
        concept: 'Anticipo bomba',
        pct: 50,
        base: 'items',
        itemIds: ['pump'],
        when: 'Al firmar',
      },
      {
        id: 'a2',
        kind: 'advance',
        concept: 'Anticipo obra',
        pct: 30,
        base: 'rest',
        itemIds: [],
        when: 'Al firmar',
      },
    ];
    const s1 = paymentSchedule(d, b);
    expect(s1.rows[0]!.amount).toBe(Math.round(pumpValue * 0.5));
    expect(s1.rows[1]!.baseAmount).toBe(Math.round(b.totals.total - pumpValue));
    // El resto: 4 cortes mensuales del 15% del total y un pago final con lo que falte.
    d.terms.paymentPlan.push(...monthlyCuts(4, 15));
    const partial = paymentSchedule(d, b);
    const finalPct = (partial.difference / b.totals.total) * 100;
    d.terms.paymentPlan.push({
      id: 'f',
      kind: 'final',
      concept: 'Pago final',
      pct: finalPct,
      base: 'total',
      itemIds: [],
      when: 'Al entregar',
    });
    const s = paymentSchedule(d, b);
    expect(s.rows).toHaveLength(7);
    expect(Math.abs(s.difference)).toBeLessThanOrEqual(1);
    const sum = summarizePaymentPlan(s);
    expect(Math.round(sum.advancePct + sum.progressPct + sum.onDeliveryPct)).toBe(100);
    expect(quoteWarnings(d, b).some((w) => w.code === 'payment-split')).toBe(false);
  });

  it('avisa cuando el plan no cubre el total', () => {
    const d = draftWithPump();
    d.terms.paymentPlan = monthlyCuts(2, 20);
    const w = quoteWarnings(d, computeQuote(d)).find((x) => x.code === 'payment-split');
    expect(w?.message).toMatch(/faltan/);
  });
});
