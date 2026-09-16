import { AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NumericKeypadProvider, NumericInput } from './NumericKeypad';

// Arqueo y cuadratura de cierre. Se abre desde el menú de inicio del vendedor.
// El contenido del formulario es el mismo que antes vivía dentro del POS (SalesView);
// solo cambió de lugar el disparador.
const TurnClosingModal = ({ open, turn, onClose, onClosed }) => {
  const [denominations, setDenominations] = useState([]);
  const [closingQuantities, setClosingQuantities] = useState({});
  const [expectedSummary, setExpectedSummary] = useState([]);
  const [realDebit, setRealDebit] = useState('');
  const [realCredit, setRealCredit] = useState('');
  const [realTransfer, setRealTransfer] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittingClose, setSubmittingClose] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !turn) return;

    setError('');
    setRealDebit('');
    setRealCredit('');
    setRealTransfer('');
    setLoading(true);

    Promise.all([
      fetch('/api/turn/denominations').then(async res => {
        if (!res.ok) throw new Error('No fue posible cargar las denominaciones.');
        return res.json();
      }),
      fetch(`/api/turn/summary?idTurno=${turn.idTurno}`).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || 'No fue posible obtener el resumen del turno.');
        return data;
      })
    ])
      .then(([denoms, summary]) => {
        setDenominations(denoms);
        setClosingQuantities(Object.fromEntries(denoms.map(d => [d.idDenominacion, ''])));
        setExpectedSummary(summary);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, turn]);

  if (!open || !turn) return null;

  const calcRealCash = Object.keys(closingQuantities).reduce((acc, id) => {
    const denom = denominations.find(d => d.idDenominacion === parseInt(id));
    return acc + ((parseInt(closingQuantities[id]) || 0) * (denom?.valor || 0));
  }, 0);

  const handleCloseShiftSubmit = async (e) => {
    e.preventDefault();
    if (submittingClose) return;
    setError('');
    setSubmittingClose(true);

    const desgloseEfectivo = Object.keys(closingQuantities)
      .map(id => ({
        idDenominacion: parseInt(id),
        cantidad: parseInt(closingQuantities[id]) || 0
      }))
      .filter(item => item.cantidad > 0);

    const desgloseOtrosMetodos = [
      { idMetodoPago: 2, montoReal: parseInt(realDebit) || 0 },
      { idMetodoPago: 3, montoReal: parseInt(realCredit) || 0 },
      { idMetodoPago: 4, montoReal: parseInt(realTransfer) || 0 }
    ];

    try {
      const res = await fetch('/api/turn/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idTurno: turn.idTurno,
          desgloseEfectivo,
          desgloseOtrosMetodos,
          observacionCierre: null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al cerrar el turno');
      }

      window.dispatchEvent(new CustomEvent('turn-status-changed'));
      onClosed?.(data);
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmittingClose(false);
    }
  };

  return (
    <NumericKeypadProvider>
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '720px', padding: '30px' }}>
        <button
          type="button"
          className="btn"
          aria-label="Cerrar"
          style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none', cursor: submittingClose ? 'not-allowed' : 'pointer', opacity: submittingClose ? 0.5 : 1 }}
          disabled={submittingClose}
          onClick={() => { onClose(); setError(''); }}
        >
          <X size={20} color="var(--text-muted)" />
        </button>

        <h3 style={{ fontSize: '1.4rem', marginBottom: '4px', fontWeight: '700' }} className="text-gradient">
          Arqueo y Cuadratura de Cierre
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: '20px' }}>
          Cierre del Turno #{turn.idTurno}. Registre el recuento físico y los montos reales por método de pago.
        </p>

        {error && (
          <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '16px', fontSize: '0.8rem' }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando resumen del turno…</div>
        ) : (
          <form onSubmit={handleCloseShiftSubmit}>
            {/* Columns layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
              {/* Left Column: Cash breakdown */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '10px', color: 'var(--text-main)' }}>
                  💵 Recuento de Efectivo Físico
                </h4>
                <div style={{
                  maxHeight: '280px',
                  overflowY: 'auto',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  {denominations.map(d => (
                    <div key={d.idDenominacion} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-light)',
                      borderRadius: '8px',
                      border: '1px solid var(--panel-border)'
                    }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                        {d.descripcion}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>x</span>
                        <NumericInput
                          ariaLabel={`Cantidad ${d.descripcion}`}
                          fieldId={`cierre-${d.idDenominacion}`}
                          placeholder="0"
                          disabled={submittingClose}
                          value={closingQuantities[d.idDenominacion] || ''}
                          onValueChange={(val) => setClosingQuantities(prev => ({ ...prev, [d.idDenominacion]: val }))}
                          style={{
                            width: '70px',
                            padding: '6px 8px',
                            border: '1px solid var(--panel-border)',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: '700',
                            textAlign: 'center'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Calculated Cash totals */}
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'rgba(0, 77, 38, 0.04)',
                  borderRadius: '8px',
                  border: '1px dashed var(--primary-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary-color)' }}>
                    Efectivo Real Recabado:
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                    ${calcRealCash.toLocaleString('es-CL')}
                  </span>
                </div>
              </div>

              {/* Right Column: Other payment methods */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)' }}>
                  💳 Otros Métodos de Pago
                </h4>

                {/* Expected Cash Info reference */}
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Esperado en Efectivo:</span>
                  <span style={{ fontWeight: '700' }}>
                    ${(expectedSummary.find(s => s.idMetodoPago === 1)?.montoEsperado || 0).toLocaleString('es-CL')}
                  </span>
                </div>

                {/* Debit Input */}
                <div style={{
                  border: '1px solid var(--panel-border)',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#ffffff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700' }}>💳 Tarjeta de Débito:</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Esperado: ${(expectedSummary.find(s => s.idMetodoPago === 2)?.montoEsperado || 0).toLocaleString('es-CL')}
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                    <NumericInput
                      ariaLabel="Monto real Débito"
                      fieldId="cierre-debito"
                      placeholder="Monto real Débito"
                      disabled={submittingClose}
                      value={realDebit}
                      onValueChange={setRealDebit}
                      style={{
                        width: '100%',
                        padding: '6px 8px 6px 20px',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    />
                  </div>
                </div>

                {/* Credit Input */}
                <div style={{
                  border: '1px solid var(--panel-border)',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#ffffff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700' }}>💳 Tarjeta de Crédito:</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Esperado: ${(expectedSummary.find(s => s.idMetodoPago === 3)?.montoEsperado || 0).toLocaleString('es-CL')}
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                    <NumericInput
                      ariaLabel="Monto real Crédito"
                      fieldId="cierre-credito"
                      placeholder="Monto real Crédito"
                      disabled={submittingClose}
                      value={realCredit}
                      onValueChange={setRealCredit}
                      style={{
                        width: '100%',
                        padding: '6px 8px 6px 20px',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    />
                  </div>
                </div>

                {/* Transfer Input */}
                <div style={{
                  border: '1px solid var(--panel-border)',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#ffffff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700' }}>🏦 Transferencia Bancaria:</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Esperado: ${(expectedSummary.find(s => s.idMetodoPago === 4)?.montoEsperado || 0).toLocaleString('es-CL')}
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                    <NumericInput
                      ariaLabel="Monto real Transferencia"
                      fieldId="cierre-transferencia"
                      placeholder="Monto real Transferencia"
                      disabled={submittingClose}
                      value={realTransfer}
                      onValueChange={setRealTransfer}
                      style={{
                        width: '100%',
                        padding: '6px 8px 6px 20px',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: '700'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Global Discrepancy Banner */}
            {(() => {
              const totalExpected = expectedSummary.reduce((acc, curr) => acc + curr.montoEsperado, 0);
              const totalReal = calcRealCash + (parseInt(realDebit) || 0) + (parseInt(realCredit) || 0) + (parseInt(realTransfer) || 0);
              const difference = totalReal - totalExpected;

              return (
                <div style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  backgroundColor: difference === 0 ? '#e6f4ea' : '#fce8e6',
                  border: '1px solid ' + (difference === 0 ? '#c2e7cd' : '#fad2cf'),
                  color: difference === 0 ? '#137333' : '#c5221f',
                  marginBottom: '24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', display: 'block', opacity: 0.8 }}>DIFERENCIA TOTAL DE CAJA:</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>
                      Esperado: ${totalExpected.toLocaleString('es-CL')} • Real: ${totalReal.toLocaleString('es-CL')}
                    </span>
                  </div>
                  <span style={{ fontSize: '1.4rem', fontWeight: '900' }}>
                    {difference > 0 ? '+' : ''}{difference.toLocaleString('es-CL')} CLP
                  </span>
                </div>
              );
            })()}

            {/* Form buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', borderRadius: '10px', cursor: submittingClose ? 'not-allowed' : 'pointer' }}
                disabled={submittingClose}
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: submittingClose ? 'not-allowed' : 'pointer',
                  opacity: submittingClose ? 0.8 : 1,
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444'
                }}
                disabled={submittingClose}
              >
                {submittingClose ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTopColor: '#ffffff',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    <span>Cerrando Caja...</span>
                  </div>
                ) : (
                  'Cerrar Turno Oficialmente'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    </NumericKeypadProvider>
  );
};

export default TurnClosingModal;
