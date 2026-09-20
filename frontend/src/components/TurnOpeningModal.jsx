import { AlertCircle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { NumericKeypadProvider, NumericInput } from './NumericKeypad';
import { notify, useNotificationMessage } from './NotificationCenter';

const TurnOpeningModal = ({ open, onClose, onOpened, tipoTurno = 1, title = 'Iniciar turno' }) => {
  const { user } = useAuth();
  const [denominations, setDenominations] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useNotificationMessage('error');

  useEffect(() => {
    if (!open) return;

    setError('');
    setLoading(true);
    fetch('/api/turn/denominations')
      .then(async res => {
        if (!res.ok) throw new Error('No fue posible cargar las denominaciones.');
        return res.json();
      })
      .then(data => {
        setDenominations(data);
        setQuantities(Object.fromEntries(data.map(d => [d.idDenominacion, ''])));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open]);

  const total = useMemo(() => denominations.reduce(
    (sum, denomination) => sum + denomination.valor * (parseInt(quantities[denomination.idDenominacion]) || 0),
    0
  ), [denominations, quantities]);

  if (!open) return null;

  const handleSubmit = async event => {
    event.preventDefault();
    if (submitting) return;

    const desglose = denominations
      .map(d => ({
        idDenominacion: d.idDenominacion,
        cantidad: parseInt(quantities[d.idDenominacion]) || 0
      }))
      .filter(item => item.cantidad > 0);

    if (desglose.length === 0) {
      setError('Debe especificar al menos una cantidad para iniciar el turno.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/turn/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario, tipoTurno, desglose })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible iniciar el turno.');

      window.dispatchEvent(new CustomEvent('turn-status-changed', { detail: data }));
      notify.success('Turno iniciado correctamente.');
      onOpened?.(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <NumericKeypadProvider>
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '440px', padding: '24px' }}>
        <button
          type="button"
          className="btn"
          aria-label="Cerrar"
          disabled={submitting}
          onClick={onClose}
          style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }}
        >
          <X size={20} color="var(--text-muted)" />
        </button>

        <h3 className="text-solid" style={{ fontSize: '1.3rem', marginBottom: '8px', fontWeight: '700' }}>
          {title}
        </h3>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: '16px' }}>Ingrese el efectivo inicial.</div>

        {error && (
          <div className="badge badge-danger" style={{ display: 'flex', gap: '6px', padding: '8px 12px', marginBottom: '12px', textTransform: 'none' }}>
            <AlertCircle size={14} /><span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando denominaciones…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {denominations.map(d => (
                <label key={d.idDenominacion} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingBottom: '6px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>{d.descripcion}</span>
                  <NumericInput
                    ariaLabel={d.descripcion}
                    fieldId={`apertura-${d.idDenominacion}`}
                    value={quantities[d.idDenominacion] ?? ''}
                    onValueChange={val => setQuantities(current => ({ ...current, [d.idDenominacion]: val }))}
                    style={{ width: '100px', padding: '6px 8px', border: '1px solid var(--panel-border)', borderRadius: '6px', textAlign: 'center' }}
                  />
                </label>
              ))}
            </div>

            <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <strong style={{ fontSize: '0.82rem', color: '#166534' }}>Monto de apertura</strong>
              <strong style={{ fontSize: '1.15rem', color: '#15803d' }}>${total.toLocaleString('es-CL')}</strong>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1 }}>
                {submitting ? 'Iniciando…' : 'Iniciar turno'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    </NumericKeypadProvider>
  );
};

export default TurnOpeningModal;
