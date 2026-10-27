import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  computeQuote,
  createEmptyDraft,
  normalizeRetiredBidFields,
  quoteDraftSchema,
  type Quote,
  type QuoteDraft,
} from '@ggis/domain';

/**
 * Estado del editor: la cotización que se está editando (borrador) y su identidad en el servidor.
 * Todos los cálculos se derivan del borrador con el motor del dominio (no se guardan totales aquí).
 */
interface EditorState {
  quoteId: string | null;
  number: string | null;
  version: number | null;
  draft: QuoteDraft;
  dirty: boolean;
  /** Reemplaza el borrador por una cotización del servidor. */
  load: (q: Quote) => void;
  /** Empieza una cotización nueva (o restaura un borrador local). */
  reset: (draft?: QuoteDraft) => void;
  /** Aplica cambios al borrador (con immer: se puede "mutar" el draft). */
  edit: (recipe: (d: QuoteDraft) => void) => void;
  markSaved: (q: Quote) => void;
  /** true mientras la investigación trae fotos, mapa o genera imágenes (no se debe salir aún). */
  researchBusy: boolean;
  setResearchBusy: (busy: boolean) => void;
}

export function quoteToDraft(q: Quote): QuoteDraft {
  const { id: _id, number: _n, version: _v, createdAt: _c, updatedAt: _u, ...draft } = q;
  return draft;
}

export const useEditor = create<EditorState>()(
  immer((set) => ({
    quoteId: null,
    number: null,
    version: null,
    draft: createEmptyDraft(),
    dirty: false,
    researchBusy: false,
    setResearchBusy: (busy) =>
      set((s) => {
        s.researchBusy = busy;
      }),
    load: (q) =>
      set((s) => {
        s.quoteId = q.id;
        s.number = q.number;
        s.version = q.version;
        s.draft = quoteToDraft(q);
        s.dirty = false;
      }),
    reset: (draft) =>
      set((s) => {
        s.quoteId = null;
        s.number = null;
        s.version = null;
        s.draft = draft ?? createEmptyDraft();
        s.dirty = !!draft;
      }),
    edit: (recipe) =>
      set((s) => {
        recipe(s.draft as QuoteDraft);
        s.dirty = true;
      }),
    markSaved: (q) =>
      set((s) => {
        s.quoteId = q.id;
        s.number = q.number;
        s.version = q.version;
        s.dirty = false;
      }),
  })),
);

export const useDraft = () => useEditor((s) => s.draft);
export const useEdit = () => useEditor((s) => s.edit);

/** Desglose de precios en vivo (se recalcula solo cuando cambia el borrador). */
export function useBreakdown() {
  const draft = useDraft();
  return useMemo(() => computeQuote(draft), [draft]);
}

// ---------- Borrador local (comodidad por navegador, no es el almacenamiento real) ----------
const LOCAL_KEY = 'ggis-editor-draft';

interface LocalDraft {
  quoteId: string | null;
  savedAt: string;
  draft: QuoteDraft;
}

export function saveLocalDraft(quoteId: string | null, draft: QuoteDraft): void {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ quoteId, savedAt: new Date().toISOString(), draft } satisfies LocalDraft),
    );
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function readLocalDraft(): LocalDraft | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    const draft = quoteDraftSchema.safeParse(normalizeRetiredBidFields(parsed.draft));
    return draft.success ? { ...parsed, draft: draft.data } : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignorar */
  }
}
