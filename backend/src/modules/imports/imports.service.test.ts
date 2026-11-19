import { describe, expect, it, vi } from 'vitest';
import type { ImportedRow, MatchTargetItem } from '@ggis/domain';
import { createLogger } from '../../lib/logger';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { AiExtractor } from './ai-extractor';
import { ImportsService } from './imports.service';

/** Datos inventados. */
const items: MatchTargetItem[] = [
  { id: 'a', clientRef: '1', description: 'Detector de humo fotoeléctrico', unit: 'Und', quantity: 10 },
  { id: 'b', clientRef: '2', description: 'Estación manual', unit: 'Und', quantity: 2 },
];
const row = (description: string, quantity: number, unitPrice: number): ImportedRow => ({
  description,
  unit: 'UN',
  quantity,
  currency: 'COP',
  unitPrice,
});

function service(match: AiExtractor['match']) {
  const ai: AiExtractor = { enabled: true, extract: vi.fn(), match };
  return new ImportsService(ai, {} as AttachmentsService, createLogger('silent', false));
}

describe('ImportsService.matchPrices', () => {
  it('si las reglas relacionan todas las líneas, no llama a la IA', async () => {
    const match = vi.fn();
    const res = await service(match).matchPrices(items, [row('Detector de humo óptico', 10, 90000)]);
    expect(match).not.toHaveBeenCalled();
    expect(res.method).toBe('rules');
    // El ítem 2 no está en el documento: queda sin precio (no se inventa nada).
    expect(res.items.find((i) => i.itemId === 'b')!.status).toBe('none');
  });

  it('con líneas sueltas prueba la IA y se queda con el mejor resultado', async () => {
    const match = vi.fn().mockResolvedValue([{ row: 0, itemId: 'b', kind: 'direct', factor: 1 }]);
    const res = await service(match).matchPrices(items, [
      row('Pulsador de emergencia doble acción', 2, 120000),
    ]);
    expect(match).toHaveBeenCalledOnce();
    expect(res.method).toBe('ai');
    expect(res.items.find((i) => i.itemId === 'b')!.unitPrice).toBe(120000);
  });
});
