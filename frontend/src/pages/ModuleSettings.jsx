import { Boxes, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const ModuleSettings = () => {
  const { refreshConfiguration } = useOrganization();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useDocumentTitle('Módulos de la instalación');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/organization-configuration/modules');
      if (!response.ok) throw new Error('No fue posible cargar los módulos.');
      setModules(await response.json());
    } catch (exception) { setError(exception.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = (code) => setModules(items => items.map(item => item.codigo === code && !item.esNucleo ? { ...item, habilitado: !item.habilitado } : item));

  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/organization-configuration/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigosHabilitados: modules.filter(x => x.habilitado).map(x => x.codigo) })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible actualizar los módulos.');
      }
      await refreshConfiguration();
      await load();
      setMessage('Módulos de la instalación actualizados. Los permisos efectivos se recalcularán al iniciar una nueva sesión.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  return <div className="animate-fade-in">
    <div className="page-header"><h2 className="page-title">Módulos de la instalación</h2><Boxes color="var(--primary-color)" /></div>
    {message && <div className="badge badge-success" style={{ marginBottom: 16, padding: 12 }}>{message}</div>}
    {error && <div className="badge badge-danger" style={{ marginBottom: 16, padding: 12 }}>{error}</div>}
    {loading ? <div className="card">Cargando módulos…</div> : <>
      <div style={{ display: 'grid', gap: 12 }}>
        {modules.map(module => <label key={module.codigo} className="card" style={{ padding: 18, display: 'flex', gap: 16, alignItems: 'center', cursor: module.esNucleo ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={module.habilitado} disabled={module.esNucleo} onChange={() => toggle(module.codigo)} style={{ width: 20, height: 20 }} />
          <div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><strong>{module.nombre}</strong>{module.esNucleo && <span className="badge"><ShieldCheck size={12} /> Núcleo</span>}</div><small style={{ color: 'var(--text-muted)' }}>{module.codigo} · {module.cantidadPermisos} permisos{module.dependencias?.length ? ` · Requiere: ${module.dependencias.join(', ')}` : ''}</small></div>
        </label>)}
      </div>
      <button type="button" className="btn btn-primary" disabled={saving} onClick={save} style={{ marginTop: 18 }}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar módulos'}</button>
    </>}
  </div>;
};

export default ModuleSettings;
