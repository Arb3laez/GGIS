import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { quoteDraftSchema } from '@ggis/domain';
import { ApiError } from '../../api/http';
import { keys, quotesApi } from '../../api/queries';
import { errorMessage, useToast } from '../../shared/feedback';
import { clearLocalDraft, useEditor } from './store';

const FIELD_LABELS: Record<string, string> = {
  'client.email': 'Correo del cliente',
  issueDate: 'Fecha de la oferta',
  validDays: 'Validez de la oferta',
  exchangeRate: 'TRM',
};

/** Guarda la cotización (crea o actualiza con control de versión) y sincroniza la caché. */
export function useSaveQuote() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (): Promise<string | null> => {
    const { quoteId, version, draft, markSaved } = useEditor.getState();
    const check = quoteDraftSchema.safeParse(draft);
    if (!check.success) {
      const issue = check.error.issues[0]!;
      const path = issue.path.join('.');
      notify(`Revisa "${FIELD_LABELS[path] ?? path}": ${issue.message}`, true);
      return null;
    }
    setSaving(true);
    try {
      const saved =
        quoteId && version ? await quotesApi.update(quoteId, version, draft) : await quotesApi.create(draft);
      markSaved(saved);
      clearLocalDraft();
      qc.setQueryData(keys.quote(saved.id), saved);
      void qc.invalidateQueries({ queryKey: keys.quotes, refetchType: 'inactive' });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: keys.catalog });
      if (!quoteId) navigate(`/quotes/${saved.id}`, { replace: true, preventScrollReset: true });
      notify(`✓ Guardada ${saved.number}`);
      return saved.id;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conflict') {
        notify(err.message, true);
      } else {
        notify(`No se pudo guardar: ${errorMessage(err)}`, true);
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [navigate, notify, qc]);

  return { save, saving };
}
