/** GitHub Pages sürümü: sunucu yok, veriler yalnızca tarayıcı sekmesinde tutulur */
export const IS_STATIC = import.meta.env.MODE === 'static';

/**
 * Tarayıcı deposu. GitHub Pages sürümünde sessionStorage: sayfa yenilenince kalır, sekme kapanınca silinir.
 * Depolama kapalıysa (gizli mod vb.) null.
 */
function pick(): Storage | null {
  try {
    return IS_STATIC ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

const storage = pick();

export function readItem<T>(key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama kapalıysa ya da doluysa yoksay */
  }
}
