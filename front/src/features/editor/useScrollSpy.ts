import { useEffect, useState } from 'react';

/**
 * Devuelve el id de la sección en la que está el usuario (la última cuyo inicio ya pasó bajo la
 * barra fija). Se calcula en cada scroll, así funciona aunque las secciones aparezcan después.
 */
export function useScrollSpy(ids: string[], offset = 120): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');

  useEffect(() => {
    const list = key.split('|');
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = list[0] ?? null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      // Al llegar al final de la página, la última sección queda activa.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = [...list].reverse().find((id) => document.getElementById(id)) ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key, offset]);

  return active;
}
