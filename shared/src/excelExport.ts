import ExcelJS from 'exceljs';
import type { AssetResult, InvestmentAnalysis } from './analysis';
import { ASSET_GROUPS, ASSET_IDS, ASSETS, getAsset, PRIMARY_ASSET } from './assets';
import type { Settings } from './settings';
import type { Investment } from './types';

const TL = '#,##0.00 "₺"';
const PCT = '#,##0.0"%"';
const NUM4 = '#,##0.0000';

/** Excel dosyasının adı */
export const exportFilename = (investment: Investment) => `${investment.name}-paramin-karsiligi.xlsx`;

/** Yıllık getiriye (yoksa toplam getiriye) göre büyükten küçüğe */
export function rankKey(r: AssetResult): number {
  return r.xirr ?? (r.gainPct !== null ? r.gainPct / 100 : -Infinity);
}

export async function buildInvestmentWorkbook(
  investment: Investment,
  a: InvestmentAnalysis,
  settings: Settings,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Paramın Karşılığı';
  wb.created = new Date();

  // Özet
  const summary = wb.addWorksheet('Özet');
  summary.columns = [
    { header: 'Varlık', key: 'asset', width: 28 },
    { header: 'Grup', key: 'group', width: 16 },
    { header: 'Biriken Miktar', key: 'units', width: 16, style: { numFmt: NUM4 } },
    { header: 'Birim', key: 'unit', width: 8 },
    { header: 'Ödenen TL', key: 'paid', width: 18, style: { numFmt: TL } },
    { header: 'Bugünkü Değer', key: 'value', width: 18, style: { numFmt: TL } },
    { header: 'Toplam Getiri %', key: 'gainPct', width: 14, style: { numFmt: PCT } },
    { header: 'Yıllık Getiri (XIRR) %', key: 'xirr', width: 18, style: { numFmt: PCT } },
    { header: 'Ödenenin Bugünkü Karşılığı (TÜFE)', key: 'realPaid', width: 22, style: { numFmt: TL } },
    { header: 'Reel Getiri %', key: 'realPct', width: 13, style: { numFmt: PCT } },
    { header: 'Reel Yıllık %', key: 'realXirr', width: 13, style: { numFmt: PCT } },
    { header: 'Hariç Ödeme', key: 'missing', width: 12 },
    { header: 'Not', key: 'note', width: 60 },
  ];
  const ranked = ASSET_IDS.map((id) => a.assets[id])
    .filter((r): r is AssetResult => !!r)
    .sort((x, y) => rankKey(y) - rankKey(x));
  for (const r of ranked) {
    const def = getAsset(r.assetId);
    summary.addRow({
      asset: def.label,
      group: ASSET_GROUPS[def.group],
      units: def.kind === 'unit' ? r.totalUnits : null,
      unit: def.kind === 'unit' ? def.unit : '',
      paid: r.coveredPaid,
      value: r.currentValue,
      gainPct: r.gainPct,
      xirr: r.xirr !== null ? r.xirr * 100 : null,
      realPaid: r.real?.paidToday,
      realPct: r.real?.gainPct,
      realXirr: r.real?.xirr != null ? r.real.xirr * 100 : null,
      missing: r.missingCount || '',
      note: [def.note, ...(a.warnings?.[r.assetId] ?? [])].filter(Boolean).join(' · '),
    });
  }
  summary.addRow([]);
  summary.addRow(['Yatırım', investment.name]);
  summary.addRow(['Toplam Ödeme (TL)', a.totalPaid]).getCell(2).numFmt = TL;
  if (a.planned.length) {
    summary.addRow([`Planlanan ödeme (${a.planned.length} adet, hesaba katılmadı)`, a.plannedTotal]).getCell(2).numFmt = TL;
  }
  summary.addRow(['Değerleme Tarihi', a.asOf]);

  // Ödemeler: altın ayrıntılı, diğerleri ödemenin bugünkü değeri olarak
  const others = ASSET_IDS.filter((id) => id !== PRIMARY_ASSET);
  const payments = wb.addWorksheet('Ödemeler');
  payments.columns = [
    { header: 'Tarih', key: 'date', width: 12 },
    { header: 'Durum', key: 'status', width: 11 },
    { header: 'Tutar (TL)', key: 'amount', width: 16, style: { numFmt: TL } },
    { header: 'Gram Fiyatı', key: 'goldPrice', width: 14, style: { numFmt: TL } },
    { header: 'Altın (gr)', key: 'goldUnits', width: 12, style: { numFmt: NUM4 } },
    { header: 'Kümülatif Altın (gr)', key: 'goldCum', width: 18, style: { numFmt: NUM4 } },
    ...others.map((id) => ({ header: `${ASSETS[id].shortLabel} bugün (TL)`, key: id, width: 18, style: { numFmt: TL } })),
    { header: 'Not', key: 'note', width: 30 },
  ];
  let goldCum = 0;
  for (const p of a.payments) {
    const gold = p.conversions[PRIMARY_ASSET];
    goldCum += gold?.units ?? 0;
    const row: Record<string, unknown> = {
      date: p.date,
      status: 'Ödendi',
      amount: p.amount,
      goldPrice: gold?.price,
      goldUnits: gold?.units,
      goldCum,
      note: p.note ?? '',
    };
    for (const id of others) {
      const c = p.conversions[id];
      const now = a.assets[id]?.currentPrice;
      if (c && now != null) row[id] = c.units * now;
    }
    payments.addRow(row);
  }
  for (const p of a.planned) payments.addRow({ date: p.date, status: 'Planlanan', amount: p.amount, note: p.note ?? '' });

  // Aylık
  const monthly = wb.addWorksheet('Aylık');
  monthly.columns = [
    { header: 'Ay', key: 'month', width: 10 },
    { header: 'Kümülatif Ödeme (TL)', key: 'paid', width: 20, style: { numFmt: TL } },
    ...ASSET_IDS.map((id) => ({ header: `${ASSETS[id].shortLabel} (TL)`, key: id, width: 16, style: { numFmt: TL } })),
  ];
  for (const t of a.timeline) monthly.addRow({ month: t.month, paid: t.paid, ...t.values });

  // Varsayımlar
  const assumptions = wb.addWorksheet('Varsayımlar');
  assumptions.columns = [
    { header: 'Varsayım', key: 'k', width: 46 },
    { header: 'Değer', key: 'v', width: 12 },
  ];
  for (const [group, label] of Object.entries(ASSET_GROUPS)) {
    assumptions.addRow({ k: `Alım-satım maliyeti: ${label} (%)`, v: settings.tradingCostPct[group as keyof typeof ASSET_GROUPS] });
  }
  assumptions.addRow({ k: 'Altın yerel piyasa primi (%)', v: settings.goldPremiumPct });
  assumptions.addRow({ k: 'Mevduat stopajı (%)', v: settings.depositWithholdingPct });
  assumptions.addRow({ k: 'Mevduat faizi − politika faizi (puan)', v: settings.depositSpreadPts });
  assumptions.addRow({ k: 'Temettü stopajı ABD (%)', v: settings.dividendWithholdingPct.us });
  assumptions.addRow({ k: 'Temettü stopajı BIST (%)', v: settings.dividendWithholdingPct.tr });

  for (const ws of [summary, payments, monthly, assumptions]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  return wb.xlsx.writeBuffer();
}
