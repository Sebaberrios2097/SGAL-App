import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Coffee, 
  Sparkles,
  Calendar,
  Clock,
  TrendingUp,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TurnOpeningModal from '../components/TurnOpeningModal';
import AdminDashboard from './AdminDashboard';

const Welcome = () => {
  const { user } = useAuth();
  const [lastTurn, setLastTurn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTurnInfo, setActiveTurnInfo] = useState({ hasActiveTurn: false, belongsToCurrentUser: false });
  const [showOpening, setShowOpening] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  
  const employeeName = user?.empleado 
    ? `${user.empleado.nombres} ${user.empleado.apellido1}`
    : user?.nombreUsuario || 'Usuario';
    
  const isBarista = user?.roles?.some(r => r.toUpperCase() === 'BARISTA/VENDEDOR' || r.toUpperCase() === 'VENDEDOR/BARISTA');
  const isAdmin = user?.roles?.some(r => r.toUpperCase() === 'ADMINISTRADOR');
  const userRolesText = user?.roles && user.roles.length > 0 
    ? user.roles.join(', ') 
    : 'Sin Roles';

  useEffect(() => {
    if (isBarista && user?.idUsuario) {
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
  }, [isBarista, user, refreshToken]);

  if (isAdmin) return <AdminDashboard />;

  return (
    <div className="animate-fade-in" style={{ padding: '10px 0' }}>
      {/* Hero Welcome Panel */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary-color) 0%, #00361a 100%)',
        borderRadius: '20px',
        padding: '40px',
        color: '#ffffff',
        marginBottom: isBarista ? '36px' : '0px',
        boxShadow: '0 10px 30px rgba(0, 76, 37, 0.15)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative elements */}
        <div style={{
          position: 'absolute',
          right: '-5%',
          bottom: '-10%',
          width: '260px',
          height: '260px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
          borderRadius: '50%'
        }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Sparkles size={20} color="#fbbf24" />
          <span style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.8)' }}>
            Panel de Inicio
          </span>
        </div>
        
        <h2 style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '12px', lineHeight: '1.2' }}>
          ¡Hola, {employeeName}!
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'rgba(255, 255, 255, 0.9)', maxWidth: '600px', lineHeight: '1.6', marginBottom: '8px' }}>
          Te damos la bienvenida al sistema de gestión de <strong>Siete Vidas</strong>. Desde aquí podrás acceder a tus herramientas autorizadas según tu rol.
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.1)', padding: '6px 14px', borderRadius: '30px', fontSize: '0.85rem', fontWeight: '600' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          Rol activo: {userRolesText}
        </div>
      </div>

      {/* Barista Last Shift Information */}
      {isBarista && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>
                {activeTurnInfo.belongsToCurrentUser ? 'Turno activo' : activeTurnInfo.hasActiveTurn ? 'Caja ocupada' : 'Inicie su turno'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                {activeTurnInfo.belongsToCurrentUser
                  ? `Turno #${activeTurnInfo.activeTurn?.idTurno}. Ya puede acceder a Ventas y Bitácora.`
                  : activeTurnInfo.hasActiveTurn
                    ? `Existe un turno abierto por ${activeTurnInfo.activeTurn?.nombreUsuario}.`
                    : 'Realice aquí la cuadratura inicial para habilitar sus herramientas de trabajo.'}
              </p>
            </div>
            {activeTurnInfo.belongsToCurrentUser ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <Link className="btn btn-primary" to="/sales" style={{ textDecoration: 'none' }}>Ir a Ventas</Link>
                <Link className="btn btn-secondary" to={`/logbook/${activeTurnInfo.activeTurn?.idTurno}`} style={{ textDecoration: 'none' }}>Abrir Bitácora</Link>
              </div>
            ) : (
              <button className="btn btn-primary" disabled={activeTurnInfo.hasActiveTurn} onClick={() => setShowOpening(true)}>
                Iniciar turno
              </button>
            )}
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Coffee size={20} color="var(--primary-color)" />
            Resumen del Último Turno
          </h3>

          {loading ? (
            <div className="card" style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                border: '4px solid rgba(0, 76, 37, 0.1)',
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
                    ✓ Cerrado y Cuadrado
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

                  {lastTurn.idEstadoTurno !== 1 && (
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
  </div>
  );
};

export default Welcome;
