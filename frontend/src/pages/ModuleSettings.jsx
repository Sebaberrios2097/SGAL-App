import { Boxes, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import ModuleCatalog from '../components/ModuleCatalog';
import { notify } from '../components/NotificationCenter';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { POS_SORT_FIELDS } from '../utils/posOrdering';

const moduleSelectionSignature = (modules) => modules
  .map(module => ({
    codigo: module.codigo,
    habilitado: module.habilitado,
    todas: module.todasFuncionalidadesHabilitadas !== false,
    funcionalidades: (module.funcionalidades || []).filter(feature => feature.habilitada !== false)
      .map(feature => feature.codigo).sort()
  }))
  .sort((left, right) => left.codigo.localeCompare(right.codigo))
  .map(module => `${module.codigo}:${module.habilitado ? 1 : 0}:${module.todas ? '*' : module.funcionalidades.join('|')}`)
  .join(';');

const ModuleSettings = () => {
  const { refreshConfiguration } = useOrganization();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [licenseEnabled, setLicenseEnabled] = useState(false);
  const [syncingLicense, setSyncingLicense] = useState(false);
  const [turnsRequireReconciliation, setTurnsRequireReconciliation] = useState(true);
  const [turnsAllowMultipleActive, setTurnsAllowMultipleActive] = useState(false);
  const [logbookIncludesCalibration, setLogbookIncludesCalibration] = useState(true);
  const [posGroupByCategory, setPosGroupByCategory] = useState(true);
  const [posSortField, setPosSortField] = useState('nombre');
  const [posSortDirection, setPosSortDirection] = useState('asc');
  const [posShowSearch, setPosShowSearch] = useState(true);
  const [posShowCategories, setPosShowCategories] = useState(true);
  const [posAllowSaleWithoutStock, setPosAllowSaleWithoutStock] = useState(false);
  const [cajaShowCashButtons, setCajaShowCashButtons] = useState(true);
  const [cajaRequireReconciliation, setCajaRequireReconciliation] = useState(true);
  const [cajaTipsEnabled, setCajaTipsEnabled] = useState(false);
  const [workdayOpening, setWorkdayOpening] = useState('06:00');
  const [workdayClosing, setWorkdayClosing] = useState('02:00');
  // Instantánea de lo guardado, para detectar cambios sin guardar.
  const [baseline, setBaseline] = useState(null);
  useDocumentTitle('Módulos de la instalación');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/organization-configuration/modules');
      if (!response.ok) throw new Error('No fue posible cargar los módulos.');
      const data = await response.json();
      const loadedModules = data.modulos || data;
      setModules(loadedModules);
      setTurnsRequireReconciliation(data.turnosRequierenCuadratura ?? true);
      setTurnsAllowMultipleActive(data.turnosPermitirMultiplesActivos ?? false);
      setLogbookIncludesCalibration(data.bitacoraIncluyeCalibracion ?? true);
      setPosGroupByCategory(data.posAgruparPorCategoria ?? true);
      setPosSortField(data.posOrdenProductos ?? 'nombre');
      setPosSortDirection(data.posOrdenDireccion ?? 'asc');
      setPosShowSearch(data.posMostrarBuscador ?? true);
      setPosShowCategories(data.posMostrarCategorias ?? true);
      setPosAllowSaleWithoutStock(data.posPermitirVentaSinStock ?? false);
      setCajaShowCashButtons(data.cajaMostrarBotonesEfectivo ?? true);
      setCajaRequireReconciliation(data.cajaRequiereCuadratura ?? true);
      setCajaTipsEnabled(data.cajaPropinasHabilitadas ?? false);
      setWorkdayOpening((data.jornadaHoraApertura || '06:00').slice(0, 5));
      setWorkdayClosing((data.jornadaHoraCierre || '02:00').slice(0, 5));
      setBaseline({
        codigos: loadedModules.filter(x => x.habilitado).map(x => x.codigo).sort().join(','),
        moduleSelection: moduleSelectionSignature(loadedModules),
        turnsRequireReconciliation: data.turnosRequierenCuadratura ?? true,
        turnsAllowMultipleActive: data.turnosPermitirMultiplesActivos ?? false,
        logbookIncludesCalibration: data.bitacoraIncluyeCalibracion ?? true,
        posGroupByCategory: data.posAgruparPorCategoria ?? true,
        posSortField: data.posOrdenProductos ?? 'nombre',
        posSortDirection: data.posOrdenDireccion ?? 'asc',
        posShowSearch: data.posMostrarBuscador ?? true,
        posShowCategories: data.posMostrarCategorias ?? true,
        posAllowSaleWithoutStock: data.posPermitirVentaSinStock ?? false,
        cajaShowCashButtons: data.cajaMostrarBotonesEfectivo ?? true,
        cajaRequireReconciliation: data.cajaRequiereCuadratura ?? true,
        cajaTipsEnabled: data.cajaPropinasHabilitadas ?? false,
        workdayOpening: (data.jornadaHoraApertura || '06:00').slice(0, 5),
        workdayClosing: (data.jornadaHoraCierre || '02:00').slice(0, 5)
      });
    } catch (exception) { notify.error(exception.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    fetch('/api/license/status')
      .then(response => (response.ok ? response.json() : null))
      .then(data => setLicenseEnabled(Boolean(data?.enabled)))
      .catch(() => {});
  }, []);

  const syncLicense = async () => {
    setSyncingLicense(true);
    try {
      const response = await fetch('/api/license/refresh', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible sincronizar la licencia.');
      await refreshConfiguration();
      await load();
      notify.success(data.mensaje || 'Licencia sincronizada.');
    } catch (exception) { notify.error(exception.message); }
    finally { setSyncingLicense(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/organization-configuration/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigosHabilitados: modules.filter(x => x.habilitado).map(x => x.codigo),
          codigosModulosConTodasFuncionalidades: modules
            .filter(module => module.habilitado && module.todasFuncionalidadesHabilitadas !== false)
            .map(module => module.codigo),
          codigosFuncionalidadesHabilitadas: modules
            .filter(module => module.habilitado && module.todasFuncionalidadesHabilitadas === false)
            .flatMap(module => (module.funcionalidades || []).filter(feature => feature.habilitada !== false).map(feature => feature.codigo)),
          turnosRequierenCuadratura: turnsRequireReconciliation,
          turnosPermitirMultiplesActivos: turnsAllowMultipleActive,
          bitacoraIncluyeCalibracion: logbookIncludesCalibration,
          posAgruparPorCategoria: posGroupByCategory,
          posOrdenProductos: posSortField,
          posOrdenDireccion: posSortDirection,
          posMostrarBuscador: posShowSearch,
          posMostrarCategorias: posShowCategories,
          posPermitirVentaSinStock: posAllowSaleWithoutStock,
          cajaMostrarBotonesEfectivo: cajaShowCashButtons,
          cajaRequiereCuadratura: cajaRequireReconciliation,
          cajaPropinasHabilitadas: cajaTipsEnabled,
          jornadaHoraApertura: workdayOpening,
          jornadaHoraCierre: workdayClosing
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

  // Detección de cambios sin guardar frente a la última configuración cargada.
  const modulesDirty = baseline != null
    && moduleSelectionSignature(modules) !== baseline.moduleSelection;
  const ventasSettingsDirty = baseline != null && (
    turnsRequireReconciliation !== baseline.turnsRequireReconciliation
    || turnsAllowMultipleActive !== baseline.turnsAllowMultipleActive
    || logbookIncludesCalibration !== baseline.logbookIncludesCalibration
    || posGroupByCategory !== baseline.posGroupByCategory
    || posSortField !== baseline.posSortField
    || posSortDirection !== baseline.posSortDirection
    || posShowSearch !== baseline.posShowSearch
    || posShowCategories !== baseline.posShowCategories
    || posAllowSaleWithoutStock !== baseline.posAllowSaleWithoutStock
    || workdayOpening !== baseline.workdayOpening
    || workdayClosing !== baseline.workdayClosing
  );
  const cajaSettingsDirty = baseline != null && (
    cajaShowCashButtons !== baseline.cajaShowCashButtons
    || cajaRequireReconciliation !== baseline.cajaRequireReconciliation
    || cajaTipsEnabled !== baseline.cajaTipsEnabled
  );
  // Con licencia central, el catálogo es informativo: solo los ajustes operativos se guardan aquí.
  const isDirty = (!licenseEnabled && modulesDirty) || ventasSettingsDirty || cajaSettingsDirty;

  return <div className="animate-fade-in">
    <div className="page-header"><h2 className="page-title">Módulos de la instalación</h2><Boxes color="var(--primary-color)" /></div>
    {licenseEnabled && <div className="card" style={{ background: '#eff6ff', borderLeft: '4px solid var(--primary-color)', marginBottom: 12, fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span>Los módulos de esta instalación se administran desde tu <strong>licencia</strong>; los cambios aquí no se aplican. Puedes seguir ajustando las configuraciones operativas.</span>
      <button type="button" className="btn btn-secondary" disabled={syncingLicense} onClick={syncLicense}>
        <RefreshCw size={16} /> {syncingLicense ? 'Sincronizando…' : 'Sincronizar ahora'}
      </button>
    </div>}
    {loading ? <div className="card">Cargando módulos…</div> : <>
      <p style={{ color: 'var(--text-muted)', margin: '-4px 0 24px', maxWidth: 760 }}>
        Defina las áreas disponibles para esta instalación. Las dependencias se activan automáticamente y los módulos nucleares permanecen siempre disponibles.
      </p>
      <ModuleCatalog
        modules={modules}
        onChange={setModules}
        readOnly={licenseEnabled}
        dirtyByCode={{ ventas: ventasSettingsDirty, caja: cajaSettingsDirty }}
        settingsByCode={{
          caja: <>
            <span className="module-settings-section-title">Cobro</span>
            <label className="module-inline-option">
              <input type="checkbox" checked={cajaTipsEnabled} onChange={event => setCajaTipsEnabled(event.target.checked)} />
              <span><strong>Permitir propinas</strong><small>Registra y muestra las propinas informadas por la terminal de pago.</small></span>
            </label>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={cajaShowCashButtons}
                onChange={event => setCajaShowCashButtons(event.target.checked)}
              />
              <span><strong>Mostrar botones de pago rápido y denominaciones</strong><small>Muestra los atajos de efectivo (pago rápido y billetes) al cobrar. Ocúltalos para un cobro más simple.</small></span>
            </label>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={cajaRequireReconciliation}
                onChange={event => setCajaRequireReconciliation(event.target.checked)}
              />
              <span><strong>Permitir cuadratura y arqueo</strong><small>En el turno transversal, solicita apertura de efectivo y arqueo a los usuarios que operan Caja.</small></span>
            </label>
          </>,
          ventas: <>
            <span className="module-settings-section-title">Jornada operacional</span>
            <div className="module-settings-fields">
              <label className="module-settings-field"><span>Hora de apertura</span><input type="time" value={workdayOpening} onChange={event => setWorkdayOpening(event.target.value)} /></label>
              <label className="module-settings-field"><span>Hora de cierre</span><input type="time" value={workdayClosing} onChange={event => setWorkdayClosing(event.target.value)} /></label>
            </div>
            <small style={{ color: 'var(--text-muted)' }}>Define cuándo cambia el día operacional y cuándo se reinicia el correlativo visual de ventas. Si el cierre es anterior a la apertura, se entiende como el día siguiente.</small>
            <span className="module-settings-section-title">Turnos</span>
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
                checked={turnsAllowMultipleActive}
                onChange={event => setTurnsAllowMultipleActive(event.target.checked)}
              />
              <span><strong>Permitir múltiples turnos activos</strong><small>Permite que distintos usuarios trabajen simultáneamente. Cada usuario solo puede mantener un turno abierto.</small></span>
            </label>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={logbookIncludesCalibration}
                onChange={event => setLogbookIncludesCalibration(event.target.checked)}
              />
              <span><strong>Incluir calibraciones</strong><small>Habilita extracciones y café calibrable.</small></span>
            </label>

            <span className="module-settings-section-title">Catálogo</span>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={posShowSearch}
                onChange={event => setPosShowSearch(event.target.checked)}
              />
              <span><strong>Mostrar buscador</strong><small>Añade un campo para buscar productos por nombre.</small></span>
            </label>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={posShowCategories}
                onChange={event => setPosShowCategories(event.target.checked)}
              />
              <span><strong>Mostrar categorías</strong><small>Muestra los filtros por categoría. Conviene ocultarlos si hay demasiadas.</small></span>
            </label>

            <span className="module-settings-section-title">Stock</span>
            <label className="module-inline-option">
              <input
                type="checkbox"
                checked={posAllowSaleWithoutStock}
                onChange={event => setPosAllowSaleWithoutStock(event.target.checked)}
              />
              <span><strong>Permitir vender sin stock</strong><small>Deja vender un producto aunque no tenga stock disponible (el stock puede quedar en negativo).</small></span>
            </label>

            <span className="module-settings-section-title">Vista de productos</span>
            <label className="module-inline-option">
              <input
                type="radio"
                name="pos-agrupacion"
                checked={posGroupByCategory}
                onChange={() => setPosGroupByCategory(true)}
              />
              <span><strong>Agrupados por categoría</strong><small>Cada categoría se muestra en su propia sección.</small></span>
            </label>
            <label className="module-inline-option">
              <input
                type="radio"
                name="pos-agrupacion"
                checked={!posGroupByCategory}
                onChange={() => setPosGroupByCategory(false)}
              />
              <span><strong>Lista única</strong><small>Todos los productos juntos, con el orden que elijas.</small></span>
            </label>

            {!posGroupByCategory && (
              <div className="module-settings-fields">
                <label className="module-settings-field">
                  <span>Ordenar por</span>
                  <select value={posSortField} onChange={event => setPosSortField(event.target.value)}>
                    {POS_SORT_FIELDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="module-settings-field">
                  <span>Dirección</span>
                  <select value={posSortDirection} onChange={event => setPosSortDirection(event.target.value)}>
                    <option value="asc">Ascendente</option>
                    <option value="desc">Descendente</option>
                  </select>
                </label>
              </div>
            )}
          </>
        }}
      />
      <div className={`module-save-bar${isDirty ? ' is-dirty' : ''}`}>
        <div>
          {isDirty
            ? <strong className="module-save-bar-unsaved"><span className="module-unsaved-dot" /> Cambios sin guardar</strong>
            : <strong>{modules.filter(module => module.habilitado).length} módulos habilitados</strong>}
          <span>{isDirty
            ? 'Guarda para aplicar los ajustes operativos a la instalación.'
            : licenseEnabled
              ? 'Los módulos reflejan la licencia central; sus ajustes operativos siguen siendo locales.'
              : 'Los cambios se aplican a toda la instalación.'}</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={saving || !isDirty} onClick={save}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar configuración'}</button>
      </div>
    </>}
  </div>;
};

export default ModuleSettings;
