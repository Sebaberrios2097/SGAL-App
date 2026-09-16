import {
    BarChart3,
    BookOpen,
    Boxes,
    CalendarDays,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    Clock,
    Coffee,
    Gift,
    Layers,
    LayoutDashboard,
    Lock,
    LogOut,
    Menu,
    Palette,
    Puzzle,
    Ruler,
    ShieldAlert,
    ShoppingBag,
    Sparkles,
    Stamp,
    Tags,
    Truck,
    Users,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './BrandLogo';

const Layout = () => {
  const { user, logout, can, canAny } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const canOperateTurns = canAny('turnos.propios.ver', 'turnos.abrir', 'turnos.cerrar', 'ventas.operar', 'bitacora.propia.ver');

  const [activeTurnInfo, setActiveTurnInfo] = useState({ hasActiveTurn: false, belongsToCurrentUser: false });

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 769px)');
    const closeOnDesktop = (event) => {
      if (event.matches) setMobileMenuOpen(false);
    };

    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const refreshTurn = () => {
      if (!user || !canOperateTurns) return;
      if (user && canOperateTurns) {
        fetch(`/api/turn/active?idUsuario=${user.idUsuario}`)
        .then(res => res.json())
        .then(setActiveTurnInfo)
        .catch(err => console.error(err));
      }
    };
    refreshTurn();
    window.addEventListener('turn-status-changed', refreshTurn);
    return () => window.removeEventListener('turn-status-changed', refreshTurn);
  }, [user, canOperateTurns, location.pathname]);

  const isLogoutBlocked = activeTurnInfo.hasActiveTurn && activeTurnInfo.belongsToCurrentUser;

  const handleLogout = async () => {
    if (isLogoutBlocked) {
      alert('No puede cerrar sesión mientras tenga un turno abierto. Por favor, finalice su turno en la pantalla de ventas.');
      return;
    }
    await logout();
    navigate('/login');
  };

  const navItemsModule1 = [
    {
      label: 'Usuarios',
      path: '/employees',
      icon: Users,
      module: 1
    }
  ];

  const navItemsModule2 = [
    {
      label: 'Productos',
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
      label: 'Órdenes de compra',
      path: '/purchase-orders',
      icon: ClipboardCheck,
      module: 2
    },
    {
      label: 'Proveedores',
      path: '/providers',
      icon: Truck,
      module: 2
    },
    {
      label: 'Registros de turnos',
      path: '/admin/turn-records',
      icon: CalendarDays,
      module: 2
    }
  ];

  const renderSectionTitle = (label) => (
    <div
      key={`section-${label}`}
      style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        color: 'rgba(255, 255, 255, 0.55)',
        padding: '0 8px 6px',
        marginTop: '14px',
        marginBottom: '6px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.18)'
      }}
    >
      {label}
    </div>
  );

  const renderNavItem = (item) => {
    const isActive = item.exact
      ? location.pathname === item.path
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    const Icon = item.icon;

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileMenuOpen(false)}
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
          if (!isActive) e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Icon size={18} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{item.label}</span>
        <ChevronRight size={14} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.4 }} />
      </Link>
    );
  };

  return (
    <div className="app-container">
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={mobileMenuOpen}
        aria-controls="app-sidebar"
        onClick={() => setMobileMenuOpen(open => !open)}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-menu-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Green Background */}
      <aside id="app-sidebar" className={`app-sidebar${mobileMenuOpen ? ' is-open' : ''}`} style={{
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
        backgroundColor: 'var(--primary-color)',
        boxShadow: '4px 0 24px rgba(var(--primary-rgb), 0.18)',
        color: '#ffffff',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
        {/* Brand */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          paddingLeft: 0,
          width: '100%',
          height: '60px'
        }}>
          <BrandLogo maxHeight={60} compact light />
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          {/* Turno */}
          {canOperateTurns && (
            <>
              {renderSectionTitle('Turno')}
              {renderNavItem({ label: 'Turno', path: '/turn', icon: Clock })}
              {activeTurnInfo.hasActiveTurn && (
                activeTurnInfo.belongsToCurrentUser ? (
                  <>
                    {can('ventas.operar') && renderNavItem({ label: 'Ventas', path: '/sales', icon: ShoppingBag })}
                    {can('bitacora.propia.ver') && renderNavItem({ label: 'Bitácora', path: `/logbook/${activeTurnInfo.activeTurn?.idTurno}`, icon: BookOpen })}
                  </>
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
              )}
              {can('turnos.propios.ver') && renderNavItem({ label: 'Historial de turnos', path: '/turn-history', icon: CalendarDays })}
            </>
          )}

          {/* Gestión */}
          {canAny('inicio.dashboard.ver','usuarios.ver','inventario.productos.ver','recetas.ver','ingredientes_extra.ver','configuracion_inventario.materias_primas.ver','configuracion_inventario.presentaciones.ver','configuracion_inventario.cortesia.ver','ordenes_compra.ver','proveedores.ver','registros_turnos.ver','registros_turnos.dashboard.ver') && (
            <>
              {renderSectionTitle('Gestión')}
              {can('inicio.dashboard.ver') && renderNavItem({ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard })}
              {can('usuarios.ver') && renderNavItem(navItemsModule1[0])}
              {can('inventario.productos.ver') && renderNavItem(navItemsModule2[0])}
              {can('recetas.ver') && renderNavItem(navItemsModule2[1])}
              {canAny('configuracion_inventario.materias_primas.ver','configuracion_inventario.presentaciones.ver') && renderNavItem({ label: <>Materiales/<br />Ingredientes</>, path: '/settings/raw-materials', icon: Boxes })}
              {can('ingredientes_extra.ver') && renderNavItem({ label: 'Ingredientes extra', path: '/settings/extra-ingredients', icon: Sparkles })}
              {can('configuracion_inventario.cortesia.ver') && renderNavItem({ label: 'Productos de cortesía', path: '/settings/courtesy', icon: Gift })}
              {can('ordenes_compra.ver') && renderNavItem(navItemsModule2[2])}
              {can('proveedores.ver') && renderNavItem(navItemsModule2[3])}
              {can('registros_turnos.ver') && renderNavItem(navItemsModule2[4])}
              {can('registros_turnos.dashboard.ver') && renderNavItem({ label: 'Panel de turnos', path: '/admin/turns-dashboard', icon: BarChart3 })}
            </>
          )}

          {/* Configuración */}
          {canAny('configuracion_sistema.marca.ver','configuracion_sistema.modulos.administrar','roles.ver','inventario.categorias.ver','configuracion_inventario.unidades.ver','configuracion_inventario.categorias_materia.ver','configuracion_inventario.marcas.ver') && (
            <>
              {renderSectionTitle('Configuración')}
              {can('configuracion_sistema.marca.ver') && renderNavItem({ label: 'Identidad de empresa', path: '/settings/organization', icon: Palette })}
              {can('configuracion_sistema.modulos.administrar') && renderNavItem({ label: 'Módulos', path: '/settings/modules', icon: Puzzle })}
              {can('roles.ver') && renderNavItem({ label: 'Roles', path: '/roles', icon: ShieldAlert })}
              {can('inventario.categorias.ver') && renderNavItem({ label: 'Categorías de producto', path: '/settings/product-categories', icon: Layers })}
              {can('configuracion_inventario.unidades.ver') && renderNavItem({ label: 'Unidades de medida', path: '/settings/units', icon: Ruler })}
              {can('configuracion_inventario.categorias_materia.ver') && renderNavItem({ label: 'Categorías de materia', path: '/settings/material-categories', icon: Tags })}
              {can('configuracion_inventario.marcas.ver') && renderNavItem({ label: 'Marcas', path: '/settings/brands', icon: Stamp })}
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
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
