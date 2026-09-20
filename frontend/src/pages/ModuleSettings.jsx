import { Boxes, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import ModuleCatalog from '../components/ModuleCatalog';
import { notify } from '../components/NotificationCenter';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const ModuleSettings = () => {
  const { refreshConfiguration } = useOrganization();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [turnsRequireReconciliation, setTurnsRequireReconciliation] = useState(true);
  const [logbookIncludesCalibration, setLogbookIncludesCalibration] = useState(true);
  useDocumentTitle('Módulos de la instalación');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/organization-configuration/modules');
      if (!response.ok) throw new Error('No fue posible cargar los módulos.');
      const data = await response.json();
      setModules(data.modulos || data);
      setTurnsRequireReconciliation(data.turnosRequierenCuadratura ?? true);
      setLogbookIncludesCalibration(data.bitacoraIncluyeCalibracion ?? true);
    } catch (exception) { notify.error(exception.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/organization-configuration/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigosHabilitados: modules.filter(x => x.habilitado).map(x => x.codigo),
          turnosRequierenCuadratura: turnsRequireReconciliation,
          bitacoraIncluyeCalibracion: logbookIncludesCalibration
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible actualizar los módulos.');
      }
      await refreshConfiguration();
      await load();
      notify.success('Módulos de la instalación actualizados. Los permisos efectivos se recalcularán al iniciar una nueva sesión.');
    } catch (exception) { notify.error(exception.message); }
    finally { setSaving(false); }
  };

  return <div className="animate-fade-in">
    <div className="page-header"><h2 className="page-title">Módulos de la instalación</h2><Boxes color="var(--primary-color)" /></div>
    {loading ? <div className="card">Cargando módulos…</div> : <>
      <p style={{ color: 'var(--text-muted)', margin: '-4px 0 24px', maxWidth: 760 }}>
        Defina las áreas disponibles para esta instalación. Las dependencias se activan automáticamente y los módulos nucleares permanecen siempre disponibles.
      </p>
      <ModuleCatalog
        modules={modules}
        onChange={setModules}
        configurationByCode={{
          ventas: <>
            <span className="module-inline-configuration-title">Configuración</span>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={turnsRequireReconciliation}
                onChange={event => setTurnsRequireReconciliation(event.target.checked)}
              />
              <span><strong>Requerir cuadratura</strong><small>Solicita efectivo inicial y arqueo al cerrar.</small></span>
            </label>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={logbookIncludesCalibration}
                onChange={event => setLogbookIncludesCalibration(event.target.checked)}
              />
              <span><strong>Incluir calibraciones</strong><small>Habilita extracciones y café calibrable.</small></span>
            </label>
          </>
        }}
      />
      <div className="module-save-bar">
        <div><strong>{modules.filter(module => module.habilitado).length} módulos habilitados</strong><span>Los cambios se aplican a toda la instalación.</span></div>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar configuración'}</button>
      </div>
    </>}
  </div>;
};

export default ModuleSettings;
