import { useEffect, useState } from 'react';
import type { BusinessUnit, ClientResearch, FacilityKind, ResearchImageSlot } from '@ggis/domain';

/**
 * Biblioteca de imágenes G&G (front/public/library). Para una unidad de negocio y un tipo de
 * instalación se busca, en orden:
 *   1. /library/<unidad>-<instalación>.jpg   (ej. cctv-retail.jpg)
 *   2. /library/<instalación>.jpg            (ej. retail.jpg)
 *   3. /library/<unidad>.jpg                 (ej. cctv.jpg)
 *   4. las imágenes base de la oferta
 * Así basta con copiar fotos con esos nombres para que aparezcan, sin tocar código.
 */
export function libraryImages(
  unit: BusinessUnit | null,
  kind: FacilityKind | null,
  slot: 'need' | 'architecture' = 'need',
): string[] {
  const list: string[] = [];
  if (unit && kind) list.push(`/library/${unit}-${kind}.jpg`);
  if (kind) list.push(`/library/${kind}.jpg`);
  if (unit) list.push(`/library/${unit}.jpg`);
  if (slot === 'architecture') list.push(unit === 'cctv' ? '/offer/control-room.jpg' : '/offer/cover.jpg');
  else list.push(unit === 'cctv' ? '/offer/camera.jpg' : '/offer/warehouse.jpg');
  return list;
}

/** Dirección del archivo de un adjunto (las imágenes generadas con IA se guardan como adjuntos). */
export const attachmentUrl = (id: string) => `/api/attachments/${id}/file`;

/**
 * Imagen de la oferta para un espacio: primero la generada con IA en la investigación (si hay),
 * luego la biblioteca G&G.
 */
export function offerImages(
  research: ClientResearch | null,
  unit: BusinessUnit | null,
  slot: ResearchImageSlot,
): string[] {
  const generated = research?.images[slot];
  const library =
    slot === 'need'
      ? libraryImages(unit, research?.imageTheme ?? null, 'need')
      : libraryImages(unit, null, 'architecture');
  return generated ? [attachmentUrl(generated), ...library] : library;
}

/** Crédito de la foto real (de la web) puesta en un espacio de la oferta; '' si no es foto real. */
export function photoCredit(research: ClientResearch | null, slot: ResearchImageSlot): string {
  const id = research?.images[slot];
  return (id && research?.photos.find((p) => p.attachmentId === id)?.credit) || '';
}

/** Imagen que prueba cada candidata en orden hasta encontrar una que exista. */
export function LibraryImage({
  candidates,
  alt,
  className,
}: {
  candidates: string[];
  alt: string;
  className?: string;
}) {
  const key = candidates.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]);
  const src = candidates[Math.min(index, candidates.length - 1)];
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setIndex((i) => (i < candidates.length - 1 ? i + 1 : i))}
    />
  );
}
