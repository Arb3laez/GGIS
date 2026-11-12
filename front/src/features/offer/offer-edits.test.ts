import { describe, expect, it } from 'vitest';
import { applyEdits, diffEdits, parseFragment } from './offer-edits';

const offer = (price: string) =>
  parseFragment(`<section><h2>Detalle</h2>
    <table><tr><td><b>Equipo contra incendios PEERLESS</b><div>Bomba principal</div></td><td>UND</td><td>${price}</td></tr>
    <tr><td><b>Tablero</b></td><td>UND</td><td>$1.000</td></tr></table>
    <p>Validez de 30 días.</p></section>`);

describe('textos editados en la oferta', () => {
  it('guarda solo los bloques cambiados y los reaplica cuando cambia el precio', () => {
    const base = offer('$5.000.000');
    const edited = offer('$5.000.000');
    // El usuario agrega una nota bajo la descripción del equipo y cambia la validez.
    edited.querySelector('td div')!.innerHTML = 'Bomba principal<br>Nota: no incluye bomba jockey.';
    edited.querySelector('p')!.textContent = 'Validez de 15 días.';
    const edits = diffEdits(base, edited);
    expect(edits.map((e) => e.tag)).toEqual(['DIV', 'P']);

    // Cambia el precio en la cotización: la oferta nueva trae el precio nuevo y las notas.
    const next = offer('$6.200.000');
    expect(applyEdits(next, edits)).toEqual([]);
    expect(next.textContent).toContain('$6.200.000');
    expect(next.textContent).toContain('Nota: no incluye bomba jockey.');
    expect(next.querySelector('p')!.textContent).toBe('Validez de 15 días.');
  });

  it('avisa cuando un texto editado ya no existe en la oferta nueva', () => {
    const base = offer('$5.000.000');
    const edited = offer('$5.000.000');
    edited.querySelector('b')!.textContent = 'Equipo PEERLESS 250 GPM';
    const edits = diffEdits(base, edited);
    const next = parseFragment(
      String(base.innerHTML).replace('Equipo contra incendios PEERLESS', 'Otro equipo'),
    );
    expect(applyEdits(next, edits)).toHaveLength(1);
  });

  it('al convertir ofertas antiguas no revive precios viejos', () => {
    const current = offer('$6.200.000');
    const old = offer('$5.000.000');
    old.querySelector('p')!.textContent = 'Validez de 15 días.';
    const edits = diffEdits(current, old, { ignoreNumberChanges: true });
    expect(edits).toHaveLength(1);
    expect(edits[0]!.tag).toBe('P');
  });

  it('convierte ofertas antiguas aunque luego se haya agregado un ítem', () => {
    const old = offer('$5.000.000');
    old.querySelector('td div')!.innerHTML = 'Bomba principal<br>Nota: no incluye bomba jockey.';
    // Hoy la cotización tiene un ítem más (al inicio) y otro precio.
    const current = offer('$6.200.000');
    const extra = current.querySelector('tr')!.cloneNode(true) as HTMLElement;
    extra.querySelector('b')!.textContent = 'Sensor nuevo';
    extra.querySelector('div')!.textContent = 'Otro';
    current.querySelector('tbody, table')!.prepend(extra);
    const edits = diffEdits(current, old, { ignoreNumberChanges: true });
    expect(edits).toHaveLength(1);
    applyEdits(current, edits);
    expect(current.textContent).toContain('Nota: no incluye bomba jockey.');
    expect(current.textContent).toContain('Sensor nuevo');
    expect(current.textContent).toContain('$6.200.000');
  });

  it('quita código peligroso del contenido editado', () => {
    const base = offer('$1');
    const edited = offer('$1');
    edited.querySelector('p')!.innerHTML = 'Hola<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const [e] = diffEdits(base, edited);
    expect(e!.html).not.toMatch(/onerror|script/);
  });
});
