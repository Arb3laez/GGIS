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

  /* v3 — retirar la función de licitación / APU: las cotizaciones que usaban `aiu_bid` pasan a AIU
     y se descartan los datos de la licitación (el resto de campos los ignora el esquema al leer). */ `
  UPDATE quotes
  SET data = json_remove(json_set(data, '$.pricing.method', 'aiu'), '$.bid', '$.supplies', '$.apuParams')
  WHERE json_extract(data, '$.pricing.method') = 'aiu_bid';
  `,

  /* v4 — vínculo de sustitución: la cotización anterior queda como "Sustituida" y apunta a la nueva,
     y la nueva apunta a la anterior. */ `
  ALTER TABLE quotes ADD COLUMN supersedes_number TEXT;
  ALTER TABLE quotes ADD COLUMN superseded_by_number TEXT;
  `,

  /* v5 — tipo de servicio de la cotización (suministro, mantenimiento, etc.) */ `
  ALTER TABLE quotes ADD COLUMN service_type TEXT;
  `,

  /* v6 — listado tipo CRM: contacto, teléfono y etapa del seguimiento comercial.
     Todas las cotizaciones existentes quedan con la etapa en null; el contacto y el teléfono
     se llenan al arrancar con el recálculo de resúmenes (refreshSummaries). */ `
  ALTER TABLE quotes ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
  ALTER TABLE quotes ADD COLUMN contact_phone TEXT NOT NULL DEFAULT '';
  ALTER TABLE quotes ADD COLUMN stage TEXT;
  ALTER TABLE quotes ADD COLUMN stage_updated_on TEXT;
  UPDATE quotes SET stage = NULL, stage_updated_on = NULL,
    data = json_set(data, '$.stage', json('null'), '$.stageUpdatedOn', json('null'));
  `,

  /* v7 — sistema de diseño GYG / Excel CRM Ventas: campos del seguimiento para el listado
     (NIT, teléfono 2, tipo de transacción, temperatura, envío, cierre estimado, observación,
     columnas 1 y 2) en una columna JSON. Se llena al arrancar con refreshSummaries. */ `
  ALTER TABLE quotes ADD COLUMN crm TEXT NOT NULL DEFAULT '{}';
  `,
];
