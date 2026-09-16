import {
    AlertCircle,
    Calendar,
    Check,
    Key,
    Mail,
    Phone,
    Plus,
    Shield,
    UserCheck,
    UserPlus,
    UserX,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSuccessUserModal, setShowSuccessUserModal] = useState(false);

  // New Employee state
  const [newEmpRut, setNewEmpRut] = useState('');
  const [newEmpDv, setNewEmpDv] = useState('');
  const [newEmpNombres, setNewEmpNombres] = useState('');
  const [newEmpAp1, setNewEmpAp1] = useState('');
  const [newEmpAp2, setNewEmpAp2] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [addEmpError, setAddEmpError] = useState('');
  const [addEmpLoading, setAddEmpLoading] = useState(false);

  // Selected User for Role/Password management
  const [selectedEmp, setSelectedEmp] = useState(null);

  // Roles assign state
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Admin password reset state
  const [adminNewPass, setAdminNewPass] = useState('');
  const [adminConfirmNewPass, setAdminConfirmNewPass] = useState('');
  const [passResetError, setPassResetError] = useState('');
  const [passResetLoading, setPassResetLoading] = useState(false);
  const [passResetSuccess, setPassResetSuccess] = useState('');

  // Created User success display state
  const [createdUserInfo, setCreatedUserInfo] = useState(null);

  // Pagination and Contact state
  const [currentPage, setCurrentPage] = useState(1);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactEmp, setContactEmp] = useState(null);
  const ITEMS_PER_PAGE = 5;

  // Wizard state for registration
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardEmployee, setWizardEmployee] = useState(null);
  const [wizardRoles, setWizardRoles] = useState([]);

  // Form validation errors state
  const [formErrors, setFormErrors] = useState({});
  const [passErrors, setPassErrors] = useState({});

  const openContactModal = (emp) => {
    setContactEmp(emp);
    setShowContactModal(true);
  };

  // Reset pagination if employees count changes
  useEffect(() => {
    const totalPages = Math.ceil(employees.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [employees.length, currentPage]);

  useEffect(() => {
    document.title = "Gestión de Usuarios - Siete Vidas";
    fetchEmployees();
    fetchRoles();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employee');
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'Error al obtener empleados');
      setEmployees(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/role');
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'Error al obtener roles');
      setRoles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const validateRut = (rutStr, dvStr) => {
    if (!rutStr || !dvStr) return false;
    const cleanRut = rutStr.toString().replace(/\./g, '').replace(/-/g, '').trim();
    const cleanDv = dvStr.toString().trim().toUpperCase();

    let sum = 0;
    let multiplier = 2;
    for (let i = cleanRut.length - 1; i >= 0; i--) {
      sum += parseInt(cleanRut[i], 10) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = sum % 11;
    const calculatedDv = 11 - remainder;

    let expectedDv = '';
    if (calculatedDv === 11) expectedDv = '0';
    else if (calculatedDv === 10) expectedDv = 'K';
    else expectedDv = calculatedDv.toString();

    return expectedDv === cleanDv;
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!newEmpRut) errors.rut = 'El RUT es obligatorio';
    if (!newEmpDv) errors.dv = 'El DV es obligatorio';
    if (!newEmpNombres) errors.nombres = 'El nombre es obligatorio';
    if (!newEmpAp1) errors.apellido1 = 'El apellido paterno es obligatorio';

    if (newEmpRut && newEmpDv && !validateRut(newEmpRut, newEmpDv)) {
      errors.rut = 'El RUT ingresado no es válido (dígito verificador incorrecto)';
      errors.dv = 'Inválido';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setAddEmpError('Por favor complete los campos obligatorios y corrija los errores.');
      return;
    }

    setFormErrors({});
    setAddEmpError('');
    setAddEmpLoading(true);

    try {
      const response = await fetch('/api/employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rut: parseInt(newEmpRut, 10),
          dv: newEmpDv.toUpperCase(),
          nombres: newEmpNombres,
          apellido1: newEmpAp1,
          apellido2: newEmpAp2 || null,
          numeroTelefono: newEmpPhone ? parseInt(newEmpPhone, 10) : null,
          correo: newEmpEmail || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al registrar el empleado');
      }

      setWizardEmployee(data);
      setWizardStep(2);
      setWizardRoles([]); // clear selected roles
    } catch (err) {
      setAddEmpError(err.message);
    } finally {
      setAddEmpLoading(false);
    }
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    if (!wizardEmployee) return;

    setAddEmpLoading(true);
    setAddEmpError('');

    try {
      // 1. Create user account
      const userResponse = await fetch(`/api/employee/${wizardEmployee.rut}/create-user`, {
        method: 'POST'
      });
      const userData = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error(userData.mensaje || 'Error al crear la cuenta de usuario');
      }

      // 2. Assign roles
      if (wizardRoles.length > 0) {
        const rolesResponse = await fetch(`/api/role/users/${userData.idUsuario}/roles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roleIds: wizardRoles })
        });
        const rolesData = await rolesResponse.json();
        if (!rolesResponse.ok) {
          throw new Error(rolesData.mensaje || 'Error al asignar los roles al usuario');
        }
      }

      // Show success modal
      setCreatedUserInfo({
        empleado: wizardEmployee,
        username: userData.nombreUsuario,
        defaultPass: wizardEmployee.rut.toString(),
        mensaje: userData.mensaje
      });

      setShowSuccessUserModal(true);
      setShowAddEmpModal(false);
      resetWizard();
      await fetchEmployees();
    } catch (err) {
      setAddEmpError(err.message);
    } finally {
      setAddEmpLoading(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setWizardEmployee(null);
    setWizardRoles([]);
    setNewEmpRut('');
    setNewEmpDv('');
    setNewEmpNombres('');
    setNewEmpAp1('');
    setNewEmpAp2('');
    setNewEmpPhone('');
    setNewEmpEmail('');
    setAddEmpError('');
    setFormErrors({});
  };

  const handleOmitUserCreation = async () => {
    setShowAddEmpModal(false);
    resetWizard();
    await fetchEmployees();
  };

  const handleCloseWizard = () => {
    if (wizardStep === 2) {
      handleOmitUserCreation();
    } else {
      setShowAddEmpModal(false);
      resetWizard();
    }
  };

  const handleCreateUserAccount = async (emp) => {
    if (!window.confirm(`¿Desea crear una cuenta de usuario para ${emp.nombres} ${emp.apellido1}?`)) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/employee/${emp.rut}/create-user`, {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al crear la cuenta de usuario');
      }

      setCreatedUserInfo({
        empleado: emp,
        username: data.nombreUsuario,
        defaultPass: emp.rut.toString(), // RUT is default password
        mensaje: data.mensaje
      });

      setShowSuccessUserModal(true);
      await fetchEmployees();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (emp) => {
    const actionText = emp.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Está seguro de que desea ${actionText} a ${emp.nombres} ${emp.apellido1}?`)) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/employee/${emp.idEmpleado}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(!emp.activo)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al actualizar el estado');
      }

      await fetchEmployees();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openRolesModal = (emp) => {
    setSelectedEmp(emp);
    // Preset current active role IDs
    const currentRoleIds = emp.usuario ? emp.usuario.roles.map(r => r.idRolUsuario) : [];
    setSelectedRoles(currentRoleIds);
    setShowRolesModal(true);
  };

  const handleRoleCheckboxChange = (roleId) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const handleSaveRolesSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmp || !selectedEmp.usuario) return;

    setRolesLoading(true);

    try {
      const response = await fetch(`/api/role/users/${selectedEmp.usuario.idUsuario}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roleIds: selectedRoles })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al guardar los roles');
      }

      await fetchEmployees();
      setShowRolesModal(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setRolesLoading(false);
    }
  };

  const openPasswordModal = (emp) => {
    setSelectedEmp(emp);
    setAdminNewPass('');
    setAdminConfirmNewPass('');
    setPassResetError('');
    setPassResetSuccess('');
    setPassErrors({});
    setShowPasswordModal(true);
  };

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!adminNewPass) errors.newPass = 'La contraseña es obligatoria';
    if (!adminConfirmNewPass) errors.confirmPass = 'Debe confirmar la contraseña';

    if (adminNewPass && adminNewPass.length < 4) {
      errors.newPass = 'La contraseña debe tener al menos 4 caracteres';
    }

    if (adminNewPass && adminConfirmNewPass && adminNewPass !== adminConfirmNewPass) {
      errors.confirmPass = 'Las contraseñas no coinciden';
    }

    if (Object.keys(errors).length > 0) {
      setPassErrors(errors);
      setPassResetError('Por favor corrija los errores marcados.');
      return;
    }

    setPassErrors({});
    setPassResetError('');
    setPassResetLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idUsuario: selectedEmp.usuario.idUsuario,
          passActual: '', // Not required as admin is true
          passNueva: adminNewPass,
          esAdmin: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Error al reestablecer contraseña');
      }

      setPassResetSuccess('Contraseña restablecida con éxito');
      setTimeout(() => {
        setShowPasswordModal(false);
      }, 1500);
    } catch (err) {
      setPassResetError(err.message);
    } finally {
      setPassResetLoading(false);
    }
  };

  const formatRut = (rut, dv) => {
    if (!rut) return '';
    const rutStr = rut.toString();
    let result = '';
    let count = 0;
    for (let i = rutStr.length - 1; i >= 0; i--) {
      result = rutStr[i] + result;
      count++;
      if (count === 3 && i > 0) {
        result = '.' + result;
        count = 0;
      }
    }
    return `${result}-${dv}`;
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split(/[T\s]/)[0].split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      return `${day}/${month}/${year}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString();
  };

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h2 className="page-title text-gradient">Gestión de Usuarios</h2>
          <p className="page-subtitle">Lista de empleados, creación de cuentas y control de accesos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddEmpModal(true)}>
          <Plus size={18} />
          <span>Registrar Empleado</span>
        </button>
      </header>

      {error && (
        <div className="badge badge-danger" style={{ padding: '16px', borderRadius: '10px', width: '100%', marginBottom: '20px', textTransform: 'none' }}>
          <AlertCircle size={18} style={{ marginRight: '8px' }} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <div style={{
            border: '4px solid rgba(212, 163, 115, 0.1)',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            borderLeftColor: 'var(--primary-color)',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-scroll-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Ingreso</th>
                  <th>Cuenta de Acceso</th>
                  <th>Roles</th>
                  <th>Estado</th>
                  <th className="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                      No hay empleados registrados.
                    </td>
                  </tr>
                ) : (
                  employees.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((emp) => (
                    <tr key={emp.idEmpleado}>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                          {emp.nombres} {emp.apellido1} {emp.apellido2}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: '500' }}>
                          RUT: {formatRut(emp.rut, emp.dv)}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <Calendar size={12} />
                          <span>{formatDateString(emp.fechaIngreso)}</span>
                        </div>
                      </td>
                      <td>
                        {emp.usuario ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                              {emp.usuario.nombreUsuario}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Creado: {formatDateString(emp.usuario.fechaCreacion)}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleCreateUserAccount(emp)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}
                            disabled={!emp.activo}
                          >
                            <UserPlus size={14} />
                            <span>Crear Usuario</span>
                          </button>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '180px' }}>
                          {emp.usuario && emp.usuario.roles.length > 0 ? (
                            emp.usuario.roles.map((r, i) => (
                              <span key={i} className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                                {r.nombreRol}
                              </span>
                            ))
                          ) : emp.usuario ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)', fontStyle: 'italic' }}>
                              Sin roles
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>-</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${emp.activo ? 'badge-success' : 'badge-danger'}`}>
                          {emp.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="actions-wrapper">
                          <button
                            onClick={() => openContactModal(emp)}
                            className="btn btn-secondary"
                            style={{ padding: '4px', borderRadius: '6px' }}
                            data-tooltip="Ver Contacto"
                          >
                            <Phone size={14} />
                          </button>
                          {emp.usuario && (
                            <>
                              <button
                                onClick={() => openRolesModal(emp)}
                                className="btn btn-secondary"
                                style={{ padding: '4px', borderRadius: '6px' }}
                                data-tooltip="Roles"
                                disabled={!emp.activo}
                              >
                                <Shield size={14} />
                              </button>
                              <button
                                onClick={() => openPasswordModal(emp)}
                                className="btn btn-secondary"
                                style={{ padding: '4px', borderRadius: '6px' }}
                                data-tooltip="Reestablecer Clave"
                                disabled={!emp.activo}
                              >
                                <Key size={14} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleToggleStatus(emp)}
                            className={`btn ${emp.activo ? 'btn-danger' : 'btn-primary'}`}
                            style={{ padding: '4px', borderRadius: '6px' }}
                            data-tooltip={emp.activo ? 'Desactivar' : 'Activar'}
                          >
                            {emp.activo ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {employees.length > ITEMS_PER_PAGE && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px',
              borderTop: '1.5px solid var(--panel-border)',
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              borderRadius: '0 0 12px 12px'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '0.85rem', height: '36px' }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                Anterior
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                Página {currentPage} de {Math.ceil(employees.length / ITEMS_PER_PAGE)}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '0.85rem', height: '36px' }}
                disabled={currentPage === Math.ceil(employees.length / ITEMS_PER_PAGE)}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(employees.length / ITEMS_PER_PAGE)))}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Registrar Empleado (Step Wizard) */}
      {showAddEmpModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <button className="btn" style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} onClick={handleCloseWizard}>
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.5rem', marginBottom: '20px', fontWeight: '700' }} className="text-gradient">
              {wizardStep === 1 ? 'Registrar Nuevo Empleado' : 'Asignación de Roles y Cuenta'}
            </h3>

            {/* Step Wizard indicator */}
            <div style={{
              display: 'flex',
              borderBottom: '2px solid var(--panel-border)',
              marginBottom: '24px',
              paddingBottom: '12px',
              gap: '24px'
            }}>
              <div style={{
                fontWeight: '700',
                fontSize: '0.95rem',
                color: wizardStep === 1 ? 'var(--primary-color)' : 'var(--text-muted)',
                borderBottom: wizardStep === 1 ? '3px solid var(--primary-color)' : 'none',
                paddingBottom: '12px',
                marginBottom: '-14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  background: wizardStep === 1 ? 'var(--primary-color)' : 'var(--panel-border)',
                  color: wizardStep === 1 ? '#ffffff' : 'var(--text-muted)',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}>1</span>
                Datos Personales
              </div>
              <div style={{
                fontWeight: '700',
                fontSize: '0.95rem',
                color: wizardStep === 2 ? 'var(--primary-color)' : 'var(--text-muted)',
                borderBottom: wizardStep === 2 ? '3px solid var(--primary-color)' : 'none',
                paddingBottom: '12px',
                marginBottom: '-14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  background: wizardStep === 2 ? 'var(--primary-color)' : 'var(--panel-border)',
                  color: wizardStep === 2 ? '#ffffff' : 'var(--text-muted)',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}>2</span>
                Acceso y Roles
              </div>
            </div>

            {addEmpError && (
              <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px', borderRadius: '8px', textTransform: 'none', marginBottom: '20px' }}>
                <AlertCircle size={16} />
                <span>{addEmpError}</span>
              </div>
            )}

            {wizardStep === 1 ? (
              <form onSubmit={handleStep1Submit} noValidate>
                <div style={{ display: 'flex', gap: '16px', marginBottom: formErrors.rut || formErrors.dv ? '8px' : '20px' }}>
                   <div className="input-group" style={{ flex: '4', marginBottom: 0 }}>
                    <label className="input-label">RUT (sin puntos)</label>
                    <input
                      type="number"
                      placeholder="ej. 12345678"
                      className="input-field"
                      value={newEmpRut}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, 8); // Limitar a máximo 8 dígitos
                        setNewEmpRut(val);
                        if (formErrors.rut) setFormErrors({ ...formErrors, rut: null });
                      }}
                      style={{
                        borderColor: formErrors.rut ? '#ef4444' : 'var(--panel-border)',
                        boxShadow: formErrors.rut ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                      }}
                    />
                  </div>
                  <div className="input-group" style={{ flex: '1', marginBottom: 0 }}>
                    <label className="input-label">DV</label>
                    <input
                      type="text"
                      maxLength="1"
                      placeholder="ej. 9"
                      className="input-field"
                      value={newEmpDv}
                      onChange={(e) => {
                        setNewEmpDv(e.target.value);
                        if (formErrors.dv) setFormErrors({ ...formErrors, dv: null });
                      }}
                      style={{
                        borderColor: formErrors.dv ? '#ef4444' : 'var(--panel-border)',
                        boxShadow: formErrors.dv ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                      }}
                    />
                  </div>
                </div>
                {(formErrors.rut || formErrors.dv) && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '-12px', marginBottom: '20px', fontWeight: '600' }}>
                    {formErrors.rut || formErrors.dv}
                  </div>
                )}

                <div className="input-group" style={{ marginBottom: formErrors.nombres ? '8px' : '20px' }}>
                  <label className="input-label">Nombres</label>
                  <input
                    type="text"
                    placeholder="ej. Juan Andrés"
                    className="input-field"
                    value={newEmpNombres}
                    onChange={(e) => {
                      setNewEmpNombres(e.target.value);
                      if (formErrors.nombres) setFormErrors({ ...formErrors, nombres: null });
                    }}
                    style={{
                      borderColor: formErrors.nombres ? '#ef4444' : 'var(--panel-border)',
                      boxShadow: formErrors.nombres ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                    }}
                  />
                  {formErrors.nombres && (
                    <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px', fontWeight: '600' }}>
                      {formErrors.nombres}
                    </div>
                  )}
                </div>

                <div className="grid-cols-2" style={{ marginBottom: formErrors.apellido1 ? '8px' : '20px' }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label">Apellido Paterno</label>
                    <input
                      type="text"
                      placeholder="ej. Pérez"
                      className="input-field"
                      value={newEmpAp1}
                      onChange={(e) => {
                        setNewEmpAp1(e.target.value);
                        if (formErrors.apellido1) setFormErrors({ ...formErrors, apellido1: null });
                      }}
                      style={{
                        borderColor: formErrors.apellido1 ? '#ef4444' : 'var(--panel-border)',
                        boxShadow: formErrors.apellido1 ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                      }}
                    />
                    {formErrors.apellido1 && (
                      <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px', fontWeight: '600' }}>
                        {formErrors.apellido1}
                      </div>
                    )}
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label">Apellido Materno</label>
                    <input
                      type="text"
                      placeholder="ej. González"
                      className="input-field"
                      value={newEmpAp2}
                      onChange={(e) => setNewEmpAp2(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid-cols-2">
                  <div className="input-group">
                    <label className="input-label">Teléfono</label>
                    <input
                      type="number"
                      placeholder="ej. 912345678"
                      className="input-field"
                      value={newEmpPhone}
                      onChange={(e) => setNewEmpPhone(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="juan.perez@gmail.cl"
                      className="input-field"
                      value={newEmpEmail}
                      onChange={(e) => setNewEmpEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button type="button" className="btn btn-secondary" onClick={handleCloseWizard}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={addEmpLoading}>
                    {addEmpLoading ? 'Guardando...' : 'Siguiente'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStep2Submit}>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '16px', fontWeight: '600' }}>
                  Seleccione los roles que tendrá la cuenta de acceso para <strong style={{ color: 'var(--primary-color)' }}>{wizardEmployee.nombres} {wizardEmployee.apellido1}</strong>:
                </p>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1.5px solid var(--panel-border)',
                  borderRadius: '10px',
                  padding: '16px',
                  backgroundColor: 'rgba(0, 0, 0, 0.01)',
                  marginBottom: '20px'
                }}>
                  {roles.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No hay roles registrados en el sistema.</div>
                  ) : (
                    roles.map((r) => (
                      <label key={r.idRolUsuario} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem' }}>
                        <input
                          type="checkbox"
                          checked={wizardRoles.includes(r.idRolUsuario)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setWizardRoles([...wizardRoles, r.idRolUsuario]);
                            } else {
                              setWizardRoles(wizardRoles.filter(id => id !== r.idRolUsuario));
                            }
                          }}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)' }}
                        />
                         <span>{r.nombreRol}</span>
                      </label>
                    ))
                  )}
                </div>

                <div className="badge badge-warning" style={{
                  display: 'flex',
                  gap: '8px',
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  textTransform: 'none',
                  marginBottom: '24px',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  textAlign: 'left'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>Se creará automáticamente la cuenta de acceso. La contraseña inicial será el RUT del empleado, y se le solicitará cambiarla obligatoriamente al iniciar sesión por primera vez.</span>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button type="button" className="btn btn-secondary" onClick={handleOmitUserCreation}>Finalizar sin Usuario</button>
                  <button type="submit" className="btn btn-primary" disabled={addEmpLoading}>
                    {addEmpLoading ? 'Guardando...' : 'Crear Usuario y Guardar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Gestionar Roles */}
      {showRolesModal && selectedEmp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <button className="btn" style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} onClick={() => setShowRolesModal(false)}>
              <X size={20} color="var(--text-muted)" />
            </button>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">Gestionar Roles</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Usuario: <strong style={{ color: 'var(--primary-color)' }}>{selectedEmp.usuario.nombreUsuario}</strong> ({selectedEmp.nombres} {selectedEmp.apellido1})
            </p>

            <form onSubmit={handleSaveRolesSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
                {roles.length === 0 ? (
                  <p style={{ color: 'var(--text-dark)', fontSize: '0.9rem', textAlign: 'center' }}>No hay roles registrados en el sistema.</p>
                ) : (
                  roles.map((role) => (
                    <label
                      key={role.idRolUsuario}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(18, 16, 14, 0.4)',
                        border: '1px solid var(--panel-border)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(212, 163, 115, 0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--panel-border)'}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.idRolUsuario)}
                        onChange={() => handleRoleCheckboxChange(role.idRolUsuario)}
                        style={{
                          width: '18px',
                          height: '18px',
                          accentColor: 'var(--primary-color)',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>{role.nombreRol}</span>
                    </label>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRolesModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={rolesLoading}>
                  {rolesLoading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Restablecer Contraseña (Admin) */}
      {showPasswordModal && selectedEmp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <button className="btn" style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} onClick={() => setShowPasswordModal(false)}>
              <X size={20} color="var(--text-muted)" />
            </button>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">Restablecer Contraseña</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Usuario: <strong style={{ color: 'var(--primary-color)' }}>{selectedEmp.usuario.nombreUsuario}</strong>
            </p>

            {passResetError && (
              <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px', borderRadius: '8px', textTransform: 'none', marginBottom: '20px' }}>
                <AlertCircle size={16} />
                <span>{passResetError}</span>
              </div>
            )}

            {passResetSuccess && (
              <div className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px', borderRadius: '8px', textTransform: 'none', marginBottom: '20px' }}>
                <Check size={16} />
                <span>{passResetSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAdminResetPassword} noValidate>
              <div className="input-group" style={{ marginBottom: passErrors.newPass ? '8px' : '20px' }}>
                <label className="input-label">Nueva Contraseña</label>
                <input
                  type="password"
                  placeholder="Mínimo 4 caracteres"
                  className="input-field"
                  value={adminNewPass}
                  onChange={(e) => {
                    setAdminNewPass(e.target.value);
                    if (passErrors.newPass) setPassErrors({ ...passErrors, newPass: null });
                  }}
                  disabled={passResetLoading || !!passResetSuccess}
                  style={{
                    borderColor: passErrors.newPass ? '#ef4444' : 'var(--panel-border)',
                    boxShadow: passErrors.newPass ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                  }}
                />
                {passErrors.newPass && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px', fontWeight: '600' }}>
                    {passErrors.newPass}
                  </div>
                )}
              </div>

              <div className="input-group" style={{ marginBottom: passErrors.confirmPass ? '12px' : '24px' }}>
                <label className="input-label">Confirmar Contraseña</label>
                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  className="input-field"
                  value={adminConfirmNewPass}
                  onChange={(e) => {
                    setAdminConfirmNewPass(e.target.value);
                    if (passErrors.confirmPass) setPassErrors({ ...passErrors, confirmPass: null });
                  }}
                  disabled={passResetLoading || !!passResetSuccess}
                  style={{
                    borderColor: passErrors.confirmPass ? '#ef4444' : 'var(--panel-border)',
                    boxShadow: passErrors.confirmPass ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                  }}
                />
                {passErrors.confirmPass && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px', fontWeight: '600' }}>
                    {passErrors.confirmPass}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={passResetLoading || !!passResetSuccess}>
                  {passResetLoading ? 'Restableciendo...' : 'Restablecer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Éxito Creación de Usuario */}
      {showSuccessUserModal && createdUserInfo && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', textAlign: 'center' }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              border: '2px solid var(--success-color)',
              boxShadow: '0 0 20px var(--success-glow)'
            }}>
              <Check size={32} color="var(--success-color)" />
            </div>

            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">¡Cuenta Creada con Éxito!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>
              Se ha creado el usuario para el empleado <strong style={{ color: 'var(--text-main)' }}>{createdUserInfo.empleado.nombres} {createdUserInfo.empleado.apellido1}</strong>.
            </p>

            <div style={{
              backgroundColor: 'rgba(0, 76, 37, 0.04)',
              border: '1.5px solid rgba(0, 76, 37, 0.1)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '28px',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0, 76, 37, 0.08)', paddingBottom: '8px' }}>
                <span style={{ color: '#475569', fontSize: '0.85rem', fontWeight: '600' }}>Usuario Creado:</span>
                <span style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{createdUserInfo.username}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569', fontSize: '0.85rem', fontWeight: '600' }}>Clave Temporal (RUT):</span>
                <span style={{ fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-main)' }}>{createdUserInfo.defaultPass}</span>
              </div>
            </div>

            <div className="badge badge-warning" style={{
              display: 'flex',
              gap: '8px',
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              textTransform: 'none',
              marginBottom: '24px',
              fontSize: '0.8rem',
              lineHeight: '1.4',
              textAlign: 'left'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>El empleado deberá usar su RUT como contraseña para su primer inicio de sesión. El sistema le solicitará cambiarla inmediatamente.</span>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowSuccessUserModal(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal: Información de Contacto */}
      {showContactModal && contactEmp && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <button
              className="btn"
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }}
              onClick={() => setShowContactModal(false)}
            >
              <X size={20} color="var(--text-muted)" />
            </button>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">Datos de Contacto</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Empleado: <strong style={{ color: 'var(--text-main)' }}>{contactEmp.nombres} {contactEmp.apellido1}</strong>
            </p>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              backgroundColor: 'rgba(0, 76, 37, 0.02)',
              border: '1.5px solid var(--panel-border)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0, 76, 37, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-color)'
                }}>
                  <Phone size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.02em' }}>Teléfono</div>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)' }}>
                    {contactEmp.numeroTelefono ? `+${contactEmp.numeroTelefono}` : 'No registrado'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0, 76, 37, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-color)'
                }}>
                  <Mail size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.02em' }}>Correo Electrónico</div>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                    {contactEmp.correo ? contactEmp.correo : 'No registrado'}
                  </div>
                </div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowContactModal(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
