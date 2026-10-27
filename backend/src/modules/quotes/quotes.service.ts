import { randomUUID } from 'node:crypto';
import {
  actualCost,
  computeQuote,
  duplicateDraft,
  todayIso,
  type Quote,
  type QuoteDraft,
  type QuoteSummary,
  type StatusChange,
} from '@ggis/domain';
import { transaction, type Database } from '../../db/database';
import { conflict, notFound } from '../../lib/errors';
import type { CatalogService } from '../catalog/catalog.service';
import { QuotesRepository, type QuoteListFilter, type QuoteRecord } from './quotes.repository';

/**
 * Casos de uso de cotizaciones. El servidor recalcula los totales con el mismo motor de la web,
 * así el listado y los indicadores nunca dependen de números enviados por el navegador.
 */
export class QuotesService {
  private readonly repo: QuotesRepository;

  constructor(
    private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.repo = new QuotesRepository(db);
  }

  list(filter?: QuoteListFilter): QuoteSummary[] {
    return this.repo.list(filter);
  }

  get(id: string): Quote {
    const r = this.repo.findById(id);
    if (!r) throw notFound('La cotización');
    return toQuote(r);
  }

  create(draft: QuoteDraft, opts: { number?: string } = {}): Quote {
    const ts = this.now().toISOString();
    const quote = transaction(this.db, () => {
      let number = opts.number;
      if (number && this.repo.numberExists(number)) number = undefined;
      if (number) {
        const n = /^OT-(\d+)$/.exec(number);
        if (n) this.repo.bumpCounterTo(Number(n[1]));
      }
      const record: QuoteRecord = {
        id: randomUUID(),
        number: number ?? this.repo.nextNumber(),
        version: 1,
        createdAt: ts,
        updatedAt: ts,
        draft: stampStage(normalize(draft), null, this.now()),
      };
      this.repo.insert(record, summarize(record));
      return toQuote(record);
    });
    this.catalog.learnFromItems(quote.items);
    return quote;
  }

  update(id: string, draft: QuoteDraft, expectedVersion: number): Quote {
    const current = this.repo.findById(id);
    if (!current) throw notFound('La cotización');
    if (current.version !== expectedVersion) {
      throw conflict(
        'La cotización fue modificada en otra pestaña o por otra persona. Recárgala antes de guardar.',
        {
          currentVersion: current.version,
        },
      );
    }
    const record: QuoteRecord = {
      ...current,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
      draft: stampStage(normalize(draft), current.draft, this.now()),
    };
    if (!this.repo.update(record, summarize(record), expectedVersion)) {
      throw conflict('La cotización cambió mientras se guardaba. Recárgala e intenta de nuevo.');
    }
    this.catalog.learnFromItems(record.draft.items);
    return toQuote(record);
  }

  changeStatus(id: string, change: StatusChange): Quote {
    const current = this.get(id);
    const { id: _id, number: _n, version, createdAt: _c, updatedAt: _u, ...draft } = current;
    return this.update(
      id,
      {
        ...draft,
        status: change.status,
        lossReason: change.status === 'lost' ? (change.lossReason ?? draft.lossReason) : null,
        stage: change.stage === undefined ? draft.stage : change.stage,
      },
      version,
    );
  }

  duplicate(id: string): Quote {
    const source = this.get(id);
    return this.create(duplicateDraft(source, this.now()));
  }

  /**
   * Crea una cotización nueva a partir de la actual y deja la actual como "Sustituida",
   * vinculando ambas: la vieja apunta a la nueva y la nueva a la vieja.
   */
  supersede(id: string): Quote {
    const source = this.get(id);
    if (source.supersededByNumber) {
      throw conflict('Esta cotización ya fue sustituida.', {
        supersededByNumber: source.supersededByNumber,
      });
    }

    const draft = duplicateDraft(source, this.now());
    draft.supersedesNumber = source.number;
    draft.supersededByNumber = null;
    const created = this.create(draft);

    const { id: _id, number: _n, version, createdAt: _c, updatedAt: _u, ...sourceDraft } = source;
    try {
      this.update(
        id,
        {
          ...sourceDraft,
          status: 'replaced',
          lossReason: null,
          supersededByNumber: created.number,
        },
        version,
      );
    } catch (err) {
      // Si no se pudo marcar la anterior, no se deja una copia suelta.
      this.remove(created.id);
      throw err;
    }
    return created;
  }

