import type { ReactNode } from 'react';
import { Cctv, FireExtinguisher, Flame, KeyRound, Layers, MapPin, Sparkles, Tag } from 'lucide-react';
import { itemsFromTemplate, SOLUTION_TEMPLATES, SOLUTIONS, type Solution } from '@ggis/domain';
import { useConfirm } from '../../../shared/confirm';
import { SectionTitle } from '../../../shared/SectionTitle';

import { useDraft, useEdit } from '../store';

const ICONS: Record<Solution, ReactNode> = {
  cctv: <Cctv size={20} />,
  fire_detection: <Flame size={20} />,
  fire_suppression: <FireExtinguisher size={20} />,
  access_control: <KeyRound size={20} />,
  anti_theft: <Tag size={20} />,
  solt: <MapPin size={20} />,
  custom: <Sparkles size={20} />,
};

export function SolutionPicker() {
  const d = useDraft();
  const edit = useEdit();
  const confirm = useConfirm();
  const filled = d.items.filter((i) => i.description.trim()).length;

  return (
    <section className="card" id="solucion" aria-labelledby="solution-title">
      <SectionTitle icon={<Layers size={16} />} id="solution-title">
        ¿Qué solución necesita el cliente?
      </SectionTitle>
      <div className="sub">
        Elige una para cargar los ítems típicos — luego edítalos, agrega o quita lo que no aplique.
      </div>
      <div className="solutions">
        {SOLUTIONS.map((key) => (
          <button
            key={key}
            type="button"
            className={`sol-btn${d.solution === key ? ' active' : ''}`}
            aria-pressed={d.solution === key}
            onClick={async () => {
              if (
                filled > 0 &&
                !(await confirm({
                  title: `¿Cargar la plantilla de ${SOLUTION_TEMPLATES[key].label}?`,
                  message: `Se reemplazan los ${filled} ítem${filled === 1 ? '' : 's'} actuales por los típicos de esta solución. Los precios que ya pusiste se pierden.`,
                  confirmLabel: 'Reemplazar ítems',
                  cancelLabel: 'Conservar mis ítems',
                  tone: 'danger',
                }))
              )
                return;
              edit((x) => {
                x.solution = key;
                x.items = itemsFromTemplate(key);
              });
            }}
          >
            {ICONS[key]}
            {SOLUTION_TEMPLATES[key].label}
          </button>
        ))}
      </div>
    </section>
  );
}
