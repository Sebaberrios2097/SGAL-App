import { useCallback, useEffect, useState } from 'react';

// Fuente única de disponibilidad de Mercado Pago para Ventas y Caja. La API valida
// que la máquina activa tenga credenciales descifrables y una terminal configurada.
export function usePointAvailability() {
  const [status, setStatus] = useState({ loading: true, available: false, message: '' });

  const refresh = useCallback(async () => {
    setStatus(current => ({ ...current, loading: true }));
    try {
      const res = await fetch('/api/point/availability');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible validar la terminal de pago.');
      setStatus({
        loading: false,
        available: Boolean(data.disponible),
        message: data.mensaje || ''
      });
    } catch (error) {
      setStatus({ loading: false, available: false, message: error.message });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...status, refresh };
}