  remove(id: string): void {
    if (!this.repo.softDelete(id, this.now().toISOString())) throw notFound('La cotización');
  }

  /**
   * Recalcula el resumen del listado con el motor actual. Se ejecuta al arrancar, así un cambio en
   * las fórmulas o una columna nueva del listado (contacto, etapa) se refleja sin volver a guardar
   * cada cotización. Devuelve cuántas cambiaron.
   */
  refreshSummaries(): number {
    let changed = 0;
    transaction(this.db, () => {
      const current = new Map(this.repo.list().map((s) => [s.id, s]));
      for (const id of this.repo.listAllIds()) {
        const r = this.repo.findById(id);
        if (!r) continue;
        const next = summarize(r);
        const prev = current.get(id);
        if (
          !prev ||
          Math.round(prev.total) !== Math.round(next.total) ||
          Math.round(prev.budgetedCost) !== Math.round(next.budgetedCost) ||
          listFields(prev) !== listFields(next)
        ) {
          this.repo.updateSummary(id, next);
          changed++;
        }
      }
    });
    return changed;
  }

  /** Para respaldos: todas las cotizaciones completas. */
  exportAll(): Quote[] {
    return this.repo.listAllIds().map((id) => this.get(id));
  }
}

/** Campos del listado que no son montos: si cambian, se reescribe el resumen al arrancar. */
function listFields(s: QuoteSummary): string {
  const { total: _t, budgetedCost: _b, actualCost: _a, actualSale: _s, updatedAt: _u, ...rest } = s;
  return JSON.stringify(rest);
}

/** La fecha de la etapa la pone el servidor: cambia solo cuando cambia la etapa. */
function stampStage(draft: QuoteDraft, previous: QuoteDraft | null, now: Date): QuoteDraft {
  if (!draft.stage) return { ...draft, stageUpdatedOn: null };
  if (previous && previous.stage === draft.stage) {
    return { ...draft, stageUpdatedOn: previous.stageUpdatedOn ?? draft.stageUpdatedOn };
  }
  return { ...draft, stageUpdatedOn: todayIso(now) };
}

/** Reglas de consistencia que no dependen de la interfaz. */
function normalize(draft: QuoteDraft): QuoteDraft {
  return {
    ...draft,
    lossReason: draft.status === 'lost' ? draft.lossReason : null,
  };
}

function summarize(r: QuoteRecord): QuoteSummary {
  const { totals } = computeQuote(r.draft);
  return {
    id: r.id,
    number: r.number,
    clientName: r.draft.client.name,
    projectName: r.draft.client.project,
    contactName: r.draft.client.contact,
    contactPhone: r.draft.client.phone,
    contactPhone2: r.draft.client.phone2,
    identification: r.draft.client.identification,
    transactionType: r.draft.transactionType,
    temperature: r.draft.followUp.temperature,
    sendStatus: r.draft.followUp.sendStatus,
    closeDate: r.draft.followUp.closeDate,
    note: r.draft.followUp.note,
    issueDate: r.draft.issueDate,
    validDays: r.draft.validDays,
    status: r.draft.status,
    businessUnit: r.draft.businessUnit,
    serviceType: r.draft.serviceType,
    lossReason: r.draft.lossReason,
    nextFollowUp: r.draft.nextFollowUp,
    stage: r.draft.stage,
    stageUpdatedOn: r.draft.stageUpdatedOn,
    total: totals.total,
    budgetedCost: totals.totalCost,
    actualCost: actualCost(r.draft),
    actualSale: r.draft.closure.actualSale ?? 0,
    closedOn: r.draft.closure.closedOn,
    updatedAt: r.updatedAt,
    supersedesNumber: r.draft.supersedesNumber,
    supersededByNumber: r.draft.supersededByNumber,
  };
}

function toQuote(r: QuoteRecord): Quote {
  return {
    ...r.draft,
    id: r.id,
    number: r.number,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
