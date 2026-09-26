import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import SearchableSelect from './SearchableSelect';

/**
 * Selector opcional de cliente del CRM para asignarlo a una venta. Se muestra solo si el módulo
 * `clientes` está habilitado y el usuario tiene el permiso de verlos; en caso contrario no renderiza
 * nada, de modo que el flujo de venta no cambia cuando el CRM no está activo.
 */
const ClienteSelect = ({ value, onChange, disabled = false, label = 'Cliente (opcional)' }) => {
  const { can } = useAuth();
  const { isModuleEnabled } = useOrganization();
  const [clientes, setClientes] = useState([]);
  const enabled = isModuleEnabled('clientes') && can('clientes.ver');

  useEffect(() => {
    if (!enabled) return;
    fetch('/api/clientes?includeInactive=false')
      .then(response => (response.ok ? response.json() : []))
      .then(setClientes)
      .catch(() => setClientes([]));
  }, [enabled]);

  if (!enabled) return null;

  const options = [
    { value: '', label: 'Sin cliente' },
    ...clientes.map(cliente => ({
      value: String(cliente.idCliente),
      label: cliente.documento ? `${cliente.nombre} · ${cliente.documento}` : cliente.nombre
    }))
  ];

  return (
    <div className="input-group">
      <span className="input-label">{label}</span>
      <SearchableSelect
        options={options}
        value={value ? String(value) : ''}
        onChange={selected => onChange(selected ? Number(selected) : null)}
        placeholder="Sin cliente"
        noOptionsMessage="No hay clientes registrados"
        disabled={disabled}
      />
    </div>
  );
};

export default ClienteSelect;
