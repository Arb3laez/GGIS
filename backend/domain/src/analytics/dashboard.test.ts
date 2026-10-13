import { describe, expect, it } from 'vitest';
import type { QuoteSummary } from '../contracts';
import { buildDashboard, lastMonths, monthlyActivity, pendingFollowUps, unitMonthMatrix } from './dashboard';

function q(p: Partial<QuoteSummary>): QuoteSummary {
  return {
    id: Math.random().toString(36),
    number: 'OT-0001',
    clientName: 'Cliente',
    projectName: '',
    issueDate: '2026-10-01',
    validDays: 30,
    status: 'sent',
    businessUnit: 'cctv',
    lossReason: null,
    nextFollowUp: null,
    total: 1_000,
    budgetedCost: 600,
    actualCost: 0,
    actualSale: 0,
    closedOn: null,
    updatedAt: '2026-10-01T00:00:00Z',
    ...p,
  };
}

describe('series mensuales', () => {
  it('genera los últimos meses cruzando el año', () => {
    expect(lastMonths('2026-02-15', 4).map((m) => m.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(lastMonths('2026-02-15', 1)[0]!.label).toBe('Feb');
  });

  it('suma cotizado y adjudicado por mes de emisión', () => {
    const list = [
      q({ issueDate: '2026-10-03', total: 100 }),
      q({ issueDate: '2026-10-20', total: 50, status: 'won' }),
      q({ issueDate: '2026-09-01', total: 70 }),
      q({ issueDate: '2025-01-01', total: 999 }), // fuera del periodo
    ];
    const m = monthlyActivity(list, '2026-10-10', 2);
    expect(m).toEqual([
      { key: '2026-09', label: 'Sep', year: 2026, quoted: 70, won: 0, count: 1 },
      { key: '2026-10', label: 'Oct', year: 2026, quoted: 150, won: 50, count: 2 },
    ]);
  });

  it('matriz unidad × mes', () => {
    const cells = unitMonthMatrix(
      [q({ businessUnit: 'fire' }), q({ businessUnit: 'fire' }), q({ businessUnit: null })],
      '2026-10-10',
    );
    expect(cells.find((c) => c.unit === 'fire')).toMatchObject({ month: '2026-10', count: 2, value: 2_000 });
    expect(cells.find((c) => c.unit === null)?.count).toBe(1);
  });
});

describe('indicadores', () => {
  it('tasa de cierre y seguimientos vencidos', () => {
    const list = [
      q({ status: 'won' }),
      q({ status: 'lost', lossReason: 'price' }),
      q({ status: 'sent', issueDate: '2026-09-01' }),
      q({ status: 'negotiating', nextFollowUp: '2026-12-01' }),
    ];
    const d = buildDashboard(list, '2026-10-10');
    expect(d.closeRatePct).toBe(50);
    expect(d.lossReasons).toEqual([{ reason: 'price', count: 1 }]);
    expect(pendingFollowUps(list, '2026-10-10')).toHaveLength(1);
  });
});
