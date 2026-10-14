import { randomUUID } from 'node:crypto';
import type { CatalogEntry, CatalogItem, QuoteItem } from '@ggis/domain';
import type { Database } from '../../db/database';
import { notFound } from '../../lib/errors';

type Row = Record<string, string | number>;

const keyOf = (description: string) => description.trim().toLowerCase();

function toItem(r: Row): CatalogItem {
  return {
    id: String(r.id),
    description: String(r.description),
    unit: String(r.unit),
    currency: r.currency === 'USD' ? 'USD' : 'COP',
    unitPrice: Number(r.unit_price),
    laborPct: Number(r.labor_pct),
    updatedAt: String(r.updated_at),
  };
}

/**
 * Catálogo de materiales: cada material cotizado con precio queda guardado para autocompletar
 * unidad, moneda, precio y % de M.O. la próxima vez.
 */
export class CatalogService {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  search(query = '', limit = 50): CatalogItem[] {
    const rows = this.db
      .prepare('SELECT * FROM catalog_items WHERE description_key LIKE ? ORDER BY description LIMIT ?')
      .all(`%${keyOf(query).replace(/[%_]/g, '')}%`, Math.min(Math.max(limit, 1), 1000)) as Row[];
    return rows.map(toItem);
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM catalog_items').get() as Row).n);
  }

  upsert(entry: CatalogEntry): CatalogItem {
    const ts = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO catalog_items (id, description, description_key, unit, currency, unit_price, labor_pct, updated_at)
         VALUES ($id, $description, $key, $unit, $currency, $price, $labor, $ts)
         ON CONFLICT(description_key) DO UPDATE SET description = excluded.description, unit = excluded.unit,
           currency = excluded.currency, unit_price = excluded.unit_price, labor_pct = excluded.labor_pct,
           updated_at = excluded.updated_at`,
      )
      .run({
        $id: randomUUID(),
        $description: entry.description.trim(),
        $key: keyOf(entry.description),
        $unit: entry.unit || 'UN',
        $currency: entry.currency,
        $price: entry.unitPrice,
        $labor: entry.laborPct,
        $ts: ts,
      });
    return toItem(
      this.db
        .prepare('SELECT * FROM catalog_items WHERE description_key = ?')
        .get(keyOf(entry.description)) as Row,
    );
  }

  /** Aprende de los ítems de una cotización guardada (solo los que tienen nombre y precio). */
  learnFromItems(items: readonly QuoteItem[]): void {
    for (const i of items) {
      if (i.description.trim().length < 3 || i.unitPrice <= 0) continue;
      this.upsert({
        description: i.description,
        unit: i.unit,
        currency: i.currency,
        unitPrice: i.unitPrice,
        laborPct: i.laborPct,
      });
    }
  }

  remove(id: string): void {
    const result = this.db.prepare('DELETE FROM catalog_items WHERE id = ?').run(id);
    if (Number(result.changes) === 0) throw notFound('El material');
  }
}
