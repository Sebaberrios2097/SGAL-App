import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotificationMessage } from '../components/NotificationCenter';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  LockKeyhole,
  Save,
  ShieldCheck
} from 'lucide-react';

// Los permisos son completamente independientes: marcar o desmarcar uno nunca arrastra otros.
// Cada pantalla que necesita datos de referencia (unidades, materias primas, productos, …) los
// lee por un endpoint que acepta el permiso de esa misma pantalla, así que no hay dependencias
// que resolver en la interfaz.

const getPermissionType = (code) => {
  const action = code.split('.').at(-1);

  if (action === 'ver' || action === 'exportar') {
    return { key: 'read', label: 'Lectura' };
  }
  if (action === 'crear' || action === 'crear_point' || action === 'abrir' || action === 'ingresar') {
    return { key: 'create', label: 'Creación' };
  }
  if (['editar', 'modificar', 'asignar', 'restablecer', 'confirmar'].includes(action)) {
    return { key: 'update', label: 'Modificación' };
  }
  if (['eliminar', 'anular', 'cancelar'].includes(action)) {
    return { key: 'delete', label: 'Eliminación' };
  }

  return { key: 'operate', label: 'Operación' };
};

const RolePermissions = () => {
  const { id } = useParams();
  const { user } = useAuth();
  // Solo se pueden asignar permisos que el propio usuario posee (el Desarrollador los tiene todos).
  const assignableCodes = useMemo(() => new Set(user?.permissions || []), [user]);
  // Tope de descuento propio: no se puede otorgar a un rol un máximo mayor a este.
  const callerMaxDiscount = Number(user?.maxDiscountPercent || 0);
  const [role, setRole] = useState(null);
  const [modules, setModules] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [initialPermissions, setInitialPermissions] = useState([]);
  // Límites numéricos por permiso (Id_Permiso → valor). Para ventas.descuento.aplicar es el % máximo.
  const [limits, setLimits] = useState({});
  const [initialLimits, setInitialLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useNotificationMessage('error');
  const [success, setSuccess] = useNotificationMessage('success');

  useEffect(() => {
    document.title = `Permisos del rol - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    let active = true;

    const loadPermissions = async () => {
      try {
        const [rolesResponse, catalogResponse, permissionsResponse] = await Promise.all([
          fetch('/api/role'),
          fetch('/api/role/permissions/catalog'),
          fetch(`/api/role/${id}/permissions`)
        ]);
        const [rolesData, catalogData, permissionsData] = await Promise.all([
          rolesResponse.json(),
          catalogResponse.json(),
          permissionsResponse.json()
        ]);

        if (!rolesResponse.ok) throw new Error(rolesData.mensaje || 'No se pudo cargar el rol');
        if (!catalogResponse.ok) throw new Error(catalogData.mensaje || 'No se pudo cargar el catálogo de permisos');
        if (!permissionsResponse.ok) throw new Error(permissionsData.mensaje || 'No se pudieron cargar los permisos del rol');

        const currentRole = rolesData.find(item => String(item.idRolUsuario) === String(id));
        if (!currentRole) throw new Error('El rol solicitado no existe.');
        if (!active) return;

        setRole(currentRole);
        setModules(catalogData);
        setSelectedPermissions(permissionsData.permissionIds);
        setInitialPermissions(permissionsData.permissionIds);
        const loadedLimits = permissionsData.limites || {};
        setLimits(loadedLimits);
        setInitialLimits(loadedLimits);
        document.title = `Permisos de ${currentRole.nombreRol} - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPermissions();
    return () => { active = false; };
  }, [id]);

  // Vista filtrada: solo módulos/permisos que el usuario puede asignar. Los permisos ocultos
  // (que el usuario no puede ver ni asignar) se preservan porque selectedPermissions arranca
  // con todos los permisos actuales del rol y el guardado los reenvía intactos.
  const visibleModules = useMemo(() => modules
    .map(module => ({ ...module, permisos: module.permisos.filter(permission => assignableCodes.has(permission.codigo)) }))
    .filter(module => module.permisos.length > 0), [modules, assignableCodes]);
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions]);
  const hasChanges = useMemo(() => {
    if (selectedPermissions.length !== initialPermissions.length) return true;
    const initial = new Set(initialPermissions);
    if (selectedPermissions.some(permissionId => !initial.has(permissionId))) return true;
    // Cambios en límites (p. ej. el % máximo de descuento) de permisos seleccionados.
    return selectedPermissions.some(permissionId =>
      String(limits[permissionId] ?? '') !== String(initialLimits[permissionId] ?? ''));
  }, [initialPermissions, selectedPermissions, limits, initialLimits]);

  const DISCOUNT_PERMISSION = 'ventas.descuento.aplicar';
  const setLimit = (permissionId, value) => {
    setSuccess('');
    setLimits(current => ({ ...current, [permissionId]: value === '' ? null : Number(value) }));
  };

  const togglePermission = (permission) => {
    setSuccess('');
    setSelectedPermissions(current => current.includes(permission.idPermiso)
      ? current.filter(permissionId => permissionId !== permission.idPermiso)
      : [...current, permission.idPermiso]);
  };

  const selectModule = (module, mode) => {
    setSuccess('');
    const moduleIds = new Set(module.permisos.map(permission => permission.idPermiso));
    setSelectedPermissions(current => {
      const next = current.filter(permissionId => !moduleIds.has(permissionId));
      const permissionsToAdd = mode === 'read'
        ? module.permisos.filter(permission => getPermissionType(permission.codigo).key === 'read')
        : mode === 'all' ? module.permisos : [];
      permissionsToAdd.forEach(permission => next.push(permission.idPermiso));
      return next;
    });
  };

  const savePermissions = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/role/${id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionIds: selectedPermissions, limites: limits })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudieron guardar los permisos');
      const savedIds = data.permissionIds || selectedPermissions;
      setSelectedPermissions(savedIds);
      setInitialPermissions(savedIds);
      setInitialLimits(limits);
      setSuccess('Los permisos del rol se guardaron correctamente.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="role-permissions-page" aria-busy="true">
        <div className="permissions-loading">
          <div className="permissions-spinner" />
          <p>Cargando configuración del rol…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="role-permissions-page">
      <nav className="permissions-breadcrumb" aria-label="Navegación secundaria">
        <Link to="/roles" state={{ fromPermissions: true }}>Roles</Link>
        <ChevronRight size={15} aria-hidden="true" />
        <span>Permisos</span>
      </nav>

      <header className="permissions-page-header">
        <div className="permissions-heading-group">
          <Link to="/roles" state={{ fromPermissions: true }} className="permissions-back-button" aria-label="Volver a roles">
            <ArrowLeft size={20} />
          </Link>
          <div className="permissions-title-icon"><ShieldCheck size={26} /></div>
          <div>
            <h2 className="page-title text-solid">Permisos de {role?.nombreRol || 'rol'}</h2>
          </div>
        </div>
        <div className="permissions-header-count" aria-label={`${selectedPermissions.length} permisos seleccionados`}>
          <strong>{selectedPermissions.length}</strong>
          <span>permisos activos</span>
        </div>
      </header>

      {error && (
        <div className="permissions-feedback permissions-feedback-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="permissions-feedback permissions-feedback-success" role="status">
          <Check size={18} />
          <span>{success}</span>
        </div>
      )}

      {role && visibleModules.length > 0 && (
        <main className="permissions-module-list">
          {visibleModules.map(module => {
            const selectedInModule = module.permisos.filter(permission => selectedSet.has(permission.idPermiso)).length;
            return (
              <section className="permissions-module-card" key={module.idModulo}>
                <div className="permissions-module-header">
                  <div className="permissions-module-identity">
                    <span className="permissions-module-icon"><LockKeyhole size={18} /></span>
                    <div>
                      <h3>{module.nombre}</h3>
                      <span>{selectedInModule} de {module.permisos.length} seleccionados</span>
                    </div>
                  </div>
                  <div className="permissions-presets" aria-label={`Selección rápida para ${module.nombre}`}>
                    <button type="button" onClick={() => selectModule(module, 'none')}>Ninguno</button>
                    <button type="button" onClick={() => selectModule(module, 'read')}><Eye size={14} /> Solo lectura</button>
                    <button type="button" className="is-primary" onClick={() => selectModule(module, 'all')}><ShieldCheck size={14} /> Control total</button>
                  </div>
                </div>

                <div className="permissions-options-grid">
                  {module.permisos.map(permission => {
                    const selected = selectedSet.has(permission.idPermiso);
                    const permissionType = getPermissionType(permission.codigo);
                    const isDiscount = permission.codigo === DISCOUNT_PERMISSION;
                    return (
                      <React.Fragment key={permission.idPermiso}>
                        <label className={`permission-option${selected ? ' is-selected' : ''}`}>
                          <input
                            className="permission-checkbox-input"
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePermission(permission)}
                          />
                          <span className="permission-checkbox-control" aria-hidden="true">
                            {selected && <Check size={15} strokeWidth={3} />}
                          </span>
                          <span className="permission-option-copy">
                            <span className="permission-option-title">
                              {permission.nombre}
                              <span className={`permission-type-badge permission-type-${permissionType.key}`}>
                                {permissionType.label}
                              </span>
                              {permission.esCritico && <span className="permission-critical-badge">Crítico</span>}
                            </span>
                            <small>{permission.codigo}</small>
                          </span>
                        </label>
                        {isDiscount && selected && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', margin: '-4px 0 4px', background: 'var(--panel-muted, #f6f5f2)', borderRadius: '8px', fontSize: '.82rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>% máximo que este rol puede descontar</span>
                            <input
                              type="number"
                              min="0"
                              max={callerMaxDiscount}
                              step="0.01"
                              className="input-field"
                              style={{ width: '110px' }}
                              placeholder={String(callerMaxDiscount)}
                              value={limits[permission.idPermiso] ?? ''}
                              onChange={event => {
                                if (event.target.value === '') { setLimit(permission.idPermiso, ''); return; }
                                const capped = Math.min(Math.max(Number(event.target.value) || 0, 0), callerMaxDiscount);
                                setLimit(permission.idPermiso, capped);
                              }}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>máx. que puede otorgar: {callerMaxDiscount.toLocaleString('es-CL')}%</span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </main>
      )}

      {role && (
        <footer className="permissions-action-bar">
          <div>
            <strong>{hasChanges ? 'Hay cambios sin guardar' : 'Configuración actualizada'}</strong>
            <span>{hasChanges ? 'Guarda para aplicar esta configuración al rol.' : 'No hay cambios pendientes.'}</span>
          </div>
          <div className="permissions-action-buttons">
            <Link to="/roles" state={{ fromPermissions: true }} className="btn btn-secondary">Volver a roles</Link>
            <button type="button" className="btn btn-primary" onClick={savePermissions} disabled={saving || !hasChanges}>
              <Save size={17} />
              {saving ? 'Guardando…' : 'Guardar permisos'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default RolePermissions;
