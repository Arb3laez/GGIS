import {
  blankStaffMember,
  formatCop,
  ordinaryHourlyRate,
  overtimeCost,
  staffMemberCost,
  type OvertimeHours,
  type StaffMember,
} from '@ggis/domain';
import { HardHat } from 'lucide-react';
import { Checkbox, NumberInput } from '../../../shared/inputs';
import { SectionTitle } from '../../../shared/SectionTitle';
import { useBreakdown, useDraft, useEdit } from '../store';

const OVERTIME_FIELDS: Array<{ group: string; fields: Array<[keyof OvertimeHours, string]> }> = [
  {
    group: 'Entre semana',
    fields: [
      ['extraDay', 'Horas extra diurnas (+25%)'],
      ['extraNight', 'Horas extra nocturnas (+75%)'],
      ['nightSurcharge', 'Recargo nocturno, sin ser extra (+35%)'],
    ],
  },
  {
    group: 'Domingo o festivo',
    fields: [
      ['holidayDay', 'Diurnas, sin ser extra (+90%)'],
      ['holidayNight', 'Nocturnas, sin ser extra (+125%)'],
      ['holidayExtraDay', 'Extra diurnas (+115%)'],
      ['holidayExtraNight', 'Extra nocturnas (+165%)'],
    ],
  },
];

export function StaffSection() {
  const d = useDraft();
  const edit = useEdit();
  const { totals } = useBreakdown();

  const editMember = (id: string, recipe: (m: StaffMember) => void) =>
    edit((x) => {
      const m = x.staff.find((s) => s.id === id);
      if (m) recipe(m);
    });

  return (
    <section className="card" id="personal" aria-labelledby="staff-title">
      <SectionTitle icon={<HardHat size={16} />} id="staff-title">
        Personal fijo en el proyecto
      </SectionTitle>
      <div className="sub">
        (Salario × factor prestacional + auxilio de transporte) ÷ 30 × días trabajados. Salario mínimo 2026
        $1.750.905 y auxilio $249.095. Marca "Extra/noche" para calcular horas extra y recargos (jornada 42
        h/semana, nocturna desde las 7:00 p.m., dominical 90%). Es una estimación para presupuestar: para
        nómina real valida con tu contador.
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cargo</th>
              <th className="col-md">Salario mes</th>
              <th className="col-sm">Factor prest.</th>
              <th className="col-xs">Aux. transp.</th>
              <th className="col-sm">Días</th>
              <th className="col-xs">Extra/ noche</th>
              <th className="col-md">Total</th>
              <th className="col-xs" />
            </tr>
          </thead>
          <tbody>
            {d.staff.map((m) => (
              <StaffRows
                key={m.id}
                member={m}
                onEdit={(r) => editMember(m.id, r)}
                onRemove={() => edit((x) => void (x.staff = x.staff.filter((s) => s.id !== m.id)))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="small add-row"
        onClick={() => edit((x) => void x.staff.push(blankStaffMember()))}
      >
        + Agregar cargo
      </button>
      <div className="subtotal-line">
        Subtotal personal fijo: <b>{formatCop(totals.staff)}</b>
      </div>
    </section>
  );
}

function StaffRows({
  member: m,
  onEdit,
  onRemove,
}: {
  member: StaffMember;
  onEdit: (r: (m: StaffMember) => void) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          <input
            className="cell"
            value={m.role}
            aria-label="Cargo"
            onChange={(e) => onEdit((x) => void (x.role = e.target.value))}
          />
        </td>
        <td>
          <NumberInput
            value={m.monthlySalary}
            ariaLabel="Salario mensual"
            onChange={(n) => onEdit((x) => void (x.monthlySalary = n ?? 0))}
          />
        </td>
        <td>
          <NumberInput
            value={m.benefitsFactor}
            ariaLabel="Factor prestacional"
            onChange={(n) => onEdit((x) => void (x.benefitsFactor = Math.min(5, n ?? 0)))}
          />
        </td>
        <td className="col-center">
          <Checkbox
            checked={m.transportAllowance}
            title="Auxilio de transporte"
            onChange={(v) => onEdit((x) => void (x.transportAllowance = v))}
          />
        </td>
        <td>
          <NumberInput
            value={m.days}
            ariaLabel="Días trabajados"
            onChange={(n) => onEdit((x) => void (x.days = n ?? 0))}
          />
        </td>
        <td className="col-center">
          <Checkbox
            checked={m.hasOvertime}
            title="Trabaja horas extra o de noche"
            onChange={(v) => onEdit((x) => void (x.hasOvertime = v))}
          />
        </td>
        <td className="num-out">{formatCop(staffMemberCost(m))}</td>
        <td>
          <button type="button" className="ghost-danger" aria-label="Eliminar cargo" onClick={onRemove}>
            ×
          </button>
        </td>
      </tr>
      {m.hasOvertime ? (
        <tr>
          <td colSpan={8} style={{ background: 'var(--steel-light)', padding: '10px 14px' }}>
            <div className="hint" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Horas extra / recargos de "{m.role || 'este cargo'}" · hora ordinaria{' '}
              {formatCop(ordinaryHourlyRate(m))}
            </div>
            {OVERTIME_FIELDS.map((g) => (
              <div key={g.group} style={{ marginTop: 8 }}>
                <div className="hint">{g.group}</div>
                <div className="filters" style={{ marginBottom: 0 }}>
                  {g.fields.map(([key, label]) => (
                    <label key={key} className="field" style={{ width: 170 }}>
                      <span>{label}</span>
                      <NumberInput
                        value={m.overtime[key]}
                        onChange={(n) => onEdit((x) => void (x.overtime[key] = n ?? 0))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13 }}>
              Costo extra de este cargo: <b className="num-out">{formatCop(overtimeCost(m))}</b>
            </div>
            <div className="hint">
              Extra nocturna = recargo único (ya incluye la nocturnidad). Tope legal: 2 horas extra por día y
              12 por semana. El domingo/festivo habitual exige además un día de descanso compensatorio.
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
