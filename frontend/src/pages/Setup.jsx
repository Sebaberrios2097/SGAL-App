import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Formulario de arranque: se muestra cuando la base no tiene ningún usuario
// Desarrollador. Crea al usuario base y deja la sesión iniciada.
const Setup = () => {
  const { createBaseUser } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Configuración inicial');

  const [form, setForm] = useState({
    rut: '',
    dv: '',
    nombres: '',
    apellido1: '',
    apellido2: '',
    correo: '',
    nombreUsuario: '',
    pass: '',
    confirmPass: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setField = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const rutNumber = parseInt(String(form.rut).replace(/\D/g, ''), 10);
    if (!rutNumber || rutNumber <= 0 || !form.dv.trim() || !form.nombres.trim() || !form.apellido1.trim()) {
      setError('RUT, dígito verificador, nombres y apellido paterno son obligatorios');
      return;
    }
    if (!form.nombreUsuario.trim()) {
      setError('El nombre de usuario es obligatorio');
      return;
    }
    if (form.pass.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    if (form.pass !== form.confirmPass) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await createBaseUser({
        rut: rutNumber,
        dv: form.dv.trim(),
        nombres: form.nombres.trim(),
        apellido1: form.apellido1.trim(),
        apellido2: form.apellido2.trim() || null,
        correo: form.correo.trim() || null,
        nombreUsuario: form.nombreUsuario.trim(),
        pass: form.pass,
      });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Error al crear el usuario base');
      setLoading(false);
    }
  };

  const iconStyle = {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'radial-gradient(circle at center, var(--primary-color) 0%, var(--primary-hover) 100%)'
    }} className="animate-fade-in">
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '520px',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden'
      }}>
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
          marginBottom: '28px'
        }}>
          <BrandLogo maxHeight={90} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800' }} className="text-gradient">Configuración inicial</h2>
        </div>

        <div className="badge badge-warning" style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          textTransform: 'none',
          marginBottom: '20px',
          fontSize: '0.8rem',
          lineHeight: '1.35'
        }}>
          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>No existe ningún usuario <strong>Desarrollador</strong>. Crea el usuario base para administrar el sistema; iniciarás sesión automáticamente al terminar.</span>
        </div>

        <form onSubmit={handleSubmit}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div className="input-group">
              <label className="input-label">RUT (sin puntos ni guion)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="12345678"
                className="input-field"
                value={form.rut}
                onChange={setField('rut')}
                disabled={loading}
              />
            </div>
            <div className="input-group">
              <label className="input-label">DV</label>
              <input
                type="text"
                maxLength={1}
                placeholder="9"
                className="input-field"
                value={form.dv}
                onChange={setField('dv')}
                disabled={loading}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Nombres</label>
            <input
              type="text"
              placeholder="Nombres"
              className="input-field"
              value={form.nombres}
              onChange={setField('nombres')}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="input-group">
              <label className="input-label">Apellido paterno</label>
              <input
                type="text"
                placeholder="Apellido paterno"
                className="input-field"
                value={form.apellido1}
                onChange={setField('apellido1')}
                disabled={loading}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Apellido materno <span style={{ color: 'var(--text-muted)' }}>(opcional)</span></label>
              <input
                type="text"
                placeholder="Apellido materno"
                className="input-field"
                value={form.apellido2}
                onChange={setField('apellido2')}
                disabled={loading}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Correo <span style={{ color: 'var(--text-muted)' }}>(opcional)</span></label>
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              className="input-field"
              value={form.correo}
              onChange={setField('correo')}
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Nombre de usuario</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={iconStyle} />
              <input
                type="text"
                placeholder="nombreusuario"
                className="input-field"
                style={{ paddingLeft: '48px' }}
                value={form.nombreUsuario}
                onChange={setField('nombreUsuario')}
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={iconStyle} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 4 caracteres"
                  className="input-field"
                  style={{ paddingLeft: '48px', paddingRight: '48px' }}
                  value={form.pass}
                  onChange={setField('pass')}
                  disabled={loading}
                  autoComplete="new-password"
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
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Confirmar contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={iconStyle} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repite la contraseña"
                  className="input-field"
                  style={{ paddingLeft: '48px' }}
                  value={form.confirmPass}
                  onChange={setField('confirmPass')}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', borderRadius: '10px' }}
            disabled={loading}
          >
            {loading ? 'Creando...' : 'Crear usuario base'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Setup;
