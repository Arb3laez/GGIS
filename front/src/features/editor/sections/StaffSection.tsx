import { useState } from 'react';
import {
  blankStaffMember,
  consolidateStaff,
  DEFAULT_BENEFITS_FACTOR,
  formatCop,
  ordinaryHourlyRate,
  overtimeCost,
  STAFF_ROLE_PRESETS,
  staffMemberKey,
  staffMemberQuantity,
  staffMemberTotal,
  type OvertimeHours,
  type StaffMember,
} from '@ggis/domain';
import { Combine, HardHat } from 'lucide-react';
import { useToast } from '../../../shared/feedback';
import { Checkbox, formatPesos, NumberInput } from '../../../shared/inputs';
import { SectionTitle } from '../../../shared/SectionTitle';
import { useBreakdown, useDraft, useEdit } from '../store';

type OvertimeConcept = {
  key: keyof OvertimeHours;
  group: string;
  label: string;
  multiplier: number;
  kind: 'extra' | 'surcharge';
};

const WEEKDAY = 'Día de semana (lunes a sábado)';
const SUNDAY = 'Domingo o festivo';

const OVERTIME_CONCEPTS: readonly OvertimeConcept[] = [
  {
    key: 'extraDay',
    group: WEEKDAY,
    label: 'Extra diurna — recargo 25% (125% de la hora)',
    multiplier: 1.25,
    kind: 'extra',
  },
  {
    key: 'extraNight',
    group: WEEKDAY,
    label: 'Extra nocturna — recargo 75% (175% de la hora)',
    multiplier: 1.75,
    kind: 'extra',
  },
  {
    key: 'nightSurcharge',
    group: WEEKDAY,
    label: 'Recargo nocturno sin extra — +35%',
    multiplier: 0.35,
    kind: 'surcharge',
  },
  {
    key: 'holidayDay',
    group: SUNDAY,
    label: 'Diurna sin extra — +90%',
    multiplier: 0.9,
    kind: 'surcharge',
  },
  {
    key: 'holidayNight',
    group: SUNDAY,
    label: 'Nocturna sin extra — +125%',
    multiplier: 1.25,
    kind: 'surcharge',
  },
  {
    key: 'holidayExtraDay',
    group: SUNDAY,
    label: 'Extra diurna — recargo 115% (215% de la hora)',
    multiplier: 2.15,
    kind: 'extra',
  },
  {
    key: 'holidayExtraNight',
    group: SUNDAY,
    label: 'Extra nocturna — recargo 165% (265% de la hora)',
    multiplier: 2.65,
    kind: 'extra',
  },
];

const OVERTIME_FIELDS = [WEEKDAY, SUNDAY].map((group) => ({
  group,
  fields: OVERTIME_CONCEPTS.filter((c) => c.group === group).map(
    (c) => [c.key, c.label] as [keyof OvertimeHours, string],
  ),
}));

