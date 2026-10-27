import { describe, expect, it } from 'vitest';
import { blankItem, blankStaffMember, createEmptyDraft } from '../factories';
import { computeQuote } from '../pricing/engine';
import { staffMemberTotal } from '../pricing/labor';
import { actualCost } from './closure';
import { auditLines, linePayments } from './audit';

describe('auditoría del cierre — comparativo por ítem', () => {
  it('estado de pago del personal: la bonificación no descuenta del saldo', () => {
    expect(linePayments(1_000_000, undefined).status).toBe('unpaid');
    expect(linePayments(1_000_000, { advance: 400_000, settlement: 0, bonus: 0 })).toMatchObject({
      status: 'pending',
      balance: 600_000,
      paid: 400_000,
    });
    expect(linePayments(1_000_000, { advance: 400_000, settlement: 600_000, bonus: 50_000 })).toMatchObject({
      status: 'paid',
      balance: 0,
      paid: 1_050_000,
    });
    expect(linePayments(1_000_000, { advance: 0, settlement: 1_200_000, bonus: 0 }).status).toBe('overpaid');
  });

  it('espejo de la cotización con el precio final y los pagos del personal al lado', () => {
    const d = createEmptyDraft();
    d.staff = [{ ...blankStaffMember('Técnico', 2_000_000, true), days: 10, quantity: 2 }];
    d.items = [
      {
        ...blankItem('Cámara', 'und'),
        quantity: 10,
        unitPrice: 100_000,
        laborPct: 20,
        carriesFixedLabor: true,
      },
    ];
    d.otherCosts = [{ id: 'o1', concept: 'Transporte', quantity: 1, unitPrice: 300_000 }];
    const itemId = d.items[0]!.id;
    const staffId = d.staff[0]!.id;
    const staffQuoted = staffMemberTotal(d.staff[0]!);
    d.closure.lineActuals = {
      [`item:${itemId}`]: { actual: 1_300_000, advance: 0, settlement: 0, bonus: 0, note: 'factura' },
      [`staff:${staffId}`]: { actual: null, advance: 500_000, settlement: 0, bonus: 0, note: '' },
    };
    const a = auditLines(d, computeQuote(d));
    expect(a.sections.map((s) => s.section)).toEqual(['items', 'staff', 'others', 'overheads']);
    const item = a.sections[0]!.rows[0]!;
    // Costo propio del ítem: material + 20% de M.O., sin la M.O. fija repartida.
    expect(item.quoted).toBeCloseTo(1_200_000, 6);
    expect(item).toMatchObject({ actual: 1_300_000, note: 'factura', quantity: '10 und' });
    const staffRow = a.sections[1]!.rows[0]!;
    expect(staffRow.quoted).toBeCloseTo(staffQuoted, 6);
    // Con saldo pendiente no hay precio final todavía (el saldo no es un ahorro), pero sí gasto.
    expect(staffRow).toMatchObject({ actual: null, spent: 500_000 });
    expect(staffRow.payments).toMatchObject({ status: 'pending', advance: 500_000 });
    expect(a.spent).toBe(1_800_000);
    expect(actualCost(d)).toBe(1_800_000);
  });

  it('sin comparativo, el costo real sale de la bitácora anterior', () => {
    const d = createEmptyDraft();
    d.closure.entries = [
      { id: 'e', date: '', concept: 'Factura', amount: 250_000, categoryId: 'materiales' },
    ];
    expect(actualCost(d)).toBe(250_000);
    // Valores de líneas que ya no existen en la cotización no cuentan.
    d.closure.lineActuals = {
      'item:borrado': { actual: 999, advance: 0, settlement: 0, bonus: 0, note: '' },
    };
    expect(actualCost(d)).toBe(250_000);
  });
});
