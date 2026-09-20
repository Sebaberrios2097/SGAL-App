import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const NOTIFICATION_EVENT = 'sgal:notification';
const CONFIRMATION_EVENT = 'sgal:confirmation';

const emit = (type, message, options = {}) => {
  if (!message) return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, {
    detail: { type, message: String(message), ...options }
  }));
};

export const notify = {
  success: (message, options) => emit('success', message, options),
  error: (message, options) => emit('error', message, options),
  warning: (message, options) => emit('warning', message, options),
  info: (message, options) => emit('info', message, options)
};

export const confirmDialog = (options) => new Promise(resolve => {
  window.dispatchEvent(new CustomEvent(CONFIRMATION_EVENT, {
    detail: {
      title: 'Confirmar acción',
      message: '',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      tone: 'warning',
      ...options,
      resolve
    }
  }));
});

// Drop-in replacement for transient message state. The exposed value remains
// empty so legacy inline banners disappear while existing setter calls become
// globally visible notifications.
export const useNotificationMessage = (type = 'error') => {
  const show = useCallback(message => {
    if (message) notify[type]?.(message);
  }, [type]);
  return ['', show];
};

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

const TITLES = {
  success: 'Operación exitosa',
  error: 'Ocurrió un error',
  warning: 'Advertencia',
  info: 'Información'
};

const NotificationCenter = () => {
  const [toasts, setToasts] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const recentNotifications = useRef(new Map());

  useEffect(() => {
    const onNotification = ({ detail }) => {
      const fingerprint = `${detail.type}:${detail.message}`;
      const now = Date.now();
      if (now - (recentNotifications.current.get(fingerprint) || 0) < 800) return;
      recentNotifications.current.set(fingerprint, now);
      const id = `${Date.now()}-${Math.random()}`;
      const duration = detail.duration ?? (detail.type === 'error' ? 7000 : 4500);
      setToasts(current => [...current, { id, ...detail, duration }].slice(-4));
      if (duration > 0) window.setTimeout(() => {
        setToasts(current => current.filter(item => item.id !== id));
      }, duration);
    };
    const onConfirmation = ({ detail }) => setConfirmation(detail);
    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    window.addEventListener(CONFIRMATION_EVENT, onConfirmation);
    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, onNotification);
      window.removeEventListener(CONFIRMATION_EVENT, onConfirmation);
    };
  }, []);

  const closeToast = id => setToasts(current => current.filter(item => item.id !== id));
  const answer = result => {
    confirmation?.resolve(result);
    setConfirmation(null);
  };

  return <>
    <div className="notification-stack" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => {
        const Icon = ICONS[toast.type] || Info;
        return <article key={toast.id} className={`app-toast is-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          <span className="app-toast-icon"><Icon size={21} /></span>
          <div><strong>{toast.title || TITLES[toast.type]}</strong><p>{toast.message}</p></div>
          <button type="button" aria-label="Cerrar notificación" onClick={() => closeToast(toast.id)}><X size={17} /></button>
          {toast.duration > 0 && <span className="app-toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />}
        </article>;
      })}
    </div>

    {confirmation && <div className="app-confirm-backdrop" role="presentation" onMouseDown={() => answer(false)}>
      <section className={`app-confirm is-${confirmation.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message" onMouseDown={event => event.stopPropagation()}>
        <div className="app-confirm-icon"><AlertTriangle size={30} /></div>
        <h2 id="app-confirm-title">{confirmation.title}</h2>
        <p id="app-confirm-message">{confirmation.message}</p>
        <div className="app-confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={() => answer(false)}>{confirmation.cancelText}</button>
          <button type="button" className={confirmation.tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => answer(true)} autoFocus>{confirmation.confirmText}</button>
        </div>
      </section>
    </div>}
  </>;
};

export default NotificationCenter;
