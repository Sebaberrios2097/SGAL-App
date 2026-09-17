import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const Login = () => {
  const { login, updatePasswordState } = useAuth();
  const { branding, getBackgroundStyle } = useOrganization();
  const loginBackground = getBackgroundStyle('login');
  const navigate = useNavigate();
  useDocumentTitle('Iniciar sesión');

  // Login state
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [pass, setPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Password change state (for forced password change)
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tempUserId, setTempUserId] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!nombreUsuario.trim() || !pass) {
      setError('Por favor, ingresa el usuario y contraseña');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const data = await login(nombreUsuario, pass);

      if (data.cambioClave) {
        setMustChangePassword(true);
        setTempUserId(data.idUsuario);
        setLoading(false);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!newPass || !confirmNewPass) {
      setChangeError('Por favor, completa todos los campos');
      return;
    }

    if (newPass.length < 4) {
      setChangeError('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }

    if (newPass !== confirmNewPass) {
      setChangeError('Las contraseñas no coinciden');
      return;
    }

    setChangeError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idUsuario: tempUserId,
          passActual: pass, // the current temp password
          passNueva: newPass,
          esAdmin: false
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al cambiar la contraseña');
      }

      setChangeSuccess('Contraseña actualizada con éxito');

      // Update the user session in AuthContext to mark changePassword as done
      updatePasswordState({ cambioClave: false });

      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      setChangeError(err.message || 'Error al cambiar la contraseña');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      ...(loginBackground || { background: 'radial-gradient(circle at center, var(--primary-color) 0%, var(--primary-hover) 100%)' })
    }} className="animate-fade-in">
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow Effects */}
        <div style={{
          position: 'absolute',
          top: '-10%',
          right: '-10%',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        {/* Brand/Logo */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '36px'
        }}>
          <BrandLogo location="login" maxHeight={110} />
          {mustChangePassword && <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>Actualiza tu contraseña para continuar en {branding.nombreComercial}.</p>}
        </div>

        {/* Regular Login Form */}
        {!mustChangePassword ? (
          <form onSubmit={handleLoginSubmit}>
            {error && (
              <div className="badge badge-danger" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                textTransform: 'none',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Usuario</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }} />
                <input
                  type="text"
                  placeholder="nombreusuario"
                  className="input-field"
                  style={{ paddingLeft: '48px' }}
                  value={nombreUsuario}
                  onChange={(e) => setNombreUsuario(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label className="input-label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input-field"
                  style={{ paddingLeft: '48px', paddingRight: '48px' }}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', borderRadius: '10px' }}
              disabled={loading}
            >
              {loading ? 'Validando...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          /* Forced Password Change Form */
          <form onSubmit={handleChangePasswordSubmit}>
            {changeError && (
              <div className="badge badge-danger" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                textTransform: 'none',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} />
                <span>{changeError}</span>
              </div>
            )}

            {changeSuccess && (
              <div className="badge badge-success" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                textTransform: 'none',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} />
                <span>{changeSuccess}</span>
              </div>
            )}

            <div className="badge badge-warning" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              textTransform: 'none',
              marginBottom: '20px',
              fontSize: '0.8rem',
              lineHeight: '1.3'
            }}>
              <span style={{ fontWeight: '700' }}>⚠️ Cambio de Clave Obligatorio</span>
              <span>Has ingresado con una contraseña temporal. Por seguridad, debes establecer una contraseña personalizada antes de continuar.</span>
            </div>

            <div className="input-group">
              <label className="input-label">Nueva Contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }} />
                <input
                  type="password"
                  placeholder="Mínimo 4 caracteres"
                  className="input-field"
                  style={{ paddingLeft: '48px' }}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  disabled={loading || !!changeSuccess}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label className="input-label">Confirmar Nueva Contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }} />
                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  className="input-field"
                  style={{ paddingLeft: '48px' }}
                  value={confirmNewPass}
                  onChange={(e) => setConfirmNewPass(e.target.value)}
                  disabled={loading || !!changeSuccess}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', borderRadius: '10px' }}
              disabled={loading || !!changeSuccess}
            >
              {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
