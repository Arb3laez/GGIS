import { MONTHLY_HOURS_2026, SURCHARGES, TRANSPORT_ALLOWANCE_2026 } from '../constants';
import type { CostLine, StaffMember } from '../schemas';

/** Valor de la hora ordinaria: salario sin auxilio de transporte ÷ horas legales del mes (Art. 168 CST). */
export function ordinaryHourlyRate(member: StaffMember): number {
  return member.monthlySalary / MONTHLY_HOURS_2026;
}

/**
 * Costo adicional por horas extra, nocturnas y dominicales/festivas.
 * Las horas extra se pagan completas (100% + recargo); los recargos ordinarios (nocturno,
 * dominical sin ser extra) son solo el % adicional. Se multiplica por el factor prestacional
 * porque esas horas también generan prestaciones.
 */
export function overtimeCost(member: StaffMember): number {
  if (!member.hasOvertime) return 0;
  const rate = ordinaryHourlyRate(member);
  const h = member.overtime;
  const s = SURCHARGES;
  const gross =
    rate * (1 + s.extraDay) * h.extraDay +
    rate * (1 + s.extraNight) * h.extraNight +
    rate * s.night * h.nightSurcharge +
    rate * s.holiday * h.holidayDay +
    rate * (s.holiday + s.night) * h.holidayNight +
    rate * (1 + s.holiday + s.extraDay) * h.holidayExtraDay +
    rate * (1 + s.holiday + s.extraNight) * h.holidayExtraNight;
  return gross * (member.benefitsFactor || 1);
}

/** Costo mensual cargado: salario × factor prestacional + auxilio de transporte. */
export function monthlyLoadedCost(member: StaffMember): number {
  return (
    member.monthlySalary * member.benefitsFactor + (member.transportAllowance ? TRANSPORT_ALLOWANCE_2026 : 0)
  );
}

/** (Mensual cargado ÷ 30) × días trabajados + horas extra. Costo de UNA persona. */
export function staffMemberCost(member: StaffMember): number {
  return (monthlyLoadedCost(member) / 30) * member.days + overtimeCost(member);
}

/** Cantidad de personas del cargo, con respaldo para cotizaciones viejas sin el campo. */
export function staffMemberQuantity(member: StaffMember): number {
  const q = member.quantity ?? 1;
  return Number.isFinite(q) && q >= 1 ? Math.floor(q) : 1;
}

/** Costo total del cargo: costo por persona × cantidad de personas. */
export function staffMemberTotal(member: StaffMember): number {
  return staffMemberCost(member) * staffMemberQuantity(member);
}

export function staffSubtotal(staff: readonly StaffMember[]): number {
  return staff.reduce((sum, m) => sum + staffMemberTotal(m), 0);
}

/** Perfil que debe coincidir para consolidar dos filas en un solo cargo con cantidad. */
export function staffMemberKey(member: StaffMember): string {
  return JSON.stringify({
    role: member.role.trim().toLowerCase(),
    monthlySalary: member.monthlySalary,
    benefitsFactor: member.benefitsFactor,
    transportAllowance: member.transportAllowance,
    days: member.days,
    hasOvertime: member.hasOvertime,
    overtime: member.overtime,
  });
}

/**
 * Agrupa filas repetidas del mismo cargo y mismo perfil de pago en una sola fila,
 * sumando la cantidad de personas. Las filas sin cargo se dejan intactas.
 */
export function consolidateStaff(staff: readonly StaffMember[]): StaffMember[] {
  const out: StaffMember[] = [];
  const byKey = new Map<string, StaffMember>();

  for (const m of staff) {
    if (!m.role.trim()) {
      out.push({ ...m, overtime: { ...m.overtime } });
      continue;
    }
    const key = staffMemberKey(m);
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = staffMemberQuantity(existing) + staffMemberQuantity(m);
    } else {
      const copy = { ...m, quantity: staffMemberQuantity(m), overtime: { ...m.overtime } };
      byKey.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

export function costLineTotal(line: CostLine): number {
  return line.quantity * line.unitPrice;
}

export function costLinesSubtotal(lines: readonly CostLine[]): number {
  return lines.reduce((sum, l) => sum + costLineTotal(l), 0);
}
