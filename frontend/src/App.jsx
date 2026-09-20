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
import Welcome from './pages/Welcome';
import { useOrganization } from './context/OrganizationContext';

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

const ModuleRoute = ({ required, children }) => {
  const { enabledModules, loading } = useOrganization();
  if (loading) return null;
  return required.every(code => enabledModules.includes(code))
    ? children
    : <Navigate to="/welcome" replace />;
};

// Operación de caja siempre exige que el usuario sea dueño de un turno abierto.
const ActiveTurnRoute = ({ children }) => {
  const { user } = useAuth();
  const { loading: organizationLoading } = useOrganization();
  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    if (organizationLoading) return undefined;
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
  }, [user.idUsuario, organizationLoading]);

  if (organizationLoading || checking) return <div style={{ padding: '40px', textAlign: 'center' }}>Verificando acceso…</div>;
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

// Destino inicial según las capacidades efectivamente habilitadas.
const LandingRoute = () => {
  const { user } = useAuth();
  const { enabledModules, loading } = useOrganization();
  if (loading) return null;
  const salesEnabled = enabledModules.includes('ventas');
  const hasAdministrativePanel = salesEnabled;
  if (hasAdministrativePanel && user?.permissions?.includes('inicio.dashboard.ver')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/welcome" replace />;
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
            {/* El panel es siempre el inicio cuando está disponible; la bienvenida es el fallback neutro. */}
            <Route index element={<LandingRoute />} />
            <Route path="welcome" element={<Welcome />} />
            <Route path="dashboard" element={<ModuleRoute required={['ventas']}><PermissionRoute permission="inicio.dashboard.ver"><AdminDashboard /></PermissionRoute></ModuleRoute>} />
            <Route path="turn" element={<ModuleRoute required={['ventas']}><PermissionRoute anyOf={TURN_PERMISSIONS}><Turn /></PermissionRoute></ModuleRoute>} />
            <Route path="employees" element={<PermissionRoute permission="usuarios.ver"><EmployeeManagement /></PermissionRoute>} />
            <Route path="employees/:id/edit" element={<PermissionRoute anyOf={['usuarios.empleado.editar','usuarios.cuenta.editar','usuarios.password.restablecer']}><EmployeeEdit /></PermissionRoute>} />
            <Route path="users" element={<Navigate to="/employees" replace />} />
            <Route path="roles" element={<PermissionRoute permission="roles.ver"><RoleManagement /></PermissionRoute>} />
            <Route path="roles/:id/permissions" element={<PermissionRoute permission="roles.permisos.asignar"><RolePermissions /></PermissionRoute>} />
            <Route path="inventory" element={<PermissionRoute anyOf={['inventario.productos.ver','inventario.categorias.ver','inventario.descuentos.ver']}><InventoryManagement /></PermissionRoute>} />
            <Route path="inventory/control" element={<PermissionRoute anyOf={['inventario.productos.ver','configuracion_inventario.materias_primas.ver']}><InventoryDashboard /></PermissionRoute>} />
            <Route path="inventory/products/:idProducto/recipe" element={<ModuleRoute required={['recetas']}><PermissionRoute permission="recetas.editar"><RecipeManagement /></PermissionRoute></ModuleRoute>} />
            <Route path="recipes" element={<ModuleRoute required={['recetas']}><PermissionRoute permission="recetas.ver"><RecipeList /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/extra-ingredients" element={<ModuleRoute required={['recetas']}><PermissionRoute permission="ingredientes_extra.ver"><ExtraIngredients /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/product-categories" element={<PermissionRoute permission="inventario.categorias.ver"><ProductCategories /></PermissionRoute>} />
            <Route path="purchase-orders" element={<PermissionRoute permission="ordenes_compra.ver"><PurchaseOrders /></PermissionRoute>} />
            <Route path="purchase-orders/new" element={<PermissionRoute permission="ordenes_compra.crear"><PurchaseOrderDetail /></PermissionRoute>} />
            <Route path="purchase-orders/receptions" element={<PermissionRoute permission="ordenes_compra.recibir"><PurchaseOrderReceptions /></PermissionRoute>} />
            <Route path="purchase-orders/receptions/:id" element={<PermissionRoute permission="ordenes_compra.recibir"><PurchaseOrderReceptions /></PermissionRoute>} />
            <Route path="purchase-orders/:id" element={<PermissionRoute permission="ordenes_compra.ver"><PurchaseOrderDetail /></PermissionRoute>} />
            <Route path="providers" element={<PermissionRoute permission="proveedores.ver"><ProviderManagement /></PermissionRoute>} />
            <Route path="admin/turn-records" element={<ModuleRoute required={['ventas']}><PermissionRoute permission="registros_turnos.ver"><AdminTurnRecords /></PermissionRoute></ModuleRoute>} />
            <Route path="admin/turns-dashboard" element={<ModuleRoute required={['ventas']}><PermissionRoute permission="registros_turnos.dashboard.ver"><TurnsDashboard /></PermissionRoute></ModuleRoute>} />
            <Route path="turn/courtesy" element={<ModuleRoute required={['ventas']}><PermissionRoute permission="configuracion_inventario.cortesia.ver"><InventorySettings /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/courtesy" element={<Navigate to="/turn/courtesy" replace />} />
            <Route path="settings/raw-materials" element={<ModuleRoute required={['recetas']}><PermissionRoute anyOf={['configuracion_inventario.materias_primas.ver','configuracion_inventario.presentaciones.ver']}><InventorySettings /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/units" element={<ModuleRoute required={['recetas']}><PermissionRoute permission="configuracion_inventario.unidades.ver"><InventorySettings /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/material-categories" element={<ModuleRoute required={['recetas']}><PermissionRoute permission="configuracion_inventario.categorias_materia.ver"><InventorySettings /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/brands" element={<ModuleRoute required={['recetas']}><PermissionRoute permission="configuracion_inventario.marcas.ver"><InventorySettings /></PermissionRoute></ModuleRoute>} />
            <Route path="settings/organization" element={<PermissionRoute permission="configuracion_sistema.marca.ver"><BrandingSettings /></PermissionRoute>} />
            <Route path="settings/modules" element={<PermissionRoute permission="configuracion_sistema.modulos.administrar"><ModuleSettings /></PermissionRoute>} />
            <Route path="turn-history" element={<ModuleRoute required={['ventas']}><PermissionRoute permission="turnos.propios.ver"><TurnHistory /></PermissionRoute></ModuleRoute>} />
            <Route path="turn/consumptions" element={<ModuleRoute required={['ventas']}><PermissionRoute anyOf={['turnos.propios.ver','bitacora.propia.ver']}><MyConsumptions /></PermissionRoute></ModuleRoute>} />
            <Route path="logbook/:idTurno" element={<ModuleRoute required={['ventas']}><PermissionRoute permission="bitacora.propia.ver"><LogbookView /></PermissionRoute></ModuleRoute>} />
          </Route>

          {/* Standalone Sales View */}
          <Route 
            path="/sales" 
            element={
              <ProtectedRoute>
                <ModuleRoute required={['ventas']}>
                  <PermissionRoute permission="ventas.operar">
                    <ActiveTurnRoute><SalesView /></ActiveTurnRoute>
                  </PermissionRoute>
                </ModuleRoute>
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
