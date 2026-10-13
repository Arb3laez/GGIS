import { randomUUID } from 'node:crypto';
import {
  actualCost,
  computeQuote,
  duplicateDraft,
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
        draft: normalize(draft),
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
      throw conflict('La cotización fue modificada en otra pestaña o por otra persona. Recárgala antes de guardar.', {
        currentVersion: current.version,
      });
    }
    const record: QuoteRecord = {
      ...current,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
      draft: normalize(draft),
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
      },
      version,
    );
  }

  duplicate(id: string): Quote {
    const source = this.get(id);
    return this.create(duplicateDraft(source, this.now()));
  }

  remove(id: string): void {
    if (!this.repo.softDelete(id, this.now().toISOString())) throw notFound('La cotización');
  }

  /** Para respaldos: todas las cotizaciones completas. */
  exportAll(): Quote[] {
    return this.repo.listAllIds().map((id) => this.get(id));
  }
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
    issueDate: r.draft.issueDate,
    validDays: r.draft.validDays,
    status: r.draft.status,
    businessUnit: r.draft.businessUnit,
    lossReason: r.draft.lossReason,
    nextFollowUp: r.draft.nextFollowUp,
    total: totals.total,
    budgetedCost: totals.totalCost,
    actualCost: actualCost(r.draft.closure),
    actualSale: r.draft.closure.actualSale ?? 0,
    closedOn: r.draft.closure.closedOn,
    updatedAt: r.updatedAt,
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
