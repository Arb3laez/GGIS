/**
 * Migraciones en orden. Cada posición es una versión (PRAGMA user_version).
 * Nunca se edita una migración ya publicada: se agrega una nueva al final.
 */
export const migrations: string[] = [
  /* v1 — esquema inicial */ `
  CREATE TABLE quotes (
    id              TEXT PRIMARY KEY,
    number          TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL,
    business_unit   TEXT,
    client_name     TEXT NOT NULL DEFAULT '',
    project_name    TEXT NOT NULL DEFAULT '',
    issue_date      TEXT NOT NULL,
    valid_days      INTEGER NOT NULL,
    loss_reason     TEXT,
    next_follow_up  TEXT,
    total           REAL NOT NULL DEFAULT 0,
    budgeted_cost   REAL NOT NULL DEFAULT 0,
    actual_cost     REAL NOT NULL DEFAULT 0,
    actual_sale     REAL NOT NULL DEFAULT 0,
    closed_on       TEXT,
    data            TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT
  );
  CREATE INDEX idx_quotes_status ON quotes(status) WHERE deleted_at IS NULL;
  CREATE INDEX idx_quotes_unit ON quotes(business_unit) WHERE deleted_at IS NULL;
  CREATE INDEX idx_quotes_issue_date ON quotes(issue_date) WHERE deleted_at IS NULL;

  CREATE TABLE counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  INSERT INTO counters(name, value) VALUES ('quote_number', 0);

  CREATE TABLE catalog_items (
    id               TEXT PRIMARY KEY,
    description      TEXT NOT NULL,
    description_key  TEXT NOT NULL UNIQUE,
    unit             TEXT NOT NULL,
    currency         TEXT NOT NULL,
    unit_price       REAL NOT NULL,
    labor_pct        REAL NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE attachments (
    id           TEXT PRIMARY KEY,
    quote_id     TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    storage_key  TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX idx_attachments_quote ON attachments(quote_id);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  /* v2 — liberar los números de cotizaciones eliminadas (quedan marcadas como anuladas) */ `
  UPDATE quotes SET number = number || '~anulada-' || substr(id, 1, 8)
  WHERE deleted_at IS NOT NULL AND number NOT LIKE '%~anulada-%';
  `,
];
