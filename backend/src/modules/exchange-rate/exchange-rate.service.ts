import { z } from 'zod';
import type { ExchangeRateInfo } from '@ggis/domain';
import { unavailable } from '../../lib/errors';
import type { Logger } from '../../lib/logger';

/**
 * TRM del día. Fuente principal: TRM oficial certificada por la Superintendencia Financiera
 * (conjunto abierto en datos.gov.co). Respaldo: tasa de mercado de open.er-api.com.
 * Se cachea en memoria para no consultar en cada clic.
 */
const OFFICIAL_URL =
  'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1';
const MARKET_URL = 'https://open.er-api.com/v6/latest/USD';

const officialSchema = z.array(z.object({ valor: z.coerce.number().positive(), vigenciadesde: z.string() })).min(1);
const marketSchema = z.object({ rates: z.object({ COP: z.number().positive() }), time_last_update_unix: z.number() });

export type FetchFn = typeof fetch;

export class ExchangeRateService {
  private cache: { value: ExchangeRateInfo; expires: number } | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly log: Logger,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async current(): Promise<ExchangeRateInfo> {
    const t = this.now().getTime();
    if (this.cache && this.cache.expires > t) return this.cache.value;
    const value = (await this.tryOfficial()) ?? (await this.tryMarket());
    if (!value) throw unavailable('No se pudo consultar la TRM. Ingrésala manualmente.');
    this.cache = { value, expires: t + this.ttlMs };
    return value;
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(6_000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async tryOfficial(): Promise<ExchangeRateInfo | null> {
    try {
      const [row] = officialSchema.parse(await this.getJson(OFFICIAL_URL));
      return {
        rate: Math.round(row!.valor * 100) / 100,
        source: 'trm-oficial',
        validOn: row!.vigenciadesde.slice(0, 10),
        fetchedAt: this.now().toISOString(),
      };
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'TRM oficial no disponible; se intenta la tasa de mercado');
      return null;
    }
  }

  private async tryMarket(): Promise<ExchangeRateInfo | null> {
    try {
      const data = marketSchema.parse(await this.getJson(MARKET_URL));
      return {
        rate: Math.round(data.rates.COP),
        source: 'mercado',
        validOn: new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10),
        fetchedAt: this.now().toISOString(),
      };
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'Tasa de mercado no disponible');
      return null;
    }
  }
}
