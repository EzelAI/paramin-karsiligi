import { DISCLAIMER_FULL, DISCLAIMER_SHORT } from '@paramin-karsiligi/shared';
import { useState } from 'react';
import { IS_STATIC, readItem, writeItem } from '../lib/storage';

const SEEN_KEY = 'altin.disclaimerSeen';

/** Her sayfanın altında: kısa uyarı ve açılır tam metin */
export function DisclaimerFooter() {
  return (
    <footer className="disclaimer">
      <p>{DISCLAIMER_SHORT}</p>
      <details>
        <summary>Yasal uyarının tamamı</summary>
        <DisclaimerText />
      </details>
    </footer>
  );
}

/** İlk girişte bir kez gösterilen bildirim */
export function DisclaimerNotice() {
  const [seen, setSeen] = useState(() => readItem<boolean>(SEEN_KEY) === true);
  if (seen) return null;

  const accept = () => {
    writeItem(SEEN_KEY, true);
    setSeen(true);
  };

  return (
    <div className="disclaimer-notice" role="dialog" aria-labelledby="disclaimer-title">
      <div className="disclaimer-box">
        <h2 id="disclaimer-title">Başlamadan önce</h2>
        <DisclaimerText />
        {IS_STATIC && (
          <p className="muted small">
            Girdiğiniz bilgiler hiçbir sunucuya gönderilmez; yalnızca bu tarayıcı sekmesinde tutulur ve sekme kapanınca
            silinir.
          </p>
        )}
        <button className="btn primary" onClick={accept}>
          Okudum, anladım
        </button>
      </div>
    </div>
  );
}

function DisclaimerText() {
  return (
    <ul className="disclaimer-list">
      {DISCLAIMER_FULL.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}
