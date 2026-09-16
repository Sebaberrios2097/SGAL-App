import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  AlertCircle,
  X,
  Check,
  ShieldCheck
} from 'lucide-react';

const RoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [roleName, setRoleName] = useState('');
  const [editingRole, setEditingRole] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [roleInputError, setRoleInputError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    const totalPages = Math.ceil(roles.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [roles.length, currentPage]);

  useEffect(() => {
    document.title = "Mantenedor de Roles - Siete Vidas";
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
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h2 className="page-title text-gradient">Mantenedor de Roles</h2>
          <p className="page-subtitle">Crea, edita y administra los roles de acceso para el personal.</p>
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
        <div className="glass-panel" style={{ padding: '24px' }}>
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
              <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '10px' }}>
                {editingRole ? 'Actualizar' : 'Guardar'}
              </button>
              {editingRole && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} style={{ padding: '10px' }}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

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
            <div className="table-container">
              <div className="table-scroll-wrapper">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre del Rol</th>
                      <th className="col-actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.length === 0 ? (
                      <tr>
                        <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                          No hay roles registrados en el sistema.
                        </td>
                      </tr>
                    ) : (
                      roles.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((role) => (
                        <tr key={role.idRolUsuario}>
                          <td style={{ fontWeight: '600', color: 'var(--text-muted)' }}>#{role.idRolUsuario}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600' }}>
                              <ShieldCheck size={18} color="var(--primary-color)" />
                              <span>{role.nombreRol}</span>
                            </div>
                          </td>
                          <td className="col-actions">
                            <div className="actions-wrapper">
                              <button 
                                onClick={() => handleEditClick(role)}
                                className="btn btn-secondary" 
                                style={{ padding: '8px', borderRadius: '8px' }}
                                data-tooltip="Editar"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteClick(role)}
                                className="btn btn-danger" 
                                style={{ padding: '8px', borderRadius: '8px' }}
                                data-tooltip="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderTop: '1.5px solid var(--panel-border)',
                backgroundColor: 'rgba(0, 0, 0, 0.01)',
                borderRadius: '0 0 12px 12px'
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', height: '32px' }}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                >
                  Anterior
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                  Página {currentPage} de {Math.ceil(roles.length / ITEMS_PER_PAGE)}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', height: '32px' }}
                  disabled={currentPage === Math.ceil(roles.length / ITEMS_PER_PAGE)}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(roles.length / ITEMS_PER_PAGE)))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleManagement;
