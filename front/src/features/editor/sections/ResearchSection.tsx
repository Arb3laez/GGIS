import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ExternalLink, Globe, ImagePlus, Map as MapIcon, MapPin, Search } from 'lucide-react';
import {
  BUSINESS_UNIT_LABELS,
  FACILITY_KIND_LABELS,
  FACILITY_KINDS,
  RESEARCH_IMAGE_SLOTS,
  SERVICE_TYPE_LABELS,
  type ClientResearch,
  type FacilityKind,
  type ResearchImageSlot,
} from '@ggis/domain';
import { keys, researchApi, useResearchCapabilities } from '../../../api/queries';
import { useConfirm } from '../../../shared/confirm';
import { errorMessage, useToast } from '../../../shared/feedback';
import { attachmentUrl, LibraryImage, offerImages, photoCredit } from '../../../shared/LibraryImage';
import { SectionTitle } from '../../../shared/SectionTitle';
import { SelectField, TextArea } from '../../../shared/inputs';
import { useDraft, useEdit, useEditor } from '../store';
import { useSaveQuote } from '../useSaveQuote';

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const mapsEmbed = (q: string) => `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
const entries = <K extends string>(r: Record<K, string>) => Object.entries(r) as Array<[K, string]>;

const SLOT_LABELS: Record<ResearchImageSlot, { title: string; hint: string }> = {
  need: { title: 'La necesidad', hint: 'Operación del cliente (página 01 de la oferta)' },
  solution: { title: 'La solución', hint: 'La solución instalada (página 02 de la oferta)' },
};

/**
 * Investigación comercial para la oferta: busca en la web a la empresa cliente (dirección, sedes,
 * dónde y qué es el proyecto según la unidad de negocio), la ubica en Google Maps, propone el
 * texto de la oferta y genera con IA las imágenes alusivas.
 */
export function ResearchSection() {
  const d = useDraft();
  const edit = useEdit();
  const quoteId = useEditor((s) => s.quoteId);
  const qc = useQueryClient();
  const notify = useToast();
  const confirm = useConfirm();
  const caps = useResearchCapabilities();
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState<ResearchImageSlot[]>([]);
  const [enriching, setEnriching] = useState(false);
  const { save } = useSaveQuote();
  const setResearchBusy = useEditor((s) => s.setResearchBusy);
  const r = d.research;
  const enabled = caps.data?.enabled !== false;
  const name = d.client.name.trim();
  const city = d.client.city.trim();
  // La dirección se ubica mejor en el mapa que la descripción del sitio del proyecto.
  const mapQueryOf = (x: ClientResearch | null) =>
    x?.address || x?.location || [name, city].filter(Boolean).join(', ');
  const mapQuery = mapQueryOf(r);
  const busy = running || enriching || generating.length > 0;
  const unitLine = [
    d.businessUnit ? BUSINESS_UNIT_LABELS[d.businessUnit] : '',
    d.serviceType ? SERVICE_TYPE_LABELS[d.serviceType] : '',
  ]
    .filter(Boolean)
    .join(' · ');

  /**
   * Ejecuta una acción de la investigación avisando que está en curso y, al terminar, guarda la
   * cotización: así las fotos, el mapa y las imágenes no se pierden si se abre la oferta.
   */
  async function tracked(action: () => Promise<void>) {
    setResearchBusy(true);
    try {
      await action();
    } finally {
      setResearchBusy(false);
    }
    const st = useEditor.getState();
    if (quoteId && st.quoteId === quoteId && st.dirty) await save();
  }

  async function run() {
    if (
      r &&
      !(await confirm({
        title: '¿Investigar de nuevo?',
        message: 'Se reemplaza la investigación actual, incluido el texto para la oferta si lo editaste.',
        confirmLabel: 'Investigar de nuevo',
        cancelLabel: 'Cancelar',
      }))
    )
      return;
    setRunning(true);
    try {
      const result = await researchApi.run({
        clientName: name,
        identification: d.client.identification,
        project: d.client.project,
        city,
        businessUnit: d.businessUnit,
        serviceType: d.serviceType,
        scope: d.items
          .map((it) => it.description.trim())
          .filter(Boolean)
          .slice(0, 15)
          .join('; ')
          .slice(0, 1_500),
      });
      edit((x) => void (x.research = result));
      setRunning(false);
      if (!quoteId) {
        notify('Investigación lista. Guarda la cotización para traer fotos, mapa e imágenes.');
        return;
      }
      // Fotos reales y mapa primero; la IA genera solo los espacios que quedaron sin foto.
      const next = await enrich(result);
      const missing = RESEARCH_IMAGE_SLOTS.filter((slot) => !next.images[slot]);
      if (missing.length) {
        notify('Investigación lista. Generando las imágenes alusivas que faltan…');
        await generate(missing, next);
      } else {
        notify('Investigación lista con fotos reales y mapa. Guarda la cotización.');
      }
      if (r) void removeResearchFiles(r, next);
    } catch (err) {
      notify(errorMessage(err), true);
    } finally {
      setRunning(false);
    }
  }

  /** Borra los adjuntos de una investigación anterior que la nueva ya no usa. */
  async function removeResearchFiles(old: ClientResearch, current: ClientResearch) {
    const keep = new Set(
      [
        current.images.need,
        current.images.solution,
        current.mapImage,
        ...current.photos.map((p) => p.attachmentId),
      ].filter(Boolean),
    );
    const ids = [
      old.images.need,
      old.images.solution,
      old.mapImage,
      ...old.photos.map((p) => p.attachmentId),
    ];
    await Promise.all(
      ids
        .filter((id): id is string => !!id && !keep.has(id))
        .map((id) => researchApi.removeImage(id).catch(() => undefined)),
    );
    if (quoteId) void qc.invalidateQueries({ queryKey: keys.attachments(quoteId) });
  }

  /**
   * Trae fotos reales de las páginas fuente y el mapa de Google Maps. La primera foto real queda en
   * "La necesidad" si ese espacio estaba vacío.
   */
  async function enrich(
    base: ClientResearch,
    what: { photos?: boolean; map?: boolean } = { photos: true, map: true },
  ) {
    if (!quoteId) return base;
    const next: ClientResearch = { ...base, images: { ...base.images } };
    setEnriching(true);
    try {
      await Promise.all([
        what.photos && base.sources.length
          ? researchApi
              .photos({ quoteId, pages: base.sources.map((s) => ({ url: s.url, title: s.title })) })
              .then((photos) => void (next.photos = photos))
              .catch((err) => notify(`Fotos de la web: ${errorMessage(err)}`, true))
          : null,
        what.map && caps.data?.maps && mapQueryOf(base)
          ? researchApi
              .map({ quoteId, query: mapQueryOf(base) })
              .then((m) => void (next.mapImage = m.id))
              .catch((err) => notify(errorMessage(err), true))
          : null,
      ]);
      if (!next.images.need && next.photos[0]) next.images.need = next.photos[0].attachmentId;
      edit((x) => {
        if (!x.research) return;
        x.research.photos = next.photos;
        x.research.mapImage = next.mapImage;
        if (!x.research.images.need) x.research.images.need = next.images.need;
      });
      void qc.invalidateQueries({ queryKey: keys.attachments(quoteId) });
      return next;
    } finally {
      setEnriching(false);
    }
  }

  async function refreshPhotos() {
    if (!r) return;
    const old = r;
    const next = await enrich(r, { photos: true });
    notify(
      next.photos.length
        ? `${next.photos.length} fotos encontradas.`
        : 'No se encontraron fotos en las páginas fuente.',
      !next.photos.length,
    );
    void removeResearchFiles({ ...old, images: { need: null, solution: null }, mapImage: null }, next);
    // Los espacios que siguen sin imagen (normalmente "La solución") se generan con IA.
    const missing = RESEARCH_IMAGE_SLOTS.filter((slot) => !next.images[slot]);
    if (missing.length && enabled) await generate(missing, next);
  }

  /**
   * Descripción final de la imagen. "La solución" siempre lleva el trabajo de «Proyecto / sucursal»
   * para que muestre lo que se le va a hacer al cliente y no una imagen genérica del servicio.
   */
  function imagePrompt(research: ClientResearch, slot: ResearchImageSlot): string {
    const base = research.imagePrompts[slot].trim();
    const project = d.client.project.trim();
    if (slot !== 'solution' || !project || base.toLowerCase().includes(project.slice(0, 25).toLowerCase()))
      return base.slice(0, 1_000);
    return `Debe mostrar este trabajo: ${project}. ${base}`.slice(0, 1_000);
  }

  async function refreshMap() {
    if (!r) return;
    const old = r.mapImage;
    const next = await enrich(r, { map: true });
    if (old && old !== next.mapImage) void researchApi.removeImage(old).catch(() => undefined);
  }

  async function generate(slots: ResearchImageSlot[], research: ClientResearch | null = r) {
    if (!research || !quoteId) return;
    const todo = slots.filter((s) => research.imagePrompts[s].trim().length >= 10);
    if (!todo.length) {
      notify('Escribe una descripción de la imagen (mínimo 10 caracteres).', true);
      return;
    }
    setGenerating(todo);
    try {
      await Promise.all(
        todo.map(async (slot) => {
          const previous = research.images[slot];
          const meta = await researchApi.image({ quoteId, slot, prompt: imagePrompt(research, slot) });
          edit((x) => void (x.research && (x.research.images[slot] = meta.id)));
          // Solo se borra la anterior si era generada con IA (las fotos reales quedan en la galería).
          if (previous && !research.photos.some((p) => p.attachmentId === previous))
            await researchApi.removeImage(previous).catch(() => undefined);
        }),
      );
      void qc.invalidateQueries({ queryKey: keys.attachments(quoteId) });
      notify('Imágenes listas. Guarda la cotización para usarlas en la oferta.');
    } catch (err) {
      notify(errorMessage(err), true);
    } finally {
      setGenerating([]);
    }
  }

  return (
    <section className="card" id="investigacion" aria-labelledby="research-title">
      <SectionTitle
        icon={<Globe size={16} />}
        id="research-title"
        right={
          <button
            type="button"
            className="primary small"
            disabled={!name || busy || !enabled}
            title={
              !enabled
                ? 'La investigación con IA no está configurada en el servidor'
                : !name
                  ? 'Escribe primero el nombre del cliente'
                  : undefined
            }
            onClick={() => void tracked(run)}
          >
            <Search size={14} />{' '}
            {running
              ? 'Investigando… (puede tardar 1–2 min)'
              : enriching
                ? 'Buscando fotos y mapa…'
                : generating.length
                  ? 'Generando imágenes…'
                  : r
                    ? 'Investigar de nuevo'
                    : 'Investigar en la web'}
          </button>
        }
      >
        Investigación comercial para la oferta
      </SectionTitle>
      <div className="sub">
        Busca en la web la dirección del cliente, sus sedes, dónde se hará el proyecto y qué se le va a hacer
        según la unidad de negocio{unitLine ? ` (${unitLine})` : ''}. Al terminar trae fotos reales de la web
        (con su crédito), el mapa de Google Maps y, si falta alguna imagen, la genera con IA. Usa solo
        información pública; revisa el resultado antes de enviarlo.
      </div>

      {name ? (
        <div className="filters" style={{ marginTop: 8 }}>
          <a className="btn small" href={google(`${name} ${city}`.trim())} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Buscar empresa en Google
          </a>
          {d.client.project ? (
            <a
              className="btn small"
              href={google(`${name} ${d.client.project}`)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> Buscar proyecto en Google
            </a>
          ) : null}
          <a className="btn small" href={mapsSearch(mapQuery)} target="_blank" rel="noreferrer">
            <MapPin size={13} /> Ver ubicación en Google Maps
          </a>
        </div>
      ) : (
        <div className="hint" style={{ marginTop: 8 }}>
          Escribe el nombre del cliente en "Cliente y proyecto" para investigarlo.
        </div>
      )}

      {!enabled ? (
        <div className="alert info">
          La búsqueda automática con IA no está configurada en el servidor (falta la llave de la API). Puedes
          usar los botones de Google mientras tanto.
        </div>
      ) : null}

      {r ? (
        <>
          <div className="research-facts">
            <div>
              <div className="k">Dirección del cliente</div>
              <div className="v">{r.address || r.location || 'No se encontró'}</div>
            </div>
            <div>
              <div className="k">Sitio del proyecto</div>
              <div className="v">{r.projectSite || 'No se encontró'}</div>
            </div>
            <div>
              <div className="k">Unidad de negocio</div>
              <div className="v">{unitLine || 'Sin definir'}</div>
            </div>
            <div>
              <div className="k">Tipo de instalación</div>
              <div className="v">{FACILITY_KIND_LABELS[r.imageTheme]}</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 12, alignItems: 'start' }}>
            <div>
              {r.project ? (
                <>
                  <div className="section-title">El proyecto</div>
                  <p style={{ margin: '4px 0', lineHeight: 1.55 }}>{r.project}</p>
                </>
              ) : null}
              <div className="section-title">La empresa</div>
              <div className="hint">
                Investigado el {r.researchedOn}
                {r.sector ? ` · ${r.sector}` : ''}
              </div>
              {r.summary ? <p style={{ margin: '6px 0', lineHeight: 1.55 }}>{r.summary}</p> : null}
              {r.risks.length ? (
                <>
                  <div className="section-title">
                    Riesgos{d.businessUnit ? ` · ${BUSINESS_UNIT_LABELS[d.businessUnit]}` : ''}
                  </div>
                  <ul style={{ margin: '4px 0', paddingLeft: 18, lineHeight: 1.6 }}>
                    {r.risks.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {r.facilities.length ? (
                <>
                  <div className="section-title">Sedes e instalaciones</div>
                  <ul style={{ margin: '4px 0', paddingLeft: 18, lineHeight: 1.6 }}>
                    {r.facilities.map((f, i) => {
                      const q = [f.name, f.address, f.city].filter(Boolean).join(', ');
                      return (
                        <li key={`${f.name}-${i}`}>
                          <b>{f.name || 'Sede'}</b> · {FACILITY_KIND_LABELS[f.kind]}
                          {f.address || f.city
                            ? ` · ${[f.address, f.city].filter(Boolean).join(', ')}`
                            : ''}{' '}
                          <a href={mapsSearch(`${name} ${q}`)} target="_blank" rel="noreferrer">
                            ver en mapa
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              {r.sources.length ? (
                <details style={{ marginTop: 8 }}>
                  <summary className="hint" style={{ cursor: 'pointer' }}>
                    Fuentes consultadas ({r.sources.length})
                  </summary>
                  <ul style={{ margin: '4px 0', paddingLeft: 18, lineHeight: 1.6 }}>
                    {r.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>

            <div>
              {r.mapImage ? (
                <>
                  <img className="research-image" src={attachmentUrl(r.mapImage)} alt="Mapa de Google Maps" />
                  <div className="hint">Así sale el mapa en la oferta · Google Maps</div>
                </>
              ) : mapQuery ? (
                <iframe
                  title="Ubicación del cliente en Google Maps"
                  src={mapsEmbed(mapQuery)}
                  style={{ width: '100%', height: 260, border: 0, borderRadius: 'var(--radius-md)' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : null}
              {caps.data?.maps ? (
                <button
                  type="button"
                  className="small"
                  style={{ marginTop: 6 }}
                  disabled={!quoteId || busy || !mapQuery}
                  title={!quoteId ? 'Guarda la cotización para traer el mapa' : `Ubica: ${mapQuery}`}
                  onClick={() => void tracked(refreshMap)}
                >
                  <MapIcon size={13} />{' '}
                  {r.mapImage ? 'Actualizar mapa de la oferta' : 'Poner mapa en la oferta'}
                </button>
              ) : (
                <div className="hint" style={{ marginTop: 6 }}>
                  Para que el mapa salga en la oferta falta la llave de Google Maps en el servidor.
                </div>
              )}
            </div>
          </div>

          <SectionTitle
            icon={<Camera size={16} />}
            right={
              <button
                type="button"
                className="small"
                disabled={!quoteId || busy || !r.sources.length}
                title={!quoteId ? 'Guarda la cotización para traer las fotos' : undefined}
                onClick={() => void tracked(refreshPhotos)}
              >
                <Camera size={14} /> {r.photos.length ? 'Buscar fotos de nuevo' : 'Buscar fotos en la web'}
              </button>
            }
          >
            Fotos reales de las instalaciones
          </SectionTitle>
          <div className="hint">
            Tomadas de las páginas que encontró la investigación; la oferta muestra el crédito de cada foto.
            Estas fotos tienen derechos de su autor: úsalas solo si G&G tiene permiso o el cliente las
            aprueba.
          </div>
          {r.photos.length ? (
            <div className="research-photos">
              {r.photos.map((p) => (
                <figure key={p.attachmentId}>
                  <img src={attachmentUrl(p.attachmentId)} alt={`Foto de ${p.credit}`} loading="lazy" />
                  <figcaption>
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer" title={p.sourceTitle}>
                      Foto: {p.credit}
                    </a>
                    <span>
                      {RESEARCH_IMAGE_SLOTS.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          className={r.images[slot] === p.attachmentId ? 'small primary' : 'small'}
                          onClick={() =>
                            edit((x) => void (x.research && (x.research.images[slot] = p.attachmentId)))
                          }
                        >
                          {SLOT_LABELS[slot].title}
                        </button>
                      ))}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="hint" style={{ marginTop: 6 }}>
              {enriching ? 'Buscando fotos…' : 'Aún no hay fotos reales.'}
            </div>
          )}

          <SectionTitle
            icon={<ImagePlus size={16} />}
            right={
              <button
                type="button"
                className="small"
                disabled={!quoteId || !enabled || busy}
                title={!quoteId ? 'Guarda la cotización para generar las imágenes' : undefined}
                onClick={() => void tracked(() => generate([...RESEARCH_IMAGE_SLOTS]))}
              >
                <ImagePlus size={14} />{' '}
                {generating.length ? 'Generando… (hasta 1 min)' : 'Generar las dos imágenes con IA'}
              </button>
            }
          >
            Imágenes alusivas para la oferta
          </SectionTitle>
          {!quoteId ? (
            <div className="hint">Guarda la cotización para poder generar las imágenes.</div>
          ) : null}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            {RESEARCH_IMAGE_SLOTS.map((slot) => (
              <div key={slot}>
                <div className="section-title">{SLOT_LABELS[slot].title}</div>
                <LibraryImage
                  candidates={offerImages(r, d.businessUnit, slot)}
                  alt={SLOT_LABELS[slot].hint}
                  className="research-image"
                />
                <div className="hint" style={{ marginBottom: 6 }}>
                  {SLOT_LABELS[slot].hint} ·{' '}
                  {photoCredit(r, slot)
                    ? `foto real · ${photoCredit(r, slot)}`
                    : r.images[slot]
                      ? 'generada con IA'
                      : 'imagen de la biblioteca G&G (aún sin imagen del proyecto: pulsa «Generar con IA»)'}
                </div>
                <TextArea
                  label="Descripción de la imagen (la IA la usa para generarla)"
                  value={r.imagePrompts[slot]}
                  rows={3}
                  onChange={(v) => edit((x) => void (x.research && (x.research.imagePrompts[slot] = v)))}
                />
                <div className="filters" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="small"
                    disabled={!quoteId || !enabled || busy}
                    onClick={() => void tracked(() => generate([slot]))}
                  >
                    <ImagePlus size={13} />{' '}
                    {generating.includes(slot)
                      ? 'Generando…'
                      : r.images[slot] && !photoCredit(r, slot)
                        ? 'Generar otra'
                        : 'Generar con IA'}
                  </button>
                  {r.images[slot] ? (
                    <button
                      type="button"
                      className="small"
                      onClick={() => edit((x) => void (x.research && (x.research.images[slot] = null)))}
                    >
                      Usar la biblioteca G&G
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <SelectField<FacilityKind>
            label="Tipo de instalación (imagen de la biblioteca G&G si no se genera con IA)"
            value={r.imageTheme}
            options={entries(FACILITY_KIND_LABELS).filter(([k]) => FACILITY_KINDS.includes(k))}
            onChange={(v) => v && edit((x) => void (x.research && (x.research.imageTheme = v)))}
          />

          <TextArea
            label="Texto para la oferta (sección «La oportunidad»)"
            value={r.proposalText}
            rows={3}
            onChange={(v) => edit((x) => void (x.research && (x.research.proposalText = v)))}
          />
        </>
      ) : null}
    </section>
  );
}
