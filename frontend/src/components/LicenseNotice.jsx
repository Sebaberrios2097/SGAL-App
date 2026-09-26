import { AlertTriangle, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Muestra el estado de la licencia: un banner durante el período de prueba y una pantalla de
 * bloqueo cuando la licencia no otorga acceso. No renderiza nada si el licenciamiento está apagado.
 */
const LicenseNotice = () => {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch('/api/license/status')
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(() => {});
    load();
    const handleBlocked = event => setInfo(current => ({
      ...(current || {}), enabled: true, acceso: false, status: event.detail?.status || current?.status || 'unknown'
    }));
    window.addEventListener('sgal:license-blocked', handleBlocked);
    // Revalida cada 10 minutos para reflejar cambios (expiración, reactivación).
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('sgal:license-blocked', handleBlocked); };
  }, []);

  if (!info || !info.enabled) return null;

  if (!info.acceso) {
    const motivo = info.status === 'expired'
      ? 'Tu licencia o período de prueba ha expirado.'
      : info.status === 'suspended'
        ? 'Tu licencia está suspendida.'
        : 'No pudimos validar tu licencia.';
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15,23,42,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', maxWidth: 460, width: '100%', padding: '32px 28px', borderRadius: 10, textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>
          <Lock size={42} color="#b91c1c" />
          <h2 style={{ margin: '14px 0 8px', fontSize: 20 }}>Licencia inactiva</h2>
          <p style={{ color: '#475569', lineHeight: 1.5, margin: 0 }}>{motivo} Contacta al proveedor para reactivar el servicio.</p>
        </div>
      </div>
    );
  }

  if (info.status === 'trial' && info.licenseExpiresAt) {
    const dias = Math.max(0, Math.ceil((new Date(info.licenseExpiresAt) - new Date()) / 86400000));
    return (
      <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={16} />
        {dias === 0 ? 'Tu período de prueba termina hoy.' : dias === 1 ? 'Período de prueba: te queda 1 día.' : `Período de prueba: te quedan ${dias} días.`}
      </div>
    );
  }

  return null;
};

export default LicenseNotice;
