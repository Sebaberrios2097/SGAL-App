import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import AdminDashboard from './pages/AdminDashboard';
import Turn from './pages/Turn';
import EmployeeManagement from './pages/UserManagement';
import EmployeeEdit from './pages/EmployeeEdit';
import RoleManagement from './pages/RoleManagement';
import RolePermissions from './pages/RolePermissions';
import InventoryManagement from './pages/InventoryManagement';
import SalesView from './pages/SalesView';
import LogbookView from './pages/LogbookView';
import TurnHistory from './pages/TurnHistory';
import InventorySettings from './pages/InventorySettings';
import RecipeManagement from './pages/RecipeManagement';
import RecipeList from './pages/RecipeList';
import ExtraIngredients from './pages/ExtraIngredients';
import ProductCategories from './pages/ProductCategories';
import AdminTurnRecords from './pages/AdminTurnRecords';
import TurnsDashboard from './pages/TurnsDashboard';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import ProviderManagement from './pages/ProviderManagement';
import BrandingSettings from './pages/BrandingSettings';
import ModuleSettings from './pages/ModuleSettings';
import MyConsumptions from './pages/MyConsumptions';
import InventoryDashboard from './pages/InventoryDashboard';
import PurchaseOrderReceptions from './pages/PurchaseOrderReceptions';
import Menu from './pages/Menu';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading, needsSetup } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#12100e'
      }}>
        <div style={{
          border: '4px solid rgba(212, 163, 115, 0.1)',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          borderLeftColor: 'var(--primary-color)',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={needsSetup ? '/setup' : '/login'} replace />;
  }

  // If user is logged in but must change password, they shouldn't access pages
  if (user.cambioClave) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const PermissionRoute = ({ permission, anyOf, children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#12100e'
      }}>
        <div style={{
          border: '4px solid rgba(212, 163, 115, 0.1)',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          borderLeftColor: 'var(--primary-color)',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.cambioClave) {
    return <Navigate to="/login" replace />;
  }

  const accepted = anyOf || [permission];
  if (!accepted.some(code => user.permissions?.includes(code))) return <Navigate to="/" replace />;

  return children;
};

// Sales can only be entered while the signed-in barista owns the open turn.
const ActiveTurnRoute = ({ children }) => {
  const { user } = useAuth();
  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetch(`/api/turn/active?idUsuario=${user.idUsuario}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        if (active) setAllowed(data.hasActiveTurn && data.belongsToCurrentUser);
      })
      .catch(() => {
        if (active) setAllowed(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, [user.idUsuario]);

  if (checking) return <div style={{ padding: '40px', textAlign: 'center' }}>Verificando turno…</div>;
  return allowed ? children : <Navigate to="/" replace />;
};

// Public Route Wrapper (prevents logged in users from seeing login)
const PublicRoute = ({ children }) => {
  const { user, loading, needsSetup } = useAuth();

  if (loading) return null;

  if (user && !user.cambioClave) {
    return <Navigate to="/" replace />;
  }

  // Sin sesión y sin usuario base: forzamos la configuración inicial.
  if (!user && needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  return children;
};

// Setup Route Wrapper: solo accesible cuando falta el usuario base.
const SetupRoute = ({ children }) => {
  const { user, loading, needsSetup } = useAuth();

  if (loading) return null;

  if (user && !user.cambioClave) {
    return <Navigate to="/" replace />;
  }

  if (!needsSetup) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Permisos que dan acceso operativo al turno. Coincide con la sección "Turno" del menú.
const TURN_PERMISSIONS = ['turnos.propios.ver', 'turnos.abrir', 'turnos.cerrar', 'ventas.operar', 'bitacora.propia.ver'];

// Landing route: todos aterrizan en su turno; solo quien no tiene acceso al turno
// pero sí al panel administrativo aterriza en el dashboard.
const LandingRoute = () => {
  const { user } = useAuth();
  const canOperateTurns = TURN_PERMISSIONS.some(code => user?.permissions?.includes(code));
  if (!canOperateTurns && user?.permissions?.includes('inicio.dashboard.ver')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/turn" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Carta pública de productos: accesible sin sesión ni permisos (enlace de QR). */}
          <Route path="/carta" element={<Menu />} />

          {/* Public Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Configuración inicial: crear usuario base cuando no hay Desarrollador */}
          <Route
            path="/setup"
            element={
              <SetupRoute>
                <Setup />
              </SetupRoute>
            }
          />

          {/* Protected Application Routes */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Root index: todos van a su turno; el panel queda como respaldo para quien no opera turnos */}
            <Route index element={<LandingRoute />} />
            <Route path="dashboard" element={<PermissionRoute permission="inicio.dashboard.ver"><AdminDashboard /></PermissionRoute>} />
            <Route path="turn" element={<PermissionRoute anyOf={TURN_PERMISSIONS}><Turn /></PermissionRoute>} />
            <Route path="employees" element={<PermissionRoute permission="usuarios.ver"><EmployeeManagement /></PermissionRoute>} />
            <Route path="employees/:id/edit" element={<PermissionRoute anyOf={['usuarios.empleado.editar','usuarios.cuenta.editar','usuarios.password.restablecer']}><EmployeeEdit /></PermissionRoute>} />
            <Route path="users" element={<Navigate to="/employees" replace />} />
            <Route path="roles" element={<PermissionRoute permission="roles.ver"><RoleManagement /></PermissionRoute>} />
            <Route path="roles/:id/permissions" element={<PermissionRoute permission="roles.permisos.asignar"><RolePermissions /></PermissionRoute>} />
            <Route path="inventory" element={<PermissionRoute anyOf={['inventario.productos.ver','inventario.categorias.ver','inventario.descuentos.ver']}><InventoryManagement /></PermissionRoute>} />
            <Route path="inventory/control" element={<PermissionRoute anyOf={['inventario.productos.ver','configuracion_inventario.materias_primas.ver']}><InventoryDashboard /></PermissionRoute>} />
            <Route path="inventory/products/:idProducto/recipe" element={<PermissionRoute permission="recetas.editar"><RecipeManagement /></PermissionRoute>} />
            <Route path="recipes" element={<PermissionRoute permission="recetas.ver"><RecipeList /></PermissionRoute>} />
            <Route path="settings/extra-ingredients" element={<PermissionRoute permission="ingredientes_extra.ver"><ExtraIngredients /></PermissionRoute>} />
            <Route path="settings/product-categories" element={<PermissionRoute permission="inventario.categorias.ver"><ProductCategories /></PermissionRoute>} />
            <Route path="purchase-orders" element={<PermissionRoute permission="ordenes_compra.ver"><PurchaseOrders /></PermissionRoute>} />
            <Route path="purchase-orders/new" element={<PermissionRoute permission="ordenes_compra.crear"><PurchaseOrderDetail /></PermissionRoute>} />
            <Route path="purchase-orders/receptions" element={<PermissionRoute permission="ordenes_compra.recibir"><PurchaseOrderReceptions /></PermissionRoute>} />
            <Route path="purchase-orders/receptions/:id" element={<PermissionRoute permission="ordenes_compra.recibir"><PurchaseOrderReceptions /></PermissionRoute>} />
            <Route path="purchase-orders/:id" element={<PermissionRoute permission="ordenes_compra.ver"><PurchaseOrderDetail /></PermissionRoute>} />
            <Route path="providers" element={<PermissionRoute permission="proveedores.ver"><ProviderManagement /></PermissionRoute>} />
            <Route path="admin/turn-records" element={<PermissionRoute permission="registros_turnos.ver"><AdminTurnRecords /></PermissionRoute>} />
            <Route path="admin/turns-dashboard" element={<PermissionRoute permission="registros_turnos.dashboard.ver"><TurnsDashboard /></PermissionRoute>} />
            <Route path="turn/courtesy" element={<PermissionRoute permission="configuracion_inventario.cortesia.ver"><InventorySettings /></PermissionRoute>} />
            <Route path="settings/courtesy" element={<Navigate to="/turn/courtesy" replace />} />
            <Route path="settings/raw-materials" element={<PermissionRoute anyOf={['configuracion_inventario.materias_primas.ver','configuracion_inventario.presentaciones.ver']}><InventorySettings /></PermissionRoute>} />
            <Route path="settings/units" element={<PermissionRoute permission="configuracion_inventario.unidades.ver"><InventorySettings /></PermissionRoute>} />
            <Route path="settings/material-categories" element={<PermissionRoute permission="configuracion_inventario.categorias_materia.ver"><InventorySettings /></PermissionRoute>} />
            <Route path="settings/brands" element={<PermissionRoute permission="configuracion_inventario.marcas.ver"><InventorySettings /></PermissionRoute>} />
            <Route path="settings/organization" element={<PermissionRoute permission="configuracion_sistema.marca.ver"><BrandingSettings /></PermissionRoute>} />
            <Route path="settings/modules" element={<PermissionRoute permission="configuracion_sistema.modulos.administrar"><ModuleSettings /></PermissionRoute>} />
            <Route path="turn-history" element={<PermissionRoute permission="turnos.propios.ver"><TurnHistory /></PermissionRoute>} />
            <Route path="turn/consumptions" element={<PermissionRoute anyOf={['turnos.propios.ver','bitacora.propia.ver']}><MyConsumptions /></PermissionRoute>} />
            <Route path="logbook/:idTurno" element={<PermissionRoute permission="bitacora.propia.ver"><LogbookView /></PermissionRoute>} />
          </Route>

          {/* Standalone Sales View */}
          <Route 
            path="/sales" 
            element={
              <ProtectedRoute>
                <PermissionRoute permission="ventas.operar">
                  <ActiveTurnRoute><SalesView /></ActiveTurnRoute>
                </PermissionRoute>
              </ProtectedRoute>
            }
          />

          {/* Fallback redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
