/**
 * Copia literal (adaptada a funciones puras) de las fórmulas de la v68 del cotizador, usada solo
 * en pruebas para comprobar que el nuevo motor da exactamente los mismos números.
 * No importar desde código de producción.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const AUX_TRANSPORTE_2026 = 249095;
const HORAS_MES_2026 = 210;
const RECARGO = { extraDiurna: 0.25, extraNocturna: 0.75, nocturno: 0.35, dominical: 0.9 };
const FACTOR_COMPLEJIDAD_ITEM: Record<string, number> = { baja: 0.8, media: 1, alta: 1.25 };

export function legacyCompute(state: any) {
  const valorHoraOrdinaria = (row: any) => (Number(row.salario) || 0) / HORAS_MES_2026;
  const staffExtraTotal = (row: any) => {
    if (!row.tieneExtra) return 0;
    const vh = valorHoraOrdinaria(row);
    const bruto =
      vh * (1 + RECARGO.extraDiurna) * (Number(row.hExtraDiurna) || 0) +
      vh * (1 + RECARGO.extraNocturna) * (Number(row.hExtraNocturna) || 0) +
      vh * RECARGO.nocturno * (Number(row.hRecargoNocturno) || 0) +
      vh * RECARGO.dominical * (Number(row.hDomDiurna) || 0) +
      vh * (RECARGO.dominical + RECARGO.nocturno) * (Number(row.hDomNocturna) || 0) +
      vh * (1 + RECARGO.dominical + RECARGO.extraDiurna) * (Number(row.hDomExtraDiurna) || 0) +
      vh * (1 + RECARGO.dominical + RECARGO.extraNocturna) * (Number(row.hDomExtraNocturna) || 0);
    return bruto * (Number(row.factor) || 1);
  };
  const staffLineTotal = (row: any) => {
    const mensual =
      (Number(row.salario) || 0) * (Number(row.factor) || 0) + (row.auxTransporte ? AUX_TRANSPORTE_2026 : 0);
    return (mensual / 30) * (Number(row.dias) || 0) + staffExtraTotal(row);
  };
  const staffSubtotal = () => state.staff.reduce((s: number, r: any) => s + staffLineTotal(r), 0);
  const moExtraSubtotal = () =>
    (state.moExtra || []).reduce((s: number, r: any) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
  const otrosSubtotal = () =>
    (state.otros || []).reduce((s: number, r: any) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

  const lineBaseCOP = (row: any) => {
    const price = Number(row.price) || 0;
    const base = row.currency === 'USD' ? price * (Number(state.trm) || 0) : price;
    return row.nacIncluded ? base * (1 + (Number(state.nacPct) || 0) / 100) : base;
  };
  const unitMaterial = (row: any) => (row.ivaIncluded ? lineBaseCOP(row) * 1.19 : lineBaseCOP(row));
  const unitMo = (row: any) => (lineBaseCOP(row) * (Number(row.moPct) || 0)) / 100;
  const unitItem = (row: any) => unitMaterial(row) + unitMo(row);
  const totalMaterial = (row: any) => unitMaterial(row) * (Number(row.qty) || 0);
  const totalMo = (row: any) => unitMo(row) * (Number(row.qty) || 0);
  const laborAsignable = () => staffSubtotal() + moExtraSubtotal();
  const itemsConMoDirecta = () => state.items.filter((r: any) => r.moDirect && r.desc && (Number(r.qty) || 0) > 0);
  const laborAsignadaA = (row: any) => {
    const marcados = itemsConMoDirecta();
    if (marcados.length === 0) return 0;
    if (!marcados.find((r: any) => r.id === row.id)) return 0;
    return laborAsignable() / marcados.length;
  };
  const totalItem = (row: any) => unitItem(row) * (Number(row.qty) || 0) + laborAsignadaA(row);
  const materialsSubtotal = () => state.items.reduce((s: number, r: any) => s + totalMaterial(r), 0);
  const laborSubtotal = () => state.items.reduce((s: number, r: any) => s + totalMo(r), 0);

  const totals = () => {
    const mat = materialsSubtotal();
    const mo = laborSubtotal();
    const moAct = moExtraSubtotal();
    const staff = staffSubtotal();
    const otros = otrosSubtotal();
    const costoDirecto = mat + mo + moAct + staff + otros;
    const polizas = (costoDirecto * (Number(state.polizasPct) || 0)) / 100;
    const impuestos = (costoDirecto * (Number(state.impuestosPct) || 0)) / 100;
    const financiamiento = (costoDirecto * (Number(state.financiamientoPct) || 0)) / 100;
    const imprevistos = (costoDirecto * (Number(state.otrosPct) || 0)) / 100;
    const adminCost = (costoDirecto * (Number(state.adminCostPct) || 0)) / 100;
    const costoTotal = costoDirecto + polizas + impuestos + financiamiento + imprevistos + adminCost;
    const margenFrac = Math.min(Math.max(Number(state.marginPct) || 0, 0), 95) / 100;
    const subtotal = costoTotal / (1 - margenFrac);
    if (state.method === 'simple') {
      const iva = (subtotal * (Number(state.ivaPctSimple) || 0)) / 100;
      return { mat, mo, moAct, staff, otros, costoDirecto, costoTotal, subtotal, total: subtotal + iva };
    }
    const adminAmt = (subtotal * (Number(state.adminPct) || 0)) / 100;
    const impAmt = (subtotal * (Number(state.impPct) || 0)) / 100;
    const utilAmt = (subtotal * (Number(state.utilPct) || 0)) / 100;
    const ivaAmt = (utilAmt * (Number(state.ivaPctAiu) || 0)) / 100;
    return {
      mat,
      mo,
      moAct,
      staff,
      otros,
      costoDirecto,
      costoTotal,
      subtotal,
      total: subtotal + adminAmt + impAmt + utilAmt + ivaAmt,
    };
  };

  const tieneOverride = (row: any) => Number(row.ventaOverride) > 0;
  const pesoAjustadoItem = (row: any) => totalItem(row) * (FACTOR_COMPLEJIDAD_ITEM[row.complejidadItem || 'media'] || 1);
  const costoItemsSinOverrideAjustada = () =>
    state.items.filter((r: any) => !tieneOverride(r)).reduce((s: number, r: any) => s + pesoAjustadoItem(r), 0);
  const ventaTotalItem = (row: any) => {
    if (tieneOverride(row)) return Number(row.ventaOverride) * (Number(row.qty) || 0);
    const overrideSum = state.items
      .filter(tieneOverride)
      .reduce((s: number, r: any) => s + Number(r.ventaOverride) * (Number(r.qty) || 0), 0);
    const remanente = totals().subtotal - overrideSum;
    const baseAjustada = costoItemsSinOverrideAjustada();
    return baseAjustada > 0 ? remanente * (pesoAjustadoItem(row) / baseAjustada) : 0;
  };

  return {
    totals: totals(),
    items: state.items.map((r: any) => ({ totalCost: totalItem(r), saleTotal: ventaTotalItem(r) })),
  };
}
