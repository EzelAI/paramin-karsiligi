/** Gezinme simgeleri: 24px, çizgi kalınlığı 1.75, metin rengini alır */
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Aldıklarım: ödenmiş makbuz */
export const IconReceipt = () => (
  <svg {...base}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

/** Alacaklarım: alışveriş etiketi */
export const IconTag = () => (
  <svg {...base}>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8.5" r="1.25" />
  </svg>
);

/** Fiyatlar */
export const IconPulse = () => (
  <svg {...base}>
    <path d="M3 17l5-6 4 4 4-7 5 5" />
    <path d="M3 21h18" />
  </svg>
);

/** Ayarlar (varsayımlar) */
export const IconSliders = () => (
  <svg {...base}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

export const IconMore = () => (
  <svg {...base}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base} width={18} height={18}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
