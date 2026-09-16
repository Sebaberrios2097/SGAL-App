import {
    ChevronRight,
    BookOpen,
    CalendarDays,
    ClipboardList,
    ChevronDown,
    Coffee,
    FlaskConical,
    Gift,
    Home,
    Lock,
    LogOut,
    ShieldAlert,
    ShoppingBag,
    Ruler,
    Settings,
    Stamp,
    Tags,
    Users
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);
  const isSettingsRoute = location.pathname.startsWith('/settings/') || location.pathname === '/roles';
  const [settingsOpen, setSettingsOpen] = useState(() => isSettingsRoute);
  const isAdmin = user?.roles?.some(r => r.toUpperCase() === 'ADMINISTRADOR');
  const isBarista = user?.roles?.some(r => r.toUpperCase() === 'BARISTA/VENDEDOR' || r.toUpperCase() === 'VENDEDOR/BARISTA');

  const [activeTurnInfo, setActiveTurnInfo] = useState({ hasActiveTurn: false, belongsToCurrentUser: false });

  useEffect(() => {
    if (isSettingsRoute) setSettingsOpen(true);
  }, [isSettingsRoute]);

  useEffect(() => {
    const refreshTurn = () => {
      if (!user || !isBarista) return;
      if (user && isBarista) {
        fetch(`/api/turn/active?idUsuario=${user.idUsuario}`)
        .then(res => res.json())
        .then(setActiveTurnInfo)
        .catch(err => console.error(err));
      }
    };
    refreshTurn();
    window.addEventListener('turn-status-changed', refreshTurn);
    return () => window.removeEventListener('turn-status-changed', refreshTurn);
  }, [user, isBarista, location.pathname]);

  const isLogoutBlocked = activeTurnInfo.hasActiveTurn && activeTurnInfo.belongsToCurrentUser;

  const handleLogout = () => {
    if (isLogoutBlocked) {
      alert('No puede cerrar sesión mientras tenga un turno abierto. Por favor, finalice su turno en la pantalla de ventas.');
      return;
    }
    logout();
    navigate('/login');
  };

  const navItemsModule1 = [
    {
      label: 'Usuarios',
      path: '/users',
      icon: Users,
      module: 1
    }
  ];

  const navItemsModule2 = [
    {
      label: 'Inventario',
      path: '/inventory',
      icon: Coffee,
      module: 2
    },
    {
      label: 'Recetas',
      path: '/recipes',
      icon: ClipboardList,
      module: 2
    },
    {
      label: 'Registros de turnos',
      path: '/admin/turn-records',
      icon: CalendarDays,
      module: 2
    }
  ];

  const renderNavItem = (item) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    return (
      <Link
        key={item.path}
        to={item.path}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: '10px',
          color: isActive ? 'var(--primary-color)' : '#ffffff',
          backgroundColor: isActive ? '#ffffff' : 'transparent',
          textDecoration: 'none',
          fontWeight: '600',
          fontSize: '0.95rem',
          transition: 'all 0.2s ease',
          boxShadow: isActive ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none'
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = '#00361a';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Icon size={18} />
        <span style={{ flex: 1 }}>{item.label}</span>
        <ChevronRight size={14} style={{ opacity: isActive ? 1 : 0.4 }} />
      </Link>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar - Green Background */}
      <aside style={{
        width: 'var(--sidebar-width)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '0',
        border: 'none',
        padding: '24px 16px',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--primary-color)', /* Green #004c25 */
        boxShadow: '4px 0 24px rgba(0, 76, 37, 0.15)',
        color: '#ffffff',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
        {/* Brand */}
        <div style={{
          display: 'flex',
          justifyContent: logoError ? 'flex-start' : 'center',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          paddingLeft: logoError ? '8px' : '0',
          width: '100%',
          height: '60px'
        }}>
          {!logoError ? (
            <img
              src="/logo_sidebar.png"
              alt="Siete Vidas Logo"
              onError={() => setLogoError(true)}
              style={{ maxWidth: '90%', maxHeight: '60px', objectFit: 'contain' }}
            />
          ) : (
            <>
              <div style={{
                background: '#ffffff', /* White background for logo */
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)'
              }}>
                <Coffee size={22} color="var(--primary-color)" /> /* Green cup */
              </div>
              <div>
                <h1 style={{
                  fontSize: '1.25rem',
                  fontWeight: '800',
                  letterSpacing: '0.02em',
                  color: '#ffffff' /* White text */
                }}>Siete Vidas</h1>
                <span style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.7)', /* Light white/opacity text */
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>Logística</span>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              color: location.pathname === '/' ? 'var(--primary-color)' : '#ffffff',
              backgroundColor: location.pathname === '/' ? '#ffffff' : 'transparent',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '0.95rem',
              transition: 'all 0.2s ease',
              boxShadow: location.pathname === '/' ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none',
              marginBottom: '8px'
            }}
            onMouseEnter={(e) => {
              if (location.pathname !== '/') e.currentTarget.style.backgroundColor = '#00361a';
            }}
            onMouseLeave={(e) => {
              if (location.pathname !== '/') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Home size={18} />
            <span style={{ flex: 1 }}>Inicio</span>
            <ChevronRight size={14} style={{ opacity: location.pathname === '/' ? 1 : 0.4 }} />
          </Link>

          {isBarista && (
            activeTurnInfo.hasActiveTurn ? (
              activeTurnInfo.belongsToCurrentUser ? (
                <div style={{ display: 'grid', gap: '8px', marginBottom: '8px' }}>
                  {renderNavItem({ label: 'Ventas', path: '/sales', icon: ShoppingBag })}
                  {renderNavItem({ label: 'Bitácora', path: `/logbook/${activeTurnInfo.activeTurn?.idTurno}`, icon: BookOpen })}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontWeight: '700',
                    marginTop: '4px',
                    marginBottom: '12px',
                    cursor: 'not-allowed',
                    fontSize: '0.85rem',
                    textAlign: 'center'
                  }}
                  title={`Caja ocupada por ${activeTurnInfo.activeTurn?.nombreUsuario}`}
                >
                  <Lock size={16} />
                  <span>Turno ocupado</span>
                </div>
              )
            ) : null
          )}

          {isBarista && renderNavItem({ label: 'Historial de turnos', path: '/turn-history', icon: CalendarDays })}

          {isAdmin && (
            <>
              {navItemsModule1.map((item) => renderNavItem(item))}
              {navItemsModule2.map((item) => renderNavItem(item))}
              <button
                type="button"
                onClick={() => setSettingsOpen(open => !open)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  borderRadius: '10px', border: 'none', color: isSettingsRoute ? 'var(--primary-color)' : '#ffffff', background: isSettingsRoute ? '#ffffff' : 'transparent',
                  font: 'inherit', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', width: '100%'
                }}
              >
                <Settings size={18} /><span style={{ flex: 1, textAlign: 'left' }}>Configuraciones</span>
                <ChevronDown size={15} style={{ transform: settingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {settingsOpen && (
                <div style={{ display: 'grid', gap: '4px', marginLeft: '12px', paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,.25)' }}>
                  {renderNavItem({ label: 'Roles', path: '/roles', icon: ShieldAlert })}
                  {renderNavItem({ label: 'Productos de cortesía', path: '/settings/courtesy', icon: Gift })}
                  {renderNavItem({ label: 'Materias primas', path: '/settings/raw-materials', icon: FlaskConical })}
                  {renderNavItem({ label: 'Unidades de medida', path: '/settings/units', icon: Ruler })}
                  {renderNavItem({ label: 'Categorías de materia', path: '/settings/material-categories', icon: Tags })}
                  {renderNavItem({ label: 'Marcas', path: '/settings/brands', icon: Stamp })}
                </div>
              )}
            </>
          )}
        </nav>
      </div>

        {/* User Card */}
        {user && (
          <div style={{
            padding: '16px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: 'rgba(0, 0, 0, 0.15)', /* Dark overlay for user card */
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{
                fontWeight: '700',
                fontSize: '0.9rem',
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario}
              </span>
              <span style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '4px'
              }}>
                {user.nombreUsuario}
              </span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {user.roles && user.roles.map((r, i) => (
                  <span key={i} className="badge" style={{
                    fontSize: '0.65rem',
                    padding: '2px 8px',
                    textTransform: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }}>
                    {r}
                  </span>
                ))}
              </div>
            </div>

            <button onClick={handleLogout} className="btn btn-danger" style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.85rem',
              borderRadius: '8px',
              backgroundColor: isLogoutBlocked ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.2)',
              border: isLogoutBlocked ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(239, 68, 68, 0.4)',
              color: isLogoutBlocked ? 'rgba(255, 255, 255, 0.3)' : '#fca5a5',
              cursor: isLogoutBlocked ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              if (!isLogoutBlocked) {
                e.currentTarget.style.backgroundColor = '#ef4444';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLogoutBlocked) {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.color = '#fca5a5';
              }
            }}
            >
              <LogOut size={14} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        )}
      </aside>

      {/* Page Content wrapper */}
      <main className="main-content" style={{ marginLeft: 'var(--sidebar-width)', width: 'calc(100% - var(--sidebar-width))' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
