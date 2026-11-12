import { FileText, RotateCcw } from 'lucide-react';
import { SectionTitle } from '../../../shared/SectionTitle';
import { OFFER_TEXT_FIELDS, offerTextValue, templateContent } from '../../offer/proposal-content';
import { useDraft, useEdit } from '../store';

/**
 * Textos de la oferta que no salen de otros campos (títulos, introducciones, listas…). Vienen de la
 * plantilla de la unidad de negocio; lo que se cambie aquí, o directamente sobre la oferta con
 * "Editar textos", queda guardado en la cotización.
 */
export function OfferTextsSection() {
  const d = useDraft();
  const edit = useEdit();
  const template = templateContent(d);
  const pages = [...new Set(OFFER_TEXT_FIELDS.map((f) => f.page))];
  const changed = OFFER_TEXT_FIELDS.filter((f) => d.offerTexts?.[f.key]?.trim()).length;

  return (
    <section className="card" id="textos" aria-labelledby="offer-texts-title">
      <SectionTitle icon={<FileText size={16} />} id="offer-texts-title">
        Textos de la oferta
      </SectionTitle>
      <div className="sub">
        Vienen de la plantilla de la unidad de negocio. Cámbialos aquí o directamente sobre la oferta con
        «Editar textos»: los dos lados quedan iguales.
        {changed ? ` ${changed} texto${changed === 1 ? '' : 's'} cambiado${changed === 1 ? '' : 's'}.` : ''}
      </div>
      {pages.map((page) => (
        <details key={page} className="offer-texts-group">
          <summary>{page}</summary>
          {OFFER_TEXT_FIELDS.filter((f) => f.page === page).map((f) => {
            const own = d.offerTexts?.[f.key];
            const isExcludes = f.key === 'excludes';
            // "No incluye" sin lista propia muestra las Exclusiones del cotizador (de ahí sale en la oferta).
            const fallback = isExcludes && d.terms.exclusions.trim() ? '' : offerTextValue(template, f.key);
            const value = own ?? fallback;
            return (
              <div className="field" key={f.key}>
                <span>
                  {f.label}
                  {own !== undefined ? (
                    <button
                      type="button"
                      className="link-btn"
                      style={{ marginLeft: 8 }}
                      onClick={() => edit((x) => void delete x.offerTexts[f.key])}
                    >
                      <RotateCcw size={11} /> Usar plantilla
                    </button>
                  ) : null}
                </span>
                <textarea
                  rows={f.list ? 4 : 2}
                  value={value}
                  placeholder={
                    isExcludes ? 'Se usan tus «Exclusiones y comentarios» (una línea por punto)' : ''
                  }
                  aria-label={`${page} · ${f.label}`}
                  onChange={(e) =>
                    edit((x) => {
                      const v = e.target.value;
                      if (v === offerTextValue(template, f.key) || (isExcludes && !v.trim()))
                        delete x.offerTexts[f.key];
                      else x.offerTexts[f.key] = v;
                    })
                  }
                />
              </div>
            );
          })}
        </details>
      ))}
    </section>
  );
}
