import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttachmentMeta,
  BackupImportResult,
  BusinessUnit,
  CatalogItem,
  CompanyProfile,
  Dashboard,
  ExchangeRateInfo,
  HistoricalRecommendation,
  ImportPreview,
  Quote,
  QuoteDraft,
  QuoteStatus,
  QuoteSummary,
  StatusChange,
} from '@ggis/domain';
import { http } from './http';

/** Claves de caché centralizadas para invalidar de forma consistente. */
export const keys = {
  quotes: ['quotes'] as const,
  quoteList: (f: object) => ['quotes', 'list', f] as const,
  quote: (id: string) => ['quotes', 'detail', id] as const,
  attachments: (quoteId: string) => ['quotes', 'attachments', quoteId] as const,
  dashboard: ['analytics', 'dashboard'] as const,
  history: (unit: string, exclude?: string) => ['analytics', 'history', unit, exclude] as const,
  catalog: ['catalog'] as const,
  company: ['settings', 'company'] as const,
  capabilities: ['imports', 'capabilities'] as const,
};

// ---------- Cotizaciones ----------
export interface QuoteFilter {
  status?: QuoteStatus;
  businessUnit?: BusinessUnit;
  q?: string;
}

export function useQuoteList(filter: QuoteFilter) {
  const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
  return useQuery({
    queryKey: keys.quoteList(filter),
    queryFn: () => http.get<QuoteSummary[]>(`/api/quotes?${params}`),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: keys.quote(id ?? ''),
    queryFn: () => http.get<Quote>(`/api/quotes/${id}`),
    enabled: !!id,
    staleTime: Infinity, // el editor es la fuente mientras se edita
  });
}

export const quotesApi = {
  create: (draft: QuoteDraft) => http.post<Quote>('/api/quotes', draft),
  update: (id: string, version: number, draft: QuoteDraft) =>
    http.put<Quote>(`/api/quotes/${id}`, { version, quote: draft }),
  setStatus: (id: string, change: StatusChange) => http.patch<Quote>(`/api/quotes/${id}/status`, change),
  duplicate: (id: string) => http.post<Quote>(`/api/quotes/${id}/duplicate`),
  remove: (id: string) => http.delete(`/api/quotes/${id}`),
};

export function useQuoteMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.quotes });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  return {
    setStatus: useMutation({
      mutationFn: ({ id, change }: { id: string; change: StatusChange }) => quotesApi.setStatus(id, change),
      onSuccess: (q) => {
        qc.setQueryData(keys.quote(q.id), q);
        invalidate();
      },
    }),
    duplicate: useMutation({ mutationFn: quotesApi.duplicate, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: quotesApi.remove, onSuccess: invalidate }),
    invalidate,
  };
}

// ---------- Adjuntos ----------
export function useAttachments(quoteId: string | null) {
  return useQuery({
    queryKey: keys.attachments(quoteId ?? ''),
    queryFn: () => http.get<AttachmentMeta[]>(`/api/quotes/${quoteId}/attachments`),
    enabled: !!quoteId,
  });
}

// ---------- Indicadores ----------
export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => http.get<Dashboard>('/api/analytics/dashboard'),
  });
}

export function useHistory(unit: BusinessUnit | null, excludeId: string | null) {
  return useQuery({
    queryKey: keys.history(unit ?? '', excludeId ?? undefined),
    queryFn: () =>
      http.get<{ recommendation: HistoricalRecommendation | null }>(
        `/api/analytics/history?businessUnit=${unit}${excludeId ? `&excludeId=${excludeId}` : ''}`,
      ),
    enabled: !!unit,
  });
}

// ---------- Catálogo ----------
export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: () => http.get<{ items: CatalogItem[]; total: number }>('/api/catalog'),
    staleTime: 60_000,
  });
}

// ---------- Importación ----------
export function useImportCapabilities() {
  return useQuery({
    queryKey: keys.capabilities,
    queryFn: () => http.get<{ ai: boolean }>('/api/imports/capabilities'),
  });
}

export const importsApi = {
  spreadsheet: (file: File) => http.upload<ImportPreview>('/api/imports/spreadsheet', file),
  document: (file: File, quoteId: string | null) =>
    http.upload<ImportPreview>('/api/imports/document', file, quoteId ? { quoteId } : {}),
  text: (text: string) => http.post<ImportPreview>('/api/imports/text', { text }),
};

// ---------- TRM ----------
export const exchangeRateApi = { current: () => http.get<ExchangeRateInfo>('/api/exchange-rate') };

// ---------- Configuración ----------
export function useCompanyProfile() {
  return useQuery({
    queryKey: keys.company,
    queryFn: () => http.get<CompanyProfile>('/api/settings/company'),
  });
}

export function useSaveCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CompanyProfile) => http.put<CompanyProfile>('/api/settings/company', p),
    onSuccess: (p) => qc.setQueryData(keys.company, p),
  });
}

// ---------- Respaldo ----------
export const backupApi = {
  import: (file: File) => http.upload<BackupImportResult>('/api/backup/import', file),
};
