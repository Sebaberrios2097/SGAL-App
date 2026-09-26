import React, { useEffect, useState } from 'react';
import { notify } from '../components/NotificationCenter';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  Calendar,
  TrendingUp,
  ShoppingBag,
  BookOpen,
  PlayCircle,
  StopCircle,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Wallet,
  Receipt
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TurnOpeningModal from '../components/TurnOpeningModal';
import TurnClosingModal from '../components/TurnClosingModal';
import { useOrganization } from '../context/OrganizationContext';

const actionPalette = {
  primary: { bg: 'var(--primary-color)', color: '#ffffff', border: 'var(--primary-color)' },
  secondary: { bg: '#ffffff', color: 'var(--text-main)', border: 'var(--panel-border)' },
  danger: { bg: '#ef4444', color: '#ffffff', border: '#ef4444' }
};

const TurnAction = ({ icon: Icon, label, tone = 'secondary', enabled, to, onClick, reason }) => {
  const palette = actionPalette[tone];
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '11px 18px',
    borderRadius: '11px',
    fontWeight: 700,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    border: `1.5px solid ${palette.border}`,
    background: palette.bg,
    color: palette.color,
    textDecoration: 'none',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    flex: '1 1 auto',
    minWidth: '160px'
  };
  const content = <><Icon size={17} />{label}</>;

  if (!enabled) {
    return <button type="button" disabled title={reason} style={style}>{content}</button>;
  }
  if (to) {
    return <Link to={to} style={style}>{content}</Link>;
  }
  return <button type="button" onClick={onClick} style={style}>{content}</button>;
};

