import { describe, expect, it } from 'vitest';
import { paginateTerms } from './ProposalDocument';

describe('páginas de condiciones de la oferta', () => {
  it('textos cortos caben en una página', () => {
    const pages = paginateTerms([
      { title: 'Garantía', text: 'Un (1) año por defectos de fabricación.' },
      { title: 'Exclusiones y comentarios', text: 'No incluye obras civiles.' },
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.map((b) => b.title)).toEqual(['Garantía', 'Exclusiones y comentarios']);
  });

  it('un texto largo sigue en otra página sin perder contenido', () => {
    const long = Array.from({ length: 120 }, (_, i) => `Condición número ${i + 1} de la oferta. `).join('');
    const pages = paginateTerms([{ title: 'Condiciones generales', text: long }]);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[1]![0]!.title).toBe('Condiciones generales (continuación)');
    const joined = pages
      .flat()
      .map((b) => b.text)
      .join(' ');
    expect(joined).toContain('Condición número 1 de la oferta.');
    expect(joined).toContain('Condición número 120 de la oferta.');
  });
});
