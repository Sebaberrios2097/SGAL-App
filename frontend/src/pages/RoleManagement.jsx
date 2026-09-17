import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Edit2, 
  Trash2, 
  AlertCircle,
  Check,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';

const RoleManagement = () => {
  const { can } = useAuth();
  const location = useLocation();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [roleName, setRoleName] = useState('');
  const [editingRole, setEditingRole] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [roleInputError, setRoleInputError] = useState(false);

  useEffect(() => {
    document.title = `Mantenedor de roles - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/role');
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'Error al obtener roles');
      setRoles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roleName.trim()) {
      setFormError('El nombre del rol es obligatorio');
      setRoleInputError(true);
      return;
    }

    setFormError('');
    setFormSuccess('');
    setRoleInputError(false);

    try {
      let response;
      let data;

      if (editingRole) {
        // Update
        response = await fetch(`/api/role/${editingRole.idRolUsuario}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(roleName.trim())
        });
      } else {
        // Create
        response = await fetch('/api/role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(roleName.trim())
        });
      }

      data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al procesar el rol');
      }

      setFormSuccess(editingRole ? 'Rol actualizado con éxito' : 'Rol creado con éxito');
      setRoleName('');
      setEditingRole(null);
      setRoleInputError(false);
      await fetchRoles();

      setTimeout(() => {
        setFormSuccess('');
      }, 3000);
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleEditClick = (role) => {
    setEditingRole(role);
    setRoleName(role.nombreRol);
    setFormError('');
    setFormSuccess('');
  };

  const handleCancelEdit = () => {
    setEditingRole(null);
    setRoleName('');
    setFormError('');
    setFormSuccess('');
  };

  const handleDeleteClick = async (role) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar el rol "${role.nombreRol}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/role/${role.idRolUsuario}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al eliminar el rol');
      }

      await fetchRoles();
      alert('Rol eliminado con éxito');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className={location.state?.fromPermissions ? 'role-management-return' : 'animate-fade-in'}>
      <header className="page-header">
        <div>
          <h2 className="page-title text-solid">Mantenedor de Roles</h2>
        </div>
      </header>

      {error && (
        <div className="badge badge-danger" style={{ padding: '16px', borderRadius: '10px', width: '100%', marginBottom: '20px', textTransform: 'none' }}>
          <AlertCircle size={18} style={{ marginRight: '8px' }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px minmax(0, 1fr)',
        gap: '32px',
        alignItems: 'start'
      }}>
        {/* Form panel */}
        {(can('roles.crear') || can('roles.editar')) && <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', fontWeight: '700' }}>
            {editingRole ? 'Editar Rol' : 'Crear Nuevo Rol'}
          </h3>

          {formError && (
            <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px', borderRadius: '8px', textTransform: 'none', marginBottom: '16px', fontSize: '0.85rem' }}>
              <AlertCircle size={14} />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px', borderRadius: '8px', textTransform: 'none', marginBottom: '16px', fontSize: '0.85rem' }}>
              <Check size={14} />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-group" style={{ marginBottom: roleInputError ? '8px' : '20px' }}>
              <label className="input-label">Nombre del Rol</label>
              <input
                type="text"
                placeholder="Ej: Administrador, Cajero..."
                className="input-field"
                value={roleName}
                onChange={(e) => {
                  setRoleName(e.target.value);
                  if (roleInputError) setRoleInputError(false);
                }}
                style={{
                  borderColor: roleInputError ? '#ef4444' : 'var(--panel-border)',
                  boxShadow: roleInputError ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                }}
              />
              {roleInputError && (
                <div style={{ color: '#ef4444', fontSize: '0.80rem', marginTop: '4px', fontWeight: '600' }}>
                  El nombre del rol es obligatorio
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '10px' }} disabled={editingRole ? !can('roles.editar') : !can('roles.crear')}>
                {editingRole ? 'Actualizar' : 'Guardar'}
              </button>
              {editingRole && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} style={{ padding: '10px' }}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>}

        {/* List panel */}
        <div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '50px 0' }}>
              <div style={{
                border: '3px solid rgba(212, 163, 115, 0.1)',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                borderLeftColor: 'var(--primary-color)',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
          ) : (
            <DataTable
              rows={roles}
              rowKey={role => role.idRolUsuario}
              search={role => role.nombreRol}
              searchPlaceholder="Buscar rol…"
              emptyMessage="No hay roles registrados en el sistema."
              columns={[
                { key: 'nombre', header: 'Nombre del Rol', sortValue: r => r.nombreRol, cell: r => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}>
                    <ShieldCheck size={18} color="var(--primary-color)" />
                    <span>{r.nombreRol}</span>
                  </div>
                ) },
                { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: r => (
                  <div className="actions-wrapper">
                    {can('roles.permisos.asignar') && <Link to={`/roles/${r.idRolUsuario}/permissions`} state={{ fromRoles: true }} className="btn btn-secondary" style={{ padding: '8px', borderRadius: '8px' }} title="Administrar permisos" aria-label={`Administrar permisos de ${r.nombreRol}`}><ShieldCheck size={14} /></Link>}
                    {can('roles.editar') && <button onClick={() => handleEditClick(r)} className="btn btn-secondary" style={{ padding: '8px', borderRadius: '8px' }} title="Editar"><Edit2 size={14} /></button>}
                    {can('roles.eliminar') && <button onClick={() => handleDeleteClick(r)} className="btn btn-danger" style={{ padding: '8px', borderRadius: '8px' }} title="Eliminar"><Trash2 size={14} /></button>}
                  </div>
                ) }
              ]}
            />
          )}
        </div>
      </div>

    </div>
  );
};

export default RoleManagement;