export function StaffSection() {
  const d = useDraft();
  const edit = useEdit();
  const notify = useToast();
  const { totals } = useBreakdown();
  const duplicateRows = d.staff.length - consolidateStaff(d.staff).length;

  const editMember = (id: string, recipe: (m: StaffMember) => void) =>
    edit((x) => {
      const m = x.staff.find((s) => s.id === id);
      if (m) recipe(m);
    });

  /**
   * Al salir del cargo: completa salario/factor/auxilio si el cargo es un preset y el salario está en 0;
   * luego, si ya existe una fila idéntica, suma la cantidad en vez de duplicar.
   */
  const handleRoleBlur = (id: string) =>
    edit((x) => {
      const current = x.staff.find((s) => s.id === id);
      if (!current || !current.role.trim()) return;
      if (current.monthlySalary === 0) {
        const preset = STAFF_ROLE_PRESETS.find(
          (p) => p.role.toLowerCase() === current.role.trim().toLowerCase(),
        );
        if (preset) {
          current.monthlySalary = preset.monthlySalary;
          current.benefitsFactor = DEFAULT_BENEFITS_FACTOR;
          current.transportAllowance = preset.transportAllowance;
        }
      }
      const key = staffMemberKey(current);
      const other = x.staff.find((s) => s.id !== id && staffMemberKey(s) === key);
      if (!other) return;
      other.quantity = staffMemberQuantity(other) + staffMemberQuantity(current);
      x.staff = x.staff.filter((s) => s.id !== id);
    });

  const consolidateAll = () => {
    let before = 0;
    let after = 0;
    edit((x) => {
      before = x.staff.length;
      x.staff = consolidateStaff(x.staff);
      after = x.staff.length;
    });
    if (after === before) {
      notify('No hay cargos repetidos con el mismo salario y perfil.');
    } else {
      notify(`✓ ${before - after} fila(s) consolidada(s) por cargo y cantidad.`);
    }
  };

  return (
    <section className="card" id="personal" aria-labelledby="staff-title">
      <SectionTitle icon={<HardHat size={16} />} id="staff-title">
        Personal fijo en el proyecto
      </SectionTitle>
      <div className="sub">
        (Salario × factor prestacional + auxilio de transporte) ÷ 30 × días trabajados. Salario mínimo 2026
        $1.750.905 y auxilio $249.095. Marca "Extra/noche" para calcular horas extra y recargos (jornada 42
        h/semana, nocturna desde las 7:00 p.m., dominical 90%). Es una estimación para presupuestar: para
        nómina real valida con tu contador. Usa <b>Personal</b> para indicar cuántas personas tienen ese
        cargo y salario; no repitas filas.
      </div>
      {duplicateRows > 0 ? (
        <div className="alert info" style={{ marginTop: 8 }}>
          Hay {duplicateRows} fila(s) de personal repetidas. Usa <b>Consolidar cargos</b> para dejar un
          cargo por perfil con la cantidad de personas.
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cargo</th>
              <th className="col-xs">Personal</th>
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
                onRoleBlur={() => handleRoleBlur(m.id)}
                onRemove={() => edit((x) => void (x.staff = x.staff.filter((s) => s.id !== m.id)))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="staff-roles">
        {STAFF_ROLE_PRESETS.map((p) => (
          <option key={p.role} value={p.role} />
        ))}
      </datalist>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button
          type="button"
          className="small add-row"
          onClick={() => edit((x) => void x.staff.push(blankStaffMember()))}
        >
          + Agregar cargo
        </button>
        <button type="button" className="small" onClick={consolidateAll}>
          <Combine size={14} /> Consolidar cargos
        </button>
      </div>
      <div className="subtotal-line">
        Subtotal personal fijo: <b>{formatCop(totals.staff)}</b>
      </div>
    </section>
  );
}

function StaffRows({
  member: m,
  onEdit,
  onRoleBlur,
  onRemove,
}: {
  member: StaffMember;
  onEdit: (r: (m: StaffMember) => void) => void;
  onRoleBlur: () => void;
  onRemove: () => void;
}) {
  const qty = staffMemberQuantity(m);
  const [concept, setConcept] = useState<keyof OvertimeHours>('extraDay');
  const [hoursToLoad, setHoursToLoad] = useState(0);
  const info = OVERTIME_CONCEPTS.find((c) => c.key === concept) ?? OVERTIME_CONCEPTS[0]!;
  const valuePerHour = ordinaryHourlyRate(m) * info.multiplier;
  const loadedHours = m.overtime[concept] ?? 0;
  return (
    <>
      <tr>
        <td>
          <input
            className="cell"
            value={m.role}
            aria-label="Cargo"
            list="staff-roles"
            onChange={(e) => {
              const value = e.target.value;
              const preset = STAFF_ROLE_PRESETS.find(
                (p) => p.role.toLowerCase() === value.trim().toLowerCase(),
              );
              onEdit((x) => {
                x.role = value;
                if (preset) {
                  x.monthlySalary = preset.monthlySalary;
                  x.benefitsFactor = DEFAULT_BENEFITS_FACTOR;
                  x.transportAllowance = preset.transportAllowance;
                }
              });
            }}
            onBlur={onRoleBlur}
          />
        </td>
        <td>
          <NumberInput
            value={qty}
            ariaLabel="Número de personas"
            onChange={(n) => onEdit((x) => void (x.quantity = Math.max(1, Math.floor(n ?? 1))))}
          />
        </td>
        <td>
          <NumberInput
            value={m.monthlySalary}
            ariaLabel="Salario mensual"
            format={formatPesos}
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
        <td className="num-out">{formatCop(staffMemberTotal(m))}</td>
        <td>
          <button type="button" className="ghost-danger" aria-label="Eliminar cargo" onClick={onRemove}>
            ×
          </button>
        </td>
      </tr>
      {m.hasOvertime ? (
        <tr>
          <td colSpan={9} style={{ background: 'var(--steel-light)', padding: '10px 14px' }}>
            <div className="hint" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Horas extra / recargos de "{m.role || 'este cargo'}" · hora ordinaria{' '}
              {formatCop(ordinaryHourlyRate(m))}
            </div>
            <div
              style={{
                margin: '10px 0',
                padding: 10,
                background: 'var(--panel)',
                borderRadius: 10,
              }}
            >
              <div className="hint" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Cargar horas por concepto
              </div>
              <div className="filters" style={{ marginBottom: 0, alignItems: 'end' }}>
                <label className="field" style={{ flex: '1 1 340px', minWidth: 280 }}>
                  <span>Clasificación y concepto</span>
                  <select
                    className="cell"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value as keyof OvertimeHours)}
                  >
                    {OVERTIME_CONCEPTS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.group} · {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ width: 110 }}>
                  <span>Horas</span>
                  <NumberInput
                    value={hoursToLoad}
                    onChange={(n) => setHoursToLoad(Math.max(0, n ?? 0))}
                  />
                </label>
                <button
                  type="button"
                  className="small"
                  disabled={hoursToLoad <= 0}
                  onClick={() => {
                    if (hoursToLoad <= 0) return;
                    const h = hoursToLoad;
                    onEdit((x) => {
                      x.overtime[concept] = (x.overtime[concept] ?? 0) + h;
                      x.hasOvertime = true;
                    });
                    setHoursToLoad(0);
                  }}
                >
                  Cargar horas
                </button>
              </div>
              <div className="hint">
                {info.kind === 'extra'
                  ? 'Hora extra completa'
                  : 'Solo recargo; la hora base ya está en el salario'}
                : <b>{formatCop(valuePerHour)}</b> por persona · {info.group}. Ya cargadas:{' '}
                {loadedHours} h.
              </div>
              <div className="hint">
                Día de semana: lunes a sábado. Domingo o festivo: +90% (y +35% si es nocturna). El sábado
                no lleva el 90% salvo que sea festivo.
              </div>
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
              Costo extra {qty > 1 ? `del grupo (${qty} personas)` : 'del cargo'}:{' '}
              <b className="num-out">{formatCop(overtimeCost(m) * qty)}</b>
            </div>
            <div className="hint">
              Las horas se ingresan por persona; el total se multiplica por la cantidad. Extra nocturna =
              recargo único (ya incluye la nocturnidad). Tope legal: 2 horas extra por día y 12 por semana. El
              domingo/festivo habitual exige además un día de descanso compensatorio.
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
