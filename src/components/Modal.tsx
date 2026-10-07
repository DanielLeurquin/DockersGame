import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={onClose}><header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={22} /></button></header>{children}</dialog>;
}
