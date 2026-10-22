import { describe, expect, it } from 'vitest';
import { blankItem, createEmptyDraft } from '../factories';
import { computeQuote } from './engine';
import { suggestAiu } from './suggestions';

describe('sugerencia de AIU', () => {
  it('sube A e I en extinción de incendios con complejidad alta e importados', () => {
    const d = createEmptyDraft();
    d.solution = 'fire_suppression';
    d.complexity = 'high';
    d.serviceType = 'preventive';
    d.terms = { ...d.terms, financingDays: 60, advancePct: 20 };
    d.staff = [];
    d.items = [
      {
        ...blankItem('Sistema', 'UN'),
        quantity: 1,
        currency: 'USD',
        unitPrice: 100,
        applyImportCost: true,
        laborPct: 0,
      },
    ];

    const s = suggestAiu(d, computeQuote(d).totals);
    expect(s.value).toEqual({ adminPct: 15, contingencyPct: 8, profitPct: 6 });
    expect(s.reasons.join(' ')).toContain('extinción');
    expect(s.reasons.join(' ')).toContain('importados');
  });

  it('baja el AIU en suministro solo, complejidad baja y proyecto grande', () => {
    const d = createEmptyDraft();
    d.solution = 'cctv';
    d.complexity = 'low';
    d.serviceType = 'supply_only';
    d.terms = { ...d.terms, financingDays: 0, advancePct: 60 };
    d.staff = [];
    d.items = [{ ...blankItem('Equipo', 'UN'), quantity: 1, unitPrice: 200_000_000, laborPct: 0 }];

    const s = suggestAiu(d, computeQuote(d).totals);
    expect(s.value).toEqual({ adminPct: 8, contingencyPct: 3, profitPct: 3 });
    expect(s.reasons.join(' ')).toContain('solo suministro');
  });
});
