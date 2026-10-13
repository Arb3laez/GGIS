import { useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { http } from '../../../api/http';
import { SectionTitle } from '../../../shared/SectionTitle';
import { keys, useAttachments } from '../../../api/queries';
import { errorMessage, useToast } from '../../../shared/feedback';
import { useEditor } from '../store';

export function AttachmentsSection() {
  const quoteId = useEditor((s) => s.quoteId);
  const { data } = useAttachments(quoteId);
  const qc = useQueryClient();
  const notify = useToast();
  if (!quoteId || !data?.length) return null;

  return (
    <section className="card" aria-labelledby="att-title">
      <SectionTitle icon={<Paperclip size={16} />} id="att-title">
        Documentos adjuntos
      </SectionTitle>
      <div className="list">
        {data.map((a) => (
          <div key={a.id} className="list-item">
            <div>
              <b>{a.fileName}</b>{' '}
              <span className="meta">
                {a.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'} · {(a.sizeBytes / 1024).toFixed(0)} KB
              </span>
            </div>
            <div className="actions">
              <a
                className="btn small"
                href={`/api/attachments/${a.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver
              </a>
              <button
                type="button"
                className="ghost-danger"
                aria-label={`Eliminar ${a.fileName}`}
                onClick={async () => {
                  if (!confirm(`¿Eliminar el adjunto "${a.fileName}"?`)) return;
                  try {
                    await http.delete(`/api/attachments/${a.id}`);
                    void qc.invalidateQueries({ queryKey: keys.attachments(quoteId) });
                  } catch (err) {
                    notify(errorMessage(err), true);
                  }
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
