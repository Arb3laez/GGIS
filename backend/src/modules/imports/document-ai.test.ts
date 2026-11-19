import { describe, expect, it } from 'vitest';
import { AiExtractionError, linksFromModel, matchPayload, rowsFromModel } from './ai-extractor';
import { documentAiProvider } from './document-ai';

const cfg = (research?: string) => ({ research: { apiKey: research, model: 'gpt' } });

describe('documentAiProvider', () => {
  it('usa OpenAI con la llave de la investigación; sin llave queda sin IA', () => {
    expect(documentAiProvider(cfg('o'))).toBe('openai');
    expect(documentAiProvider(cfg())).toBeNull();
  });
});

describe('respuesta del modelo', () => {
  it('convierte los ítems y conserva referencia y grupo', () => {
    const rows = rowsFromModel({
      items: [
        {
          description: ' Base para detector estándar ',
          unit: '',
          quantity: 95,
          unitPrice: 10557.46,
          currency: 'COP',
          reference: 'KI-SB',
          group: 'TORRE SIERRA',
        },
        { description: '', unit: 'UN', quantity: 1, unitPrice: 5, currency: 'COP', reference: '', group: '' },
      ],
    });
    expect(rows).toEqual([
      {
        description: 'Base para detector estándar',
        unit: 'UN',
        quantity: 95,
        currency: 'COP',
        unitPrice: 10557.46,
        reference: 'KI-SB',
        group: 'TORRE SIERRA',
      },
    ]);
  });

  it('traduce los ids cortos a los ids reales y descarta los desconocidos', () => {
    const items = [
      { id: 'uuid-1', description: 'Sirena 15C', unit: 'Und', quantity: 55 },
      { id: 'uuid-2', description: 'Sirena 75C', unit: 'Und', quantity: 28 },
    ];
    const { text, keys } = matchPayload(items, [
      { description: 'Sirena estrobo', unit: 'UN', quantity: 83, currency: 'COP', unitPrice: 1 },
    ]);
    expect(JSON.parse(text).itemsCliente.map((i: { id: string }) => i.id)).toEqual(['I1', 'I2']);
    const links = linksFromModel(
      {
        links: [
          { row: 0, item: 'I1', kind: 'shared', factor: 1 },
          { row: 0, item: 'I2', kind: 'shared', factor: 0 },
          { row: 0, item: 'I9', kind: 'direct', factor: 1 },
        ],
      },
      items,
      keys,
    );
    expect(links).toEqual([
      { row: 0, itemId: 'uuid-1', kind: 'shared', factor: 1 },
      { row: 0, itemId: 'uuid-2', kind: 'shared', factor: 1 },
    ]);
  });

  it('rechaza respuestas con otro formato', () => {
    expect(() => rowsFromModel({ nada: true })).toThrow(AiExtractionError);
  });
});
