import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ContactRound,
  KeyRound,
  RotateCcw,
  Save,
  UserRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const initialForm = {
  esExterno: false,
  tipoDocumento: 'RUN',
  nombres: '',
  alias: '',
  apellido1: '',
  apellido2: '',
  numeroTelefono: '',
  correo: '',
  nombreUsuario: ''
};

const EmployeeEdit = () => {
  const { id } = useParams();
  const { can } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [originalForm, setOriginalForm] = useState(initialForm);
  const [passwordMode, setPasswordMode] = useState('keep');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const canEditEmployee = can('usuarios.empleado.editar');
  const canEditAccount = can('usuarios.cuenta.editar');
  const canResetPassword = can('usuarios.password.restablecer');

  useEffect(() => {
    document.title = `Editar empleado - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    let active = true;

    fetch(`/api/employee/${id}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || 'No se pudo cargar el empleado');
        if (!active) return;

        const loadedForm = {
          esExterno: Boolean(data.esExterno),
          tipoDocumento: data.tipoDocumento || 'RUN',
          nombres: data.nombres || '',
          alias: data.alias || '',
          apellido1: data.apellido1 || '',
          apellido2: data.apellido2 || '',
          numeroTelefono: data.numeroTelefono?.toString() || '',
          correo: data.correo || '',
          nombreUsuario: data.usuario?.nombreUsuario || ''
        };
        setEmployee(data);
        setForm(loadedForm);
        setOriginalForm(loadedForm);
        document.title = `Editar ${data.nombres} ${data.apellido1} - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  const employeeChanged = useMemo(() => (
    ['esExterno', 'tipoDocumento', 'nombres', 'alias', 'apellido1', 'apellido2', 'numeroTelefono', 'correo']
      .some(field => form[field] !== originalForm[field])
  ), [form, originalForm]);
  const accountChanged = form.nombreUsuario !== originalForm.nombreUsuario;
  const passwordChanged = passwordMode !== 'keep';
  const hasChanges = (canEditEmployee && employeeChanged)
    || (canEditAccount && accountChanged)
    || (canResetPassword && passwordChanged);

  const updateField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setFieldErrors(current => ({ ...current, [field]: null }));
    setError('');
    setSuccess('');
  };

  const readResponse = async (response, fallbackMessage) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.mensaje || fallbackMessage);
    return data;
  };

  const validate = () => {
    const errors = {};
    if (canEditEmployee && !form.nombres.trim()) errors.nombres = 'Ingresa los nombres del empleado.';
    if (canEditEmployee && !form.apellido1.trim()) errors.apellido1 = 'Ingresa el apellido paterno.';
    if (canEditAccount && employee?.usuario && !form.nombreUsuario.trim()) errors.nombreUsuario = 'Ingresa un nombre de usuario.';
    if (form.nombreUsuario.trim().length > 50) errors.nombreUsuario = 'Máximo 50 caracteres.';
    if (passwordMode === 'custom') {
      if (newPassword.length < 4) errors.newPassword = 'La contraseña debe tener al menos 4 caracteres.';
      if (newPassword !== confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!validate() || !employee) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const normalizedForm = {
        ...form,
        nombres: form.nombres.trim(),
        alias: form.alias.trim(),
        apellido1: form.apellido1.trim(),
        apellido2: form.apellido2.trim(),
        correo: form.correo.trim(),
        nombreUsuario: form.nombreUsuario.trim()
      };
      if (canEditEmployee && employeeChanged) {
        await readResponse(await fetch(`/api/employee/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            esExterno: normalizedForm.esExterno,
            tipoDocumento: normalizedForm.tipoDocumento,
            nombres: normalizedForm.nombres,
            alias: normalizedForm.alias || null,
            apellido1: normalizedForm.apellido1,
            apellido2: normalizedForm.apellido2 || null,
            numeroTelefono: form.numeroTelefono ? Number(form.numeroTelefono) : null,
            correo: normalizedForm.correo || null
          })
        }), 'No se pudieron actualizar los datos del empleado');
      }

      if (employee.usuario && canEditAccount && accountChanged) {
        await readResponse(await fetch(`/api/employee/${id}/user`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombreUsuario: normalizedForm.nombreUsuario })
        }), 'No se pudo actualizar el nombre de usuario');
      }

      if (employee.usuario && canResetPassword && passwordChanged) {
        const password = passwordMode === 'rut' ? employee.rut.toString() : newPassword;
        await readResponse(await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idUsuario: employee.usuario.idUsuario,
            passActual: '',
            passNueva: password,
            esAdmin: true
          })
        }), 'No se pudo actualizar la contraseña');
      }

      setOriginalForm(normalizedForm);
      setForm(normalizedForm);
      setEmployee(current => ({
        ...current,
        esExterno: normalizedForm.esExterno,
        tipoDocumento: normalizedForm.tipoDocumento,
        nombres: normalizedForm.nombres,
        alias: normalizedForm.alias || null,
        apellido1: normalizedForm.apellido1,
        apellido2: normalizedForm.apellido2 || null,
        numeroTelefono: normalizedForm.numeroTelefono ? Number(normalizedForm.numeroTelefono) : null,
        correo: normalizedForm.correo || null,
        usuario: current.usuario ? { ...current.usuario, nombreUsuario: normalizedForm.nombreUsuario } : null
      }));
      setPasswordMode('keep');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Los cambios se guardaron correctamente.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="employee-edit-loading"><div className="permissions-spinner" /><span>Cargando empleado…</span></div>;
  }

  if (!employee) {
    return (
      <div className="employee-edit-page">
        <Link to="/employees" state={{ fromEmployeeEdit: true }} className="permissions-back-button"><ArrowLeft size={20} /></Link>
        <div className="permissions-feedback permissions-feedback-error" role="alert"><AlertCircle size={18} />{error}</div>
      </div>
    );
  }

  return (
    <div className="employee-edit-page">
      <header className="employee-edit-header">
        <div className="permissions-heading-group">
          <Link to="/employees" state={{ fromEmployeeEdit: true }} className="permissions-back-button" aria-label="Volver a empleados">
            <ArrowLeft size={20} />
          </Link>
          <div className="employee-avatar" aria-hidden="true">{employee.nombres.charAt(0)}{employee.apellido1.charAt(0)}</div>
          <div>
            <p className="permissions-eyebrow">Gestión de usuarios</p>
            <h2 className="page-title text-gradient">Editar usuario</h2>
            <p className="page-subtitle">{employee.nombres} {employee.apellido1} · {employee.tipoDocumento === 'RUT' ? 'RUT' : 'RUN'} {employee.rut}-{employee.dv}</p>
          </div>
        </div>
        <span className={`badge ${employee.activo ? 'badge-success' : 'badge-danger'}`}>{employee.activo ? 'Activo' : 'Inactivo'}</span>
      </header>

      {error && <div className="permissions-feedback permissions-feedback-error" role="alert"><AlertCircle size={18} />{error}</div>}
      {success && <div className="permissions-feedback permissions-feedback-success" role="status"><Check size={18} />{success}</div>}

      <form onSubmit={handleSave} className="employee-edit-form" noValidate>
        <section className="employee-edit-card">
          <div className="employee-edit-card-heading">
            <span><ContactRound size={19} /></span>
            <div><h3>Datos personales</h3><p>Información visible del empleado.</p></div>
          </div>
          <div className="employee-form-grid">
            <div className="input-group">
              <label className="input-label" htmlFor="employee-tipo">Tipo de persona</label>
              <select id="employee-tipo" className="input-field" value={form.esExterno ? 'externo' : 'empleado'}
                onChange={e => updateField('esExterno', e.target.value === 'externo')} disabled={!canEditEmployee || saving}>
                <option value="empleado">Empleado</option>
                <option value="externo">Externo</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-tipodoc">Tipo de documento</label>
              <select id="employee-tipodoc" className="input-field" value={form.tipoDocumento}
                onChange={e => updateField('tipoDocumento', e.target.value)} disabled={!canEditEmployee || saving}>
                <option value="RUN">RUN (persona natural)</option>
                <option value="RUT">RUT (empresa)</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-names">Nombres</label>
              <input id="employee-names" className="input-field" maxLength={100} value={form.nombres} onChange={e => updateField('nombres', e.target.value)} disabled={!canEditEmployee || saving} />
              {fieldErrors.nombres && <small className="employee-field-error">{fieldErrors.nombres}</small>}
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-alias">Alias</label>
              <input id="employee-alias" className="input-field" maxLength={50} placeholder="Opcional" value={form.alias} onChange={e => updateField('alias', e.target.value)} disabled={!canEditEmployee || saving} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-lastname">Apellido paterno</label>
              <input id="employee-lastname" className="input-field" maxLength={50} value={form.apellido1} onChange={e => updateField('apellido1', e.target.value)} disabled={!canEditEmployee || saving} />
              {fieldErrors.apellido1 && <small className="employee-field-error">{fieldErrors.apellido1}</small>}
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-second-lastname">Apellido materno</label>
              <input id="employee-second-lastname" className="input-field" maxLength={50} value={form.apellido2} onChange={e => updateField('apellido2', e.target.value)} disabled={!canEditEmployee || saving} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-phone">Teléfono</label>
              <input id="employee-phone" type="number" className="input-field" value={form.numeroTelefono} onChange={e => updateField('numeroTelefono', e.target.value)} disabled={!canEditEmployee || saving} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="employee-email">Correo electrónico</label>
              <input id="employee-email" type="email" className="input-field" maxLength={150} value={form.correo} onChange={e => updateField('correo', e.target.value)} disabled={!canEditEmployee || saving} />
            </div>
          </div>
          {!canEditEmployee && <p className="employee-permission-note">Tu rol permite consultar estos datos, pero no modificarlos.</p>}
        </section>

        <section className="employee-edit-card">
          <div className="employee-edit-card-heading">
            <span><UserRound size={19} /></span>
            <div><h3>Cuenta de acceso</h3><p>Credenciales para iniciar sesión.</p></div>
          </div>
          {employee.usuario ? (
            <>
              <div className="employee-account-row">
                <div className="input-group employee-account-field">
                  <label className="input-label" htmlFor="employee-username">Nombre de usuario</label>
                  <input id="employee-username" className="input-field" maxLength={50} value={form.nombreUsuario} onChange={e => updateField('nombreUsuario', e.target.value)} disabled={!canEditAccount || saving} />
                  {fieldErrors.nombreUsuario && <small className="employee-field-error">{fieldErrors.nombreUsuario}</small>}
                  {!canEditAccount && <small className="employee-permission-note">No tienes permiso para modificar la cuenta.</small>}
                </div>
                {canResetPassword && (
                  <div className="input-group employee-password-control">
                    <label className="input-label">Contraseña</label>
                    <div className="password-mode-selector" role="radiogroup" aria-label="Acción sobre la contraseña">
                      <button type="button" role="radio" aria-checked={passwordMode === 'rut'} className={passwordMode === 'rut' ? 'is-selected' : ''} onClick={() => setPasswordMode(passwordMode === 'rut' ? 'keep' : 'rut')}><RotateCcw size={15} /> Restablecer al RUT</button>
                      <button type="button" role="radio" aria-checked={passwordMode === 'custom'} className={passwordMode === 'custom' ? 'is-selected' : ''} onClick={() => setPasswordMode(passwordMode === 'custom' ? 'keep' : 'custom')}><KeyRound size={15} /> Definir nueva</button>
                    </div>
                  </div>
                )}
              </div>
              {canResetPassword && passwordMode === 'rut' && <div className="password-reset-notice">La contraseña se establecerá temporalmente como <strong>{employee.rut}</strong>.</div>}
              {canResetPassword && passwordMode === 'custom' && (
                <div className="employee-form-grid password-fields">
                  <div className="input-group">
                    <label className="input-label" htmlFor="employee-password">Nueva contraseña</label>
                    <input id="employee-password" type="password" autoComplete="new-password" className="input-field" value={newPassword} onChange={e => { setNewPassword(e.target.value); setFieldErrors(current => ({ ...current, newPassword: null })); }} disabled={saving} />
                    {fieldErrors.newPassword && <small className="employee-field-error">{fieldErrors.newPassword}</small>}
                  </div>
                  <div className="input-group">
                    <label className="input-label" htmlFor="employee-password-confirm">Confirmar contraseña</label>
                    <input id="employee-password-confirm" type="password" autoComplete="new-password" className="input-field" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(current => ({ ...current, confirmPassword: null })); }} disabled={saving} />
                    {fieldErrors.confirmPassword && <small className="employee-field-error">{fieldErrors.confirmPassword}</small>}
                  </div>
                </div>
              )}
            </>
          ) : <div className="employee-empty-account">Este empleado todavía no tiene una cuenta de acceso.</div>}
        </section>

        <footer className="employee-edit-actions">
          <div><strong>{hasChanges ? 'Hay cambios sin guardar' : 'Sin cambios pendientes'}</strong><span>Los cambios se aplicarán únicamente al guardar.</span></div>
          <div>
            <Link to="/employees" state={{ fromEmployeeEdit: true }} className="btn btn-secondary">Cancelar</Link>
            <button type="submit" className="btn btn-primary" disabled={!hasChanges || saving}><Save size={17} />{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </footer>
      </form>
    </div>
  );
};

export default EmployeeEdit;
