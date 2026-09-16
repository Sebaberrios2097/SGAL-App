import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import InventoryManagement from './pages/InventoryManagement';
import SalesView from './pages/SalesView';
import LogbookView from './pages/LogbookView';
import TurnHistory from './pages/TurnHistory';
import InventorySettings from './pages/InventorySettings';
import RecipeManagement from './pages/RecipeManagement';
import RecipeList from './pages/RecipeList';
import AdminTurnRecords from './pages/AdminTurnRecords';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
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

  // If user is logged in but must change password, they shouldn't access pages
  if (user.cambioClave) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Admin-Only Route Wrapper
const AdminRoute = ({ children }) => {
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

  const isAdmin = user.roles?.some(r => r.toUpperCase() === 'ADMINISTRADOR');
  if (!isAdmin) {
    return <Navigate to="/" replace />; // Redirect non-admins to Welcome
  }

  return children;
};

// Barista-Only Route Wrapper
const BaristaRoute = ({ children }) => {
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

  const isBarista = user.roles?.some(r => r.toUpperCase() === 'BARISTA/VENDEDOR' || r.toUpperCase() === 'VENDEDOR/BARISTA');
  if (!isBarista) {
    return <Navigate to="/" replace />; // Redirect non-baristas to Welcome
  }

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
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user && !user.cambioClave) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
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
            {/* Render Welcome view on root index */}
            <Route index element={<Welcome />} />
            <Route path="users" element={<AdminRoute><UserManagement /></AdminRoute>} />
            <Route path="roles" element={<AdminRoute><RoleManagement /></AdminRoute>} />
            <Route path="inventory" element={<AdminRoute><InventoryManagement /></AdminRoute>} />
            <Route path="inventory/products/:idProducto/recipe" element={<AdminRoute><RecipeManagement /></AdminRoute>} />
            <Route path="recipes" element={<AdminRoute><RecipeList /></AdminRoute>} />
            <Route path="admin/turn-records" element={<AdminRoute><AdminTurnRecords /></AdminRoute>} />
            <Route path="settings/:section" element={<AdminRoute><InventorySettings /></AdminRoute>} />
            <Route path="turn-history" element={<BaristaRoute><TurnHistory /></BaristaRoute>} />
            <Route path="logbook/:idTurno" element={<BaristaRoute><LogbookView /></BaristaRoute>} />
          </Route>

          {/* Standalone Sales View */}
          <Route 
            path="/sales" 
            element={
              <ProtectedRoute>
                <BaristaRoute>
                  <ActiveTurnRoute><SalesView /></ActiveTurnRoute>
                </BaristaRoute>
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
