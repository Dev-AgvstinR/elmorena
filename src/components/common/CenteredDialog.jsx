import { useEffect, useRef } from 'react';

export default function CenteredDialog({ title, busy = false, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={ref} className="daily-menu-dialog" aria-label={title} onCancel={(event) => {
    event.preventDefault();
    if (!busy && !ref.current.querySelector('fieldset:disabled')) onClose();
  }}>{children}</dialog>;
}
