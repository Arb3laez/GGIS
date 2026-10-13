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

/** (Mensual cargado ÷ 30) × días trabajados + horas extra. */
export function staffMemberCost(member: StaffMember): number {
  return (monthlyLoadedCost(member) / 30) * member.days + overtimeCost(member);
}

export function staffSubtotal(staff: readonly StaffMember[]): number {
  return staff.reduce((sum, m) => sum + staffMemberCost(m), 0);
}

export function costLineTotal(line: CostLine): number {
  return line.quantity * line.unitPrice;
}

export function costLinesSubtotal(lines: readonly CostLine[]): number {
  return lines.reduce((sum, l) => sum + costLineTotal(l), 0);
}
