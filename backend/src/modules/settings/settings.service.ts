import { companyProfileSchema, DEFAULT_COMPANY_PROFILE, type CompanyProfile } from '@ggis/domain';
import type { Database } from '../../db/database';

const COMPANY_KEY = 'company_profile';

/**
 * Configuración de la empresa (datos de la oferta, firma, ruta de Dropbox). Antes estaba fija en
 * el código; ahora se edita desde la pantalla de Configuración.
 */
export class SettingsService {
  constructor(private readonly db: Database) {}

  getCompanyProfile(): CompanyProfile {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(COMPANY_KEY) as
      { value: string } | undefined;
    if (!row) return DEFAULT_COMPANY_PROFILE;
    const parsed = companyProfileSchema.safeParse({ ...DEFAULT_COMPANY_PROFILE, ...JSON.parse(row.value) });
    return parsed.success ? parsed.data : DEFAULT_COMPANY_PROFILE;
  }

  saveCompanyProfile(profile: CompanyProfile): CompanyProfile {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(COMPANY_KEY, JSON.stringify(profile));
    return profile;
  }
}
