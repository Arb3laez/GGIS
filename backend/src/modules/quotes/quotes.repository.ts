import type { BusinessUnit, LossReason, QuoteDraft, QuoteStatus, QuoteSummary } from '@ggis/domain';
import type { Database } from '../../db/database';

/** Cotización tal como se guarda: metadatos + el borrador completo en JSON. */
export interface QuoteRecord {
  id: string;
  number: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  draft: QuoteDraft;
}

export interface QuoteListFilter {
  status?: QuoteStatus;
  businessUnit?: BusinessUnit;
  search?: string;
}

type Row = Record<string, string | number | null>;

const SUMMARY_COLUMNS = `id, number, client_name, project_name, issue_date, valid_days, status, business_unit,
  loss_reason, next_follow_up, total, budgeted_cost, actual_cost, actual_sale, closed_on, updated_at`;

function toSummary(r: Row): QuoteSummary {
  return {
    id: String(r.id),
    number: String(r.number),
    clientName: String(r.client_name ?? ''),
    projectName: String(r.project_name ?? ''),
    issueDate: String(r.issue_date),
    validDays: Number(r.valid_days),
    status: r.status as QuoteStatus,
    businessUnit: (r.business_unit as BusinessUnit | null) ?? null,
    lossReason: (r.loss_reason as LossReason | null) ?? null,
    nextFollowUp: (r.next_follow_up as string | null) ?? null,
    total: Number(r.total),
    budgetedCost: Number(r.budgeted_cost),
    actualCost: Number(r.actual_cost),
    actualSale: Number(r.actual_sale),
    closedOn: (r.closed_on as string | null) ?? null,
    updatedAt: String(r.updated_at),
  };
}

function summaryParams(s: QuoteSummary) {
  return {
    $status: s.status,
    $business_unit: s.businessUnit,
    $client_name: s.clientName,
    $project_name: s.projectName,
    $issue_date: s.issueDate,
    $valid_days: s.validDays,
    $loss_reason: s.lossReason,
    $next_follow_up: s.nextFollowUp,
    $total: s.total,
    $budgeted_cost: s.budgetedCost,
    $actual_cost: s.actualCost,
    $actual_sale: s.actualSale,
    $closed_on: s.closedOn,
  };
}

/** Acceso a datos de cotizaciones. Solo SQL: sin reglas de negocio. */
export class QuotesRepository {
  constructor(private readonly db: Database) {}

  list(filter: QuoteListFilter = {}): QuoteSummary[] {
    const where = ['deleted_at IS NULL'];
    const params: Record<string, string> = {};
    if (filter.status) {
      where.push('status = $status');
      params.$status = filter.status;
    }
    if (filter.businessUnit) {
      where.push('business_unit = $unit');
      params.$unit = filter.businessUnit;
    }
    if (filter.search) {
      where.push('(client_name LIKE $q OR project_name LIKE $q OR number LIKE $q)');
      params.$q = `%${filter.search.replace(/[%_]/g, '')}%`;
    }
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM quotes WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
      .all(params) as Row[];
    return rows.map(toSummary);
  }

  findById(id: string): QuoteRecord | null {
    const r = this.db
      .prepare('SELECT id, number, version, created_at, updated_at, data FROM quotes WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Row | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      number: String(r.number),
      version: Number(r.version),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      draft: JSON.parse(String(r.data)) as QuoteDraft,
    };
  }

  insert(record: QuoteRecord, summary: QuoteSummary): void {
    this.db
      .prepare(
        `INSERT INTO quotes (id, number, status, business_unit, client_name, project_name, issue_date, valid_days,
           loss_reason, next_follow_up, total, budgeted_cost, actual_cost, actual_sale, closed_on, data, version,
           created_at, updated_at)
         VALUES ($id, $number, $status, $business_unit, $client_name, $project_name, $issue_date, $valid_days,
           $loss_reason, $next_follow_up, $total, $budgeted_cost, $actual_cost, $actual_sale, $closed_on, $data, $version,
           $created_at, $updated_at)`,
      )
      .run({
        $id: record.id,
        $number: record.number,
        $data: JSON.stringify(record.draft),
        $version: record.version,
        $created_at: record.createdAt,
        $updated_at: record.updatedAt,
        ...summaryParams(summary),
      });
  }

  /** Actualiza solo si la versión coincide (control de concurrencia optimista). */
  update(record: QuoteRecord, summary: QuoteSummary, expectedVersion: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE quotes SET status = $status, business_unit = $business_unit, client_name = $client_name,
           project_name = $project_name, issue_date = $issue_date, valid_days = $valid_days, loss_reason = $loss_reason,
           next_follow_up = $next_follow_up, total = $total, budgeted_cost = $budgeted_cost, actual_cost = $actual_cost,
           actual_sale = $actual_sale, closed_on = $closed_on, data = $data, version = $version, updated_at = $updated_at
         WHERE id = $id AND version = $expected AND deleted_at IS NULL`,
      )
      .run({
        $id: record.id,
        $data: JSON.stringify(record.draft),
        $version: record.version,
        $updated_at: record.updatedAt,
        $expected: expectedVersion,
        ...summaryParams(summary),
      });
    return Number(result.changes) === 1;
  }

  /** Borrado lógico: la cotización deja de listarse pero queda para auditoría. */
  softDelete(id: string, at: string): boolean {
    const result = this.db
      .prepare('UPDATE quotes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(at, id);
    return Number(result.changes) === 1;
  }

  numberExists(number: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM quotes WHERE number = ?').get(number);
  }

  /** Siguiente consecutivo OT-0001, OT-0002… (se llama dentro de una transacción). */
  nextNumber(): string {
    for (;;) {
      this.db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'quote_number'").run();
      const { value } = this.db.prepare("SELECT value FROM counters WHERE name = 'quote_number'").get() as {
        value: number;
      };
      const number = `OT-${String(value).padStart(4, '0')}`;
      if (!this.numberExists(number)) return number;
    }
  }

  /** Asegura que el consecutivo quede por encima de un número ya usado (al importar). */
  bumpCounterTo(value: number): void {
    this.db
      .prepare("UPDATE counters SET value = MAX(value, ?) WHERE name = 'quote_number'")
      .run(value);
  }

  listAllIds(): string[] {
    return (this.db.prepare('SELECT id FROM quotes WHERE deleted_at IS NULL ORDER BY created_at').all() as Row[]).map(
      (r) => String(r.id),
    );
  }
}
