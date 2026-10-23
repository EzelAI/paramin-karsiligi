import { ASSET_GROUPS, DEFAULT_SETTINGS, type AssetGroup, type Settings } from '@paramin-karsiligi/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useSaveSettings, useSettings } from '../api/hooks';

/** Hesaplama varsayımları: alım-satım maliyeti, altın primi, stopajlar */
export function SettingsView({ onClose }: { onClose: () => void }) {
  const { data, error } = useSettings();
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (error) return <p className="error">{error.message}</p>;
  if (!draft) return <p className="muted">Yükleniyor…</p>;

  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(draft, { onSuccess: onClose });
  };

  return (
    <form className="inv-view settings" onSubmit={submit}>
      <header className="inv-header">
        <h1>Hesaplama varsayımları</h1>
        <div className="header-actions">
          <button type="button" className="btn ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
            Varsayılanlara dön
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn primary" disabled={save.isPending}>
            Kaydet
          </button>
        </div>
      </header>
      {save.error && <p className="error">{save.error.message}</p>}

      <section className="card">
        <h2>Alım-satım maliyeti (gidiş-dönüş, %)</h2>
        <p className="muted small">
          Makas ve komisyon toplamı. Her alımda tutarın bu kadarı kesilmiş sayılır; örneğin %1 ile 100.000 TL'lik ödeme
          99.000 TL'lik varlık alır. Yaklaşık değerler: kuyum/banka altını %1–3, döviz %0,5–2, ABD hissesi (kur çevrimi
          dahil) %0,5–1,5, BIST %0,1–0,4.
        </p>
        <div className="form-row">
          {(Object.keys(ASSET_GROUPS) as AssetGroup[])
            .filter((g) => g !== 'inflation')
            .map((g) => (
              <NumberField
                key={g}
                label={ASSET_GROUPS[g]}
                value={draft.tradingCostPct[g]}
                onChange={(v) => set({ tradingCostPct: { ...draft.tradingCostPct, [g]: v } })}
              />
            ))}
        </div>
      </section>

      <section className="card">
        <h2>Altın</h2>
        <p className="muted small">
          Gram fiyatı uluslararası spot ons fiyatından (parite) hesaplanır. Kapalıçarşı/banka fiyatı genelde bundan
          biraz yüksektir; aradaki farkı prim olarak girerseniz "kaç gram" hesabı yerel fiyata göre yapılır.
        </p>
        <div className="form-row">
          <NumberField label="Yerel prim (%)" value={draft.goldPremiumPct} min={-50} onChange={(v) => set({ goldPremiumPct: v })} />
        </div>
      </section>

      <section className="card">
        <h2>Mevduat faizi</h2>
        <p className="muted small">
          Faiz, TCMB politika faizinden hesaplanır. Bankaların mevduat faizi bundan farklı olabilir (ör. 2011–2018 arası
          daha yüksek, 2023 sonrası çoğu zaman daha düşük): farkı puan olarak girebilirsiniz. Stopaj oranı dönemlere göre
          değişmiştir; burada tek oran uygulanır.
        </p>
        <div className="form-row">
          <NumberField
            label="Stopaj (%)"
            value={draft.depositWithholdingPct}
            onChange={(v) => set({ depositWithholdingPct: v })}
          />
          <NumberField
            label="Politika faizine fark (puan)"
            value={draft.depositSpreadPts}
            min={-50}
            onChange={(v) => set({ depositSpreadPts: v })}
          />
        </div>
      </section>

      <section className="card">
        <h2>Temettü stopajı (%)</h2>
        <p className="muted small">
          Hisse getirilerinde temettüler bu oran düşüldükten sonra yeniden yatırılmış sayılır.
        </p>
        <div className="form-row">
          <NumberField
            label="ABD"
            value={draft.dividendWithholdingPct.us}
            onChange={(v) => set({ dividendWithholdingPct: { ...draft.dividendWithholdingPct, us: v } })}
          />
          <NumberField
            label="BIST"
            value={draft.dividendWithholdingPct.tr}
            onChange={(v) => set({ dividendWithholdingPct: { ...draft.dividendWithholdingPct, tr: v } })}
          />
        </div>
      </section>
    </form>
  );
}

function NumberField(props: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <label className="narrow-field">
      {props.label}
      <input
        type="number"
        step="0.1"
        min={props.min ?? 0}
        max={props.min !== undefined && props.min < 0 ? 50 : 100}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        required
      />
    </label>
  );
}
