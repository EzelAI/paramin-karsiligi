import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconMore } from './Icons';

interface Props {
  title: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** Yeniden adlandır ve Sil dışındaki işlemler */
  actions?: ReactNode;
}

/**
 * Sayfa başlığı ve işlemleri. Geniş ekranda düğmeler yan yana, dar ekranda "⋯" menüsünde.
 * Başlığa çift tıklayarak ya da menüden yeniden adlandırılır.
 */
export function PageHeader({ title, onRename, onDelete, actions }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menü dışına dokununca ya da Esc ile kapanır
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const startEdit = () => {
    setName(title);
    setEditing(true);
    setMenuOpen(false);
  };
  const save = () => {
    if (name.trim() && name.trim() !== title) onRename(name.trim());
    setEditing(false);
  };

  const buttons = (
    <>
      {actions}
      <button className="btn ghost" onClick={startEdit}>
        Yeniden adlandır
      </button>
      <button className="btn danger-ghost" onClick={() => (setMenuOpen(false), onDelete())}>
        Sil
      </button>
    </>
  );

  return (
    <header className="page-head">
      {editing ? (
        <input
          className="title-input"
          aria-label="Ad"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && setEditing(false))}
        />
      ) : (
        <h1 className="page-title" onDoubleClick={startEdit} title="Yeniden adlandırmak için çift tıklayın">
          {title}
        </h1>
      )}
      <div className="page-actions">{buttons}</div>
      <div className="page-menu" ref={menuRef}>
        <button
          className="icon-btn menu-btn"
          aria-label="Diğer işlemler"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <IconMore />
        </button>
        {menuOpen && (
          <div className="menu-pop" role="menu" onClick={(e) => (e.target as HTMLElement).closest('button') && setMenuOpen(false)}>
            {buttons}
          </div>
        )}
      </div>
    </header>
  );
}
