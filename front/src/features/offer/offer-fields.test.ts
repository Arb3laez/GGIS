import { describe, expect, it } from 'vitest';
import { blankItem, computeQuote, createEmptyDraft } from '@ggis/domain';
import { parseFragment } from './offer-edits';
import { applyFieldChanges, elementText, fieldChanges, parseNumber } from './offer-fields';
import { templateContent } from './proposal-content';

const doc = (desc: string, price: string, scope: string) =>
  parseFragment(`<section>
    <h1 data-field="text:needTitle">Un sistema de detección</h1>
    <table><tr>
      <td><b data-field="item:i1:description">${desc}</b><span data-field="item:i1:notes">Detección temprana</span></td>
      <td><span data-field="item:i1:quantity">2</span><small data-field="item:i1:unit">UND</small></td>
      <td data-field="item:i1:salePrice">${price}</td>
      <td contenteditable="false">$0</td>
    </tr></table>
    <p data-field="terms:scope">${scope}</p>
    <ul data-field="text:includes"><li>Uno</li><li>Dos</li></ul>
  </section>`);

describe('cambios de la oferta que vuelven al cotizador', () => {
  it('lee números en formato colombiano', () => {
    expect(parseNumber('$1.234.567')).toBe(1234567);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber('abc')).toBeNull();
  });

  it('respeta los saltos de línea y las viñetas', () => {
    expect(elementText(parseFragment('Hola<br>mundo'))).toBe('Hola\nmundo');
    expect(elementText(parseFragment('<ul><li>Uno</li><li>Dos</li></ul>'))).toBe('Uno\nDos');
  });

  it('actualiza ítems, precios, condiciones y textos en la cotización', () => {
    const draft = createEmptyDraft(new Date('2026-11-01'));
    draft.items = [{ ...blankItem('Bomba PEERLESS', 'UND'), id: 'i1', quantity: 2 }];
    draft.terms.scope = 'Suministro';
    const base = doc('Bomba PEERLESS', '$5.000.000', 'Suministro');
    const edited = doc(
      'Bomba PEERLESS 250 GPM<br>Nota: no incluye bomba jockey.',
      '$6.200.000',
      'Suministro e instalación',
    );
    edited.querySelector('[data-field="item:i1:quantity"]')!.textContent = '3';
    edited.querySelector('[data-field="text:includes"]')!.innerHTML = '<li>Uno</li><li>Dos</li><li>Tres</li>';

    const changes = fieldChanges(base, edited);
    const r = applyFieldChanges(draft, changes, templateContent(draft as never));
    const item = draft.items[0]!;
    expect(item.description).toBe('Bomba PEERLESS 250 GPM');
    expect(item.notes).toBe('Nota: no incluye bomba jockey.');
    expect(item.quantity).toBe(3);
    expect(item.salePriceOverride).toBe(6_200_000);
    expect(draft.terms.scope).toBe('Suministro e instalación');
    expect(draft.offerTexts.includes).toBe('Uno\nDos\nTres');
    expect(r.errors).toEqual([]);
  });

  it('avisa si un precio no se entiende y no lo cambia', () => {
    const draft = createEmptyDraft(new Date('2026-11-01'));
    draft.items = [{ ...blankItem('Bomba', 'UND'), id: 'i1' }];
    const r = applyFieldChanges(
      draft,
      [['item:i1:salePrice', 'a convenir']],
      templateContent(draft as never),
    );
    expect(r.errors).toHaveLength(1);
    expect(draft.items[0]!.salePriceOverride).toBeNull();
  });
});

describe('precios editados sobre la oferta', () => {
  const twoItems = () => {
    const draft = createEmptyDraft(new Date('2026-11-01'));
    draft.items = [
      { ...blankItem('Bomba', 'UND'), id: 'a', quantity: 1, unitPrice: 1_000_000 },
      { ...blankItem('Tablero', 'UND'), id: 'b', quantity: 2, unitPrice: 200_000 },
    ];
    return draft;
  };

  it('al subir el precio de un ítem, el total sube y el otro ítem conserva su precio', () => {
    const draft = twoItems();
    const before = computeQuote(draft);
    const oldA = before.items[0]!.saleUnitPrice;
    const oldB = before.items[1]!.saleUnitPrice;
    applyFieldChanges(draft, [['item:a:salePrice', String(oldA + 500_000)]], templateContent(draft as never));
    const after = computeQuote(draft);
    expect(after.items[0]!.saleUnitPrice).toBe(oldA + 500_000);
    expect(Math.abs(after.items[1]!.saleUnitPrice - oldB)).toBeLessThanOrEqual(2);
    expect(after.totals.total).toBeGreaterThan(before.totals.total);
  });

  it('al escribir el total, el margen se ajusta para llegar a ese valor', () => {
    const draft = twoItems();
    const wanted = Math.round(computeQuote(draft).totals.total * 1.1);
    const r = applyFieldChanges(
      draft,
      [['pricing:total', `$${wanted.toLocaleString('es-CO')}`]],
      templateContent(draft as never),
    );
    expect(r.errors).toEqual([]);
    expect(Math.abs(computeQuote(draft).totals.total - wanted)).toBeLessThan(50);
    expect(r.updated[0]).toMatch(/Margen ajustado/);
  });

  it('no deja un total por debajo del costo', () => {
    const draft = twoItems();
    const margin = draft.pricing.marginPct;
    const r = applyFieldChanges(draft, [['pricing:total', '$1.000']], templateContent(draft as never));
    expect(r.errors[0]).toMatch(/por debajo del costo/);
    expect(draft.pricing.marginPct).toBe(margin);
  });
});
