import { Image, Layout as LayoutIcon, Palette, Save, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { backgroundImageUrl } from '../utils/backgroundStyle';
import { confirmDialog, notify, useNotificationMessage } from '../components/NotificationCenter';

const colorFields = [
  ['colorPrimario', 'Color primario'],
  ['colorSecundario', 'Color secundario'],
  ['colorAcento', 'Color de acento'],
  ['colorFondo', 'Color de fondo']
];

// Zona → etiqueta y dimensiones exactas requeridas (ancho x alto).
const backgroundZones = [
  { code: 'login', label: 'Inicio de sesión', width: 1920, height: 1080, module: 'configuracion_sistema' },
  { code: 'sidebar', label: 'Menú lateral', width: 600, height: 2024, module: 'configuracion_sistema' },
  { code: 'ventas', label: 'Ventas', width: 1920, height: 1080, module: 'ventas' },
  { code: 'comandas', label: 'Comandas', width: 1920, height: 1080, module: 'comandas' },
  { code: 'carta', label: 'Carta de productos', width: 1920, height: 1080, module: 'ventas' }
];

const logoLocationModules = {
  punto_venta: 'ventas',
  boletas: 'ventas'
};

const editableBranding = (branding) => ({
  ...branding,
  nombreComercial: branding.nombreComercial?.trim().toLowerCase() === 'sgal app'
    ? ''
    : branding.nombreComercial
});

const BrandingSettings = () => {
  const { can } = useAuth();
  const { branding, backgrounds, enabledModules, refreshConfiguration } = useOrganization();
  const [form, setForm] = useState(() => editableBranding(branding));
  const [logos, setLogos] = useState([]);
  const [locations, setLocations] = useState([]);
  const [newLogoName, setNewLogoName] = useState('');
  const [message, setMessage] = useNotificationMessage('success');
  const [error, setError] = useNotificationMessage('error');
  const [saving, setSaving] = useState(false);
  const bgErrors = {};
  const [previewZone, setPreviewZone] = useState(null);
  const canEdit = can('configuracion_sistema.marca.editar');
  const visibleLocations = locations.filter(location => {
    const requiredModule = logoLocationModules[location.codigo];
    return !requiredModule || enabledModules.includes(requiredModule);
  });
  const enabledModuleCodes = new Set(enabledModules.map(code => code.toLowerCase()));
  const visibleBackgroundZones = backgroundZones.filter(zone => enabledModuleCodes.has(zone.module));
  useDocumentTitle('Identidad de la organización');

  const loadLogos = useCallback(async () => {
    const response = await fetch('/api/organization-configuration/branding/logos', { cache: 'no-store' });
    if (!response.ok) throw new Error('No fue posible cargar la biblioteca de logos.');
    const data = await response.json();
    setLogos(data.logos || []);
    setLocations(data.ubicaciones || []);
  }, []);

  useEffect(() => { setForm(editableBranding(branding)); }, [branding]);
  useEffect(() => { loadLogos().catch(exception => setError(exception.message)); }, [loadLogos]);

  const update = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));
  const toggle = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.checked }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/organization-configuration/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible guardar la identidad visual.');
      }
      await refreshConfiguration();
      setMessage('Identidad visual actualizada.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const uploadLogos = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setSaving(true); setMessage(''); setError('');
    try {
      for (const [index, file] of files.entries()) {
        const body = new FormData();
        body.append('file', file);
        if (newLogoName.trim()) {
          body.append('nombre', files.length === 1 ? newLogoName.trim() : `${newLogoName.trim()} ${index + 1}`);
        }
        const response = await fetch('/api/organization-configuration/branding/logos', { method: 'POST', body });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.mensaje || `No fue posible subir ${file.name} (${index + 1} de ${files.length}).`);
        }
      }
      setNewLogoName('');
      await loadLogos();
      setMessage(`${files.length} ${files.length === 1 ? 'logo cargado' : 'logos cargados'} correctamente.`);
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); event.target.value = ''; }
  };

  const persistLocations = async (logo, nextLocations, confirmReplacement) => {
    const response = await fetch(`/api/organization-configuration/branding/logos/${logo.idLogo}/locations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ubicaciones: nextLocations, confirmarReemplazo: confirmReplacement })
    });

    if (response.status === 409 && !confirmReplacement) {
      const data = await response.json().catch(() => ({}));
      const details = (data.conflictos || []).map(conflict => `${conflict.nombreUbicacion}: ${conflict.nombreLogo}`).join('\n');
      const confirmed = await confirmDialog({ title: 'Reemplazar logo', message: `${data.mensaje || 'La ubicación ya utiliza otro logo.'}${details ? `\n\n${details}` : ''}`, confirmText: 'Reemplazar' });
      if (!confirmed) return false;
      return persistLocations(logo, nextLocations, true);
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.mensaje || 'No fue posible actualizar las ubicaciones del logo.');
    }
    return true;
  };

  const toggleLocation = async (logo, locationCode) => {
    if (!canEdit || saving) return;
    const selected = logo.ubicaciones.includes(locationCode);
    let confirmed = false;

    if (!selected) {
      const currentOwner = logos.find(item => item.idLogo !== logo.idLogo && item.ubicaciones.includes(locationCode));
      if (currentOwner) {
        const locationName = locations.find(item => item.codigo === locationCode)?.nombre || locationCode;
        confirmed = await confirmDialog({ title: 'Reemplazar logo', message: `“${locationName}” ya utiliza el logo “${currentOwner.nombre}”.\n\n¿Deseas reemplazarlo por “${logo.nombre}”?`, confirmText: 'Reemplazar' });
        if (!confirmed) return;
      }
    }

    const nextLocations = selected
      ? logo.ubicaciones.filter(code => code !== locationCode)
      : [...logo.ubicaciones, locationCode];

    setSaving(true); setMessage(''); setError('');
    try {
      const changed = await persistLocations(logo, nextLocations, confirmed);
      if (!changed) return;
      await Promise.all([loadLogos(), refreshConfiguration()]);
      setMessage('Ubicaciones del logo actualizadas.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const deleteLogo = async (logo) => {
    if (!await confirmDialog({ title: 'Eliminar logo', message: `El logo “${logo.nombre}” también dejará de mostrarse en sus ubicaciones asignadas.`, confirmText: 'Eliminar', tone: 'danger' })) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch(`/api/organization-configuration/branding/logos/${logo.idLogo}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No fue posible eliminar el logo.');
      await Promise.all([loadLogos(), refreshConfiguration()]);
      setMessage('Logo eliminado.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const setZoneError = (_zona, mensaje) => { if (mensaje) notify.error(mensaje); };

  const uploadBackground = async (zona, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaving(true); setMessage(''); setZoneError(zona, '');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/organization-configuration/backgrounds/${zona}`, { method: 'POST', body });
      if (response.status === 413) throw new Error('La imagen supera el tamaño permitido (máximo 6 MB).');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || `No fue posible subir la imagen (error ${response.status}).`);
      }
      await refreshConfiguration();
      setMessage('Imagen de fondo actualizada.');
    } catch (exception) { setZoneError(zona, exception.message); }
    finally { setSaving(false); }
  };

  const toggleBackground = async (zona, habilitado) => {
    setSaving(true); setMessage(''); setZoneError(zona, '');
    try {
      const response = await fetch(`/api/organization-configuration/backgrounds/${zona}/enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habilitado })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible actualizar el fondo.');
      }
      await refreshConfiguration();
    } catch (exception) { setZoneError(zona, exception.message); }
    finally { setSaving(false); }
  };

  const removeBackground = async (zona, label) => {
    if (!await confirmDialog({ title: 'Quitar imagen de fondo', message: `Se quitará la imagen configurada para “${label}”.`, confirmText: 'Quitar', tone: 'danger' })) return;
    setSaving(true); setMessage(''); setZoneError(zona, '');
    try {
      const response = await fetch(`/api/organization-configuration/backgrounds/${zona}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No fue posible quitar la imagen de fondo.');
      await refreshConfiguration();
      setMessage('Imagen de fondo eliminada.');
    } catch (exception) { setZoneError(zona, exception.message); }
    finally { setSaving(false); }
  };

  return <div className="animate-fade-in">
    <div className="page-header"><h2 className="page-title">Identidad de la organización</h2><Palette color="var(--primary-color)" /></div>
    {message && <div className="badge badge-success" style={{ marginBottom: 16, padding: 12 }}>{message}</div>}
    {error && <div className="badge badge-danger" style={{ marginBottom: 16, padding: 12 }}>{error}</div>}

    <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 18 }}>Datos y colores</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="input-group"><label className="input-label">Nombre comercial</label><input className="input-field" maxLength={120} required disabled={!canEdit} placeholder="Nombre de su empresa" value={form.nombreComercial || ''} onChange={update('nombreComercial')} /></div>
        <div className="input-group"><label className="input-label">Razón social</label><input className="input-field" maxLength={180} disabled={!canEdit} value={form.razonSocial || ''} onChange={update('razonSocial')} /></div>
        <div className="input-group"><label className="input-label">Descripción breve</label><input className="input-field" maxLength={300} disabled={!canEdit} value={form.descripcion || ''} onChange={update('descripcion')} /></div>
        <div className="input-group"><label className="input-label">Mensaje al pie de documentos</label><input className="input-field" maxLength={250} disabled={!canEdit} value={form.textoPieDocumentos || ''} onChange={update('textoPieDocumentos')} /></div>
        <div className="input-group"><label className="input-label">Contacto público</label><input className="input-field" maxLength={160} placeholder="Sitio web, teléfono o redes sociales" disabled={!canEdit} value={form.contactoPublico || ''} onChange={update('contactoPublico')} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {colorFields.map(([field, label]) => <label key={field} className="input-group"><span className="input-label">{label}</span><div style={{ display: 'flex', gap: 8 }}><input type="color" disabled={!canEdit} value={form[field] || '#000000'} onChange={update(field)} style={{ width: 48, height: 44, border: 0, background: 'transparent' }} /><input className="input-field" pattern="#[0-9A-Fa-f]{6}" maxLength={7} required disabled={!canEdit} value={form[field] || ''} onChange={update(field)} /></div></label>)}
      </div>

      <h3 style={{ margin: '22px 0 6px' }}>Comprobantes</h3>
      <p style={{ margin: '0 0 14px', fontSize: '.85rem', color: 'var(--text-secondary, #64748b)' }}>
        El comprobante siempre muestra la fecha, el logo y los productos con sus cantidades y subtotales (con descuentos). Elija qué información adicional incluir.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.9rem', cursor: canEdit ? 'pointer' : 'default' }}>
          <input type="checkbox" disabled={!canEdit} checked={form.boletaMuestraVendedor ?? true} onChange={toggle('boletaMuestraVendedor')} />
          Mostrar el nombre de quien atendió (vendedor/cajero)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.9rem', cursor: canEdit ? 'pointer' : 'default' }}>
          <input type="checkbox" disabled={!canEdit} checked={form.boletaMuestraPago ?? true} onChange={toggle('boletaMuestraPago')} />
          Mostrar el detalle del método de pago y el vuelto
        </label>
        <div className="input-group">
          <label className="input-label">Cola personalizada del comprobante</label>
          <input className="input-field" maxLength={250} disabled={!canEdit} placeholder="Texto propio al pie del comprobante (independiente del mensaje al pie de documentos)" value={form.boletaColaPersonalizada || ''} onChange={update('boletaColaPersonalizada')} />
        </div>
      </div>

      {canEdit && <button className="btn btn-primary" disabled={saving} type="submit" style={{ marginTop: 18 }}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar identidad'}</button>}
    </form>

    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Image size={19} /> Biblioteca de logos</h3>
        {canEdit && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="input-group" style={{ margin: 0 }}><span className="input-label">Nombre opcional</span><input className="input-field" maxLength={120} placeholder="Se usa el nombre del archivo" value={newLogoName} disabled={saving} onChange={event => setNewLogoName(event.target.value)} /></label>
          <label className="btn btn-primary" style={{ cursor: saving ? 'wait' : 'pointer' }}><Upload size={16} /> Subir logos<input type="file" accept="image/png,image/jpeg" multiple hidden disabled={saving} onChange={uploadLogos} /></label>
        </div>}
      </div>

      {!logos.length ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--panel-border)', borderRadius: 12 }}>Todavía no hay logos cargados.</div> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
          {logos.map(logo => <article key={logo.idLogo} style={{ border: '1px solid var(--panel-border)', borderRadius: 14, padding: 16, background: 'var(--bg-color)' }}>
            <div style={{ minHeight: 125, display: 'grid', placeItems: 'center', background: 'var(--primary-color)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <img src={`/api/organization-configuration/branding/logos/${logo.idLogo}/content?v=${encodeURIComponent(logo.fechaActualizacion)}`} alt={logo.nombre} style={{ maxWidth: '100%', maxHeight: 100, objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}><strong style={{ display: 'block' }}>{logo.nombre}</strong><small style={{ color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{logo.nombreArchivo}</small></div>
              {canEdit && <button type="button" className="btn btn-danger" title="Eliminar logo" disabled={saving} onClick={() => deleteLogo(logo)} style={{ padding: 8 }}><Trash2 size={15} /></button>}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {visibleLocations.map(location => <label key={location.codigo} title={location.descripcion} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.84rem', cursor: canEdit ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={logo.ubicaciones.includes(location.codigo)} disabled={!canEdit || saving} onChange={() => toggleLocation(logo, location.codigo)} />
                <span>{location.nombre}</span>
              </label>)}
            </div>
          </article>)}
        </div>}
    </section>

    <section className="card" style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><LayoutIcon size={19} /> Fondos personalizados</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {visibleBackgroundZones.map(({ code: zona, label, width: ancho, height: alto }) => {
          const config = backgrounds[zona] || {};
          const tieneImagen = Boolean(config.tieneImagen);
          return (
            <article key={zona} style={{ border: '1px solid var(--panel-border)', borderRadius: 14, padding: 16, background: 'var(--bg-color)' }}>
              <div
                onClick={() => tieneImagen && setPreviewZone(zona)}
                title={tieneImagen ? 'Ver imagen completa' : undefined}
                style={{
                  height: 130, borderRadius: 10, marginBottom: 12, display: 'grid', placeItems: 'center', overflow: 'hidden',
                  background: '#eef2f7', border: '1px solid var(--panel-border)', cursor: tieneImagen ? 'zoom-in' : 'default'
                }}>
                {tieneImagen
                  ? <img src={backgroundImageUrl(zona, config.version)} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Sin imagen</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong>{label}</strong>
                <small style={{ color: 'var(--text-muted)' }}>{ancho} × {alto} px</small>
              </div>
              {bgErrors[zona] && <div className="badge badge-danger" style={{ marginTop: 10, padding: 10, fontSize: '.78rem', whiteSpace: 'normal' }}>{bgErrors[zona]}</div>}
              {tieneImagen && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', margin: '10px 0', cursor: canEdit ? 'pointer' : 'default' }}>
                  <input type="checkbox" disabled={!canEdit || saving} checked={Boolean(config.habilitado)} onChange={e => toggleBackground(zona, e.target.checked)} />
                  Mostrar este fondo
                </label>
              )}
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: tieneImagen ? 0 : 12 }}>
                  <label className="btn btn-primary" style={{ cursor: saving ? 'wait' : 'pointer', fontSize: '.8rem' }}>
                    <Upload size={15} /> {tieneImagen ? 'Reemplazar' : 'Subir imagen'}
                    <input type="file" accept="image/png,image/jpeg" hidden disabled={saving} onChange={e => uploadBackground(zona, e)} />
                  </label>
                  {tieneImagen && <button type="button" className="btn btn-danger" disabled={saving} onClick={() => removeBackground(zona, label)} style={{ fontSize: '.8rem' }}><Trash2 size={15} /> Quitar</button>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>

    {previewZone && (() => {
      const preview = visibleBackgroundZones.find(zone => zone.code === previewZone);
      const plabel = preview?.label;
      const pancho = preview?.width;
      const palto = preview?.height;
      const pconfig = backgrounds[previewZone] || {};
      return (
        <div onClick={() => setPreviewZone(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24
        }}>
          <div style={{ color: '#fff', fontWeight: 700, display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span>{plabel}</span>
            <span style={{ fontSize: '.8rem', opacity: 0.8 }}>{pancho} × {palto} px</span>
          </div>
          <img
            src={backgroundImageUrl(previewZone, pconfig.version)}
            alt={plabel}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}
          />
          <button type="button" className="btn" onClick={() => setPreviewZone(null)} style={{ display: 'flex', gap: 6 }}><X size={16} /> Cerrar</button>
        </div>
      );
    })()}
  </div>;
};

export default BrandingSettings;
