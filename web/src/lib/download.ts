/** Bir adresi ya da Blob'u dosya olarak indirir (filename boşsa sunucunun verdiği ad kullanılır) */
export function saveFile(source: string | Blob, filename: string) {
  const href = typeof source === 'string' ? source : URL.createObjectURL(source);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof source !== 'string') setTimeout(() => URL.revokeObjectURL(href), 1000);
}