const Turn = () => {
  const { user, can } = useAuth();
  const { isModuleEnabled, turnsRequireReconciliation, cajaRequireReconciliation } = useOrganization();
  const salesEnabled = isModuleEnabled('ventas');
  const cajaEnabled = isModuleEnabled('caja');
  const canOperateCaja = cajaEnabled && can('caja.operar');
  // El turno es transversal. Si el usuario opera Caja, aplica la configuración de
  // cuadratura de Caja; un vendedor sin acceso a Caja conserva la regla del POS.
  const turnRequiresReconciliation = canOperateCaja
    ? cajaRequireReconciliation
    : turnsRequireReconciliation && !cajaEnabled;
  const logbookEnabled = salesEnabled;
  const [lastTurn, setLastTurn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTurnInfo, setActiveTurnInfo] = useState({ hasActiveTurn: false, belongsToCurrentUser: false });
  const [showOpening, setShowOpening] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [directAction, setDirectAction] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const employeeName = user?.empleado
    ? (user.empleado.alias?.trim() || `${user.empleado.nombres} ${user.empleado.apellido1}`)
    : user?.nombreUsuario || 'Usuario';

  const canOperateTurns = user?.permissions?.some(p =>
    p.startsWith('turnos.') || p.startsWith('caja.')
      || (logbookEnabled && p.startsWith('bitacora.')) || (salesEnabled && p.startsWith('ventas.')));
  const canOpenTurn = can('turnos.abrir') || can('caja.turno.abrir');
  const canCloseTurn = can('turnos.cerrar') || can('caja.turno.cerrar');

  useEffect(() => {
    document.title = `Turno - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
  }, []);

  useEffect(() => {
    if (canOperateTurns && user?.idUsuario) {
      setLoading(true);
      Promise.all([
        fetch(`/api/turn/last?idUsuario=${user.idUsuario}`).then(res => {
          if (!res.ok) throw new Error('Error al obtener el último turno');
          return res.json();
        }),
        fetch(`/api/turn/active?idUsuario=${user.idUsuario}`).then(res => res.json())
      ])
        .then(([data, activeData]) => {
          setActiveTurnInfo(activeData);
          if (data.hasLastTurn) {
            setLastTurn(data.turnInfo);
          } else {
            setLastTurn(false);
          }
        })
        .catch(err => {
          console.error(err);
          setLastTurn(false);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [canOperateTurns, user, refreshToken]);

  const belongsToUser = activeTurnInfo.belongsToCurrentUser;
  const cajaOcupada = activeTurnInfo.hasActiveTurn && !belongsToUser;
  const sinTurno = !activeTurnInfo.hasActiveTurn;

  const status = belongsToUser
    ? { text: `Turno activo · #${activeTurnInfo.activeTurn?.idTurno}`, bg: '#e6f4ea', color: '#137333', border: '#ceead6' }
    : cajaOcupada
      ? { text: `Caja ocupada por ${activeTurnInfo.activeTurn?.nombreUsuario}`, bg: '#fef7e0', color: '#a16207', border: '#fde68a' }
      : { text: 'Sin turno activo', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };

  const startReason = cajaOcupada ? 'La caja está ocupada por otro usuario.' : 'Ya tienes un turno activo.';
  const openReason = cajaOcupada ? 'La caja está ocupada por otro usuario.' : 'Inicia tu turno para usar esta opción.';

  const runTurnActionWithoutReconciliation = async (action) => {
    if (directAction) return;
    setDirectAction(true);
    try {
      const response = await fetch(`/api/turn/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'open'
          ? { idUsuario: user.idUsuario, desglose: [] }
          : { idTurno: activeTurnInfo.activeTurn.idTurno, desgloseEfectivo: [], desgloseOtrosMetodos: [] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || `No fue posible ${action === 'open' ? 'iniciar' : 'cerrar'} el turno.`);
      window.dispatchEvent(new CustomEvent('turn-status-changed', { detail: data }));
      notify.success(action === 'open' ? 'Turno iniciado correctamente.' : 'Turno cerrado correctamente.');
      setRefreshToken(value => value + 1);
    } catch (error) {
      notify.error(error.message);
    } finally {
      setDirectAction(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Compact header + actions */}
      <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
              Hola, {employeeName}
            </h2>
          </div>
          <span style={{
            padding: '6px 14px',
            borderRadius: '30px',
            fontSize: '0.8rem',
            fontWeight: 700,
            backgroundColor: status.bg,
            color: status.color,
            border: `1.5px solid ${status.border}`,
            whiteSpace: 'nowrap'
          }}>
            {status.text}
          </span>
        </div>

        {canOperateTurns && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid var(--panel-border)', paddingTop: '18px' }}>
            {canOpenTurn && (
              <TurnAction icon={PlayCircle} label="Iniciar turno" tone="primary"
                enabled={sinTurno && !directAction} onClick={() => turnRequiresReconciliation ? setShowOpening(true) : runTurnActionWithoutReconciliation('open')} reason={startReason} />
            )}
            {salesEnabled && can('ventas.operar') && (
              <TurnAction icon={ShoppingBag} label="Ir a Ventas" tone={belongsToUser ? 'primary' : 'secondary'}
                enabled={belongsToUser} to="/sales" reason={openReason} />
            )}
            {canOperateCaja && (
              <TurnAction icon={Receipt} label="Ir a Caja" tone={belongsToUser ? 'primary' : 'secondary'}
                enabled={belongsToUser} to="/cash-register" reason={openReason} />
            )}
            {logbookEnabled && can('bitacora.propia.ver') && (
              <TurnAction icon={BookOpen} label="Bitácora" tone="secondary"
                enabled={belongsToUser} to={`/logbook/${activeTurnInfo.activeTurn?.idTurno}`} reason={openReason} />
            )}
            {can('turnos.propios.ver') && (
              <TurnAction icon={Wallet} label="Mis consumos" tone="secondary"
                enabled to="/turn/consumptions" />
            )}
            {canCloseTurn && (
              <TurnAction icon={StopCircle} label="Cerrar turno" tone="danger"
                enabled={belongsToUser && !directAction} onClick={() => turnRequiresReconciliation ? setShowClosing(true) : runTurnActionWithoutReconciliation('close')} reason="No tienes un turno abierto para cerrar." />
            )}
          </div>
        )}
      </div>

      {!canOperateTurns ? (
        <div className="card" style={{
          padding: '30px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}>
          <HelpCircle size={28} style={{ opacity: 0.4 }} />
          <span>Tu rol no tiene acceso a la gestión de turnos.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Clock size={19} color="var(--primary-color)" />
            Resumen del último turno
          </h3>

          {loading ? (
            <div className="card" style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                border: '4px solid rgba(var(--primary-rgb), 0.1)',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                borderLeftColor: 'var(--primary-color)',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
          ) : lastTurn === false ? (
            <div className="card" style={{
              padding: '30px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}>
              <HelpCircle size={28} style={{ opacity: 0.4 }} />
              <span>Aún no registras turnos de venta en el sistema.</span>
            </div>
          ) : lastTurn ? (
            <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Header: Turn ID & Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    Turno #{lastTurn.idTurno}
                  </h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Código de registro del turno de caja
                  </span>
                </div>

                {/* Status Badges */}
                {lastTurn.idEstadoTurno === 1 && (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '30px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    backgroundColor: '#e6f4ea',
                    color: '#137333',
                    border: '1.5px solid #ceead6'
                  }}>
                    ● Activo / Abierto
                  </span>
                )}
                {lastTurn.idEstadoTurno === 2 && (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '30px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    backgroundColor: '#e8f0fe',
                    color: '#1a73e8',
                    border: '1.5px solid #d2e3fc'
                  }}>
                    {lastTurn.diferenciaTotal === null ? '✓ Cerrado sin cuadratura' : '✓ Cerrado y cuadrado'}
                  </span>
                )}
                {lastTurn.idEstadoTurno === 3 && (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '30px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    backgroundColor: '#fce8e6',
                    color: '#c5221f',
                    border: '1.5px solid #fad2cf',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <AlertCircle size={14} />
                    Cerrado con Descuadre
                  </span>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }} />

              {/* Grid: Stats & Information */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '20px'
              }}>
                {/* Dates & Times */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Calendar size={18} color="var(--primary-color)" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>APERTURA</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                        {new Date(lastTurn.fechaApertura).toLocaleDateString('es-CL')} - {new Date(lastTurn.fechaApertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={18} color="var(--primary-color)" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>CIERRE</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                        {lastTurn.fechaCierre
                          ? `${new Date(lastTurn.fechaCierre).toLocaleDateString('es-CL')} - ${new Date(lastTurn.fechaCierre).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Turno en curso'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sales Totals */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                  <TrendingUp size={28} color="var(--primary-color)" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>TOTAL PROCESADO</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                      ${lastTurn.totalSales.toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>

                {/* Sales Count & Discrepancies */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifySelf: 'center', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-main)' }}>
                    <ShoppingBag size={16} color="var(--text-muted)" />
                    <strong>{lastTurn.salesCount}</strong> ventas registradas
                  </div>

                  {lastTurn.idEstadoTurno !== 1 && lastTurn.diferenciaTotal !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                      <CheckCircle2 size={16} color={lastTurn.diferenciaTotal === 0 ? '#137333' : lastTurn.diferenciaTotal > 0 ? '#1a73e8' : '#c5221f'} />
                      <span>
                        Diferencia: {lastTurn.diferenciaTotal === 0 ? (
                          <strong style={{ color: '#137333' }}>Cuadrado (+$0)</strong>
                        ) : lastTurn.diferenciaTotal > 0 ? (
                          <strong style={{ color: '#1a73e8' }}>Sobrante (+${lastTurn.diferenciaTotal.toLocaleString('es-CL')})</strong>
                        ) : (
                          <strong style={{ color: '#c5221f' }}>Faltante (-${Math.abs(lastTurn.diferenciaTotal).toLocaleString('es-CL')})</strong>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <TurnOpeningModal
        open={showOpening}
        onClose={() => setShowOpening(false)}
        onOpened={() => setRefreshToken(value => value + 1)}
      />
      <TurnClosingModal
        open={showClosing}
        turn={activeTurnInfo.activeTurn}
        onClose={() => setShowClosing(false)}
        onClosed={() => setRefreshToken(value => value + 1)}
      />
    </div>
  );
};

export default Turn;
