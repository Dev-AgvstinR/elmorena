import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { dismissNotification, getNotifications, subscribeNotifications } from '../../utils/notifications';
import Icon from './Icon';

export default function Notifications() {
  const messages = useSyncExternalStore(subscribeNotifications, getNotifications);
  const [target, setTarget] = useState(document.body);
  useEffect(() => {
    // Los diálogos modales están encima del resto de la página: el aviso debe
    // pertenecer al diálogo activo para seguir visible y accesible.
    const update = () => setTarget([...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    update();
    return () => observer.disconnect();
  }, []);
  return createPortal(<div className="toast-stack" aria-label="Notificaciones">
    {messages.map((item) => <div key={item.id} role={item.type === 'error' ? 'alert' : 'status'} className={`toast toast-${item.type}`}>
      <Icon name={item.type === 'error' ? 'cancel' : 'check'} />
      <p>{item.message}</p>
      <button type="button" aria-label="Cerrar notificación" onClick={() => dismissNotification(item.id)}><Icon name="cancel" /></button>
    </div>)}
  </div>, target);
}
