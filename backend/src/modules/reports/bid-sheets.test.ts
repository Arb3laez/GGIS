import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { computeQuote, createEmptyDraft, type Quote } from '@ggis/domain';
import { buildCostAnalysisWorkbook } from './cost-analysis';
import { hasBidData } from './bid-sheets';

const company = { legalName: 'Empresa Demo S.A.S.' } as Parameters<typeof buildCostAnalysisWorkbook>[1];

function quote(): Quote {
  const d = createEmptyDraft();
  d.staff = [];
  d.supplies = [
    {
      id: 's1',
      code: 'EQ01',
      description: 'Equipo demo',
      unit: 'und',
      type: 'EQ',
      baseValue: 100,
      priceType: 'USD',
      source: 'web',
      estimated: false,
    },
    {
      id: 's2',
      code: 'MO01',
      description: 'Técnico demo',
      unit: 'día',
      type: 'MO',
      baseValue: 200000,
      priceType: 'COP',
      source: '',
      estimated: true,
    },
  ];
  d.items = [
    {
      ...d.items[0]!,
      description: 'Ítem demo',
      quantity: 4,
      subcontractorUnitPrice: 900000,
      apu: [
        { id: 'l1', supplyId: 's1', quantity: 1, yieldPerDay: 0, applyWaste: false },
        { id: 'l2', supplyId: 's2', quantity: 0, yieldPerDay: 10, applyWaste: false },
      ],
    },
  ];
  d.pricing.method = 'aiu_bid';
  d.bid.caps.enabled = true;
  d.bid.clarifications = [{ id: 'c1', topic: 'Obra civil', observation: 'No incluida', impact: 'Exclusión' }];
  return {
    ...d,
    id: '00000000-0000-4000-8000-000000000000',
    number: 'OT-0001',
    version: 1,
    createdAt: '',
    updatedAt: '',
  };
}

describe('hojas de licitación del análisis de costos', () => {
  it('agrega insumos, APU, revisión y AIU cuando la cotización usa licitación', () => {
    const q = quote();
    expect(hasBidData(q)).toBe(true);
    const wb = XLSX.read(buildCostAnalysisWorkbook(q, company).buffer);
    expect(wb.SheetNames).toEqual([
      'Resumen auditoría',
      'Materiales y M.O.',
      'Personal fijo',
      'Otros costos',
      'Insumos',
      'APU',
      'Revisión subcontratista',
      'AIU y topes',
    ]);
    const apu = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['APU']!, { header: 1 });
    const unit = Math.round(computeQuote(q).items[0]!.apu!.total);
    expect(apu.some((r) => String(r[3]).startsWith('COSTO DIRECTO') && r[10] === unit)).toBe(true);
    const review = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Revisión subcontratista']!, { header: 1 });
    expect(review.some((r) => r[1] === 'Ítem demo' && r[4] === 900000)).toBe(true);
    const aiu = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['AIU y topes']!, { header: 1 });
    expect(aiu.some((r) => r[0] === '1. Obra civil')).toBe(true);
  });

  it('no agrega hojas de licitación a una cotización normal', () => {
    const d = createEmptyDraft();
    const q = {
      ...d,
      id: '00000000-0000-4000-8000-000000000000',
      number: 'OT-0002',
      version: 1,
      createdAt: '',
      updatedAt: '',
    };
    expect(hasBidData(q)).toBe(false);
    expect(XLSX.read(buildCostAnalysisWorkbook(q, company).buffer).SheetNames).toHaveLength(4);
  });
});
