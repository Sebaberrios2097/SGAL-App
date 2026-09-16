import { Image, Palette, Save, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const colorFields = [
  ['colorPrimario', 'Color primario'],
  ['colorSecundario', 'Color secundario'],
  ['colorAcento', 'Color de acento'],
  ['colorFondo', 'Color de fondo']
];

const BrandingSettings = () => {
  const { can } = useAuth();
  const { branding, refreshConfiguration } = useOrganization();
  const [form, setForm] = useState(branding);
  const [logos, setLogos] = useState([]);
  const [locations, setLocations] = useState([]);
  const [newLogoName, setNewLogoName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = can('configuracion_sistema.marca.editar');
  useDocumentTitle('Identidad de la organización');

  const loadLogos = useCallback(async () => {
    const response = await fetch('/api/organization-configuration/branding/logos', { cache: 'no-store' });
    if (!response.ok) throw new Error('No fue posible cargar la biblioteca de logos.');
    const data = await response.json();
    setLogos(data.logos || []);
    setLocations(data.ubicaciones || []);
  }, []);

  useEffect(() => { setForm(branding); }, [branding]);
  useEffect(() => { loadLogos().catch(exception => setError(exception.message)); }, [loadLogos]);

  const update = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));

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
      const confirmed = window.confirm(`${data.mensaje || 'La ubicación ya utiliza otro logo.'}${details ? `\n\n${details}` : ''}\n\n¿Deseas reemplazarlo?`);
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
        confirmed = window.confirm(`“${locationName}” ya utiliza el logo “${currentOwner.nombre}”.\n\n¿Deseas reemplazarlo por “${logo.nombre}”?`);
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
    if (!window.confirm(`¿Eliminar el logo “${logo.nombre}”? También dejará de mostrarse en sus ubicaciones asignadas.`)) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch(`/api/organization-configuration/branding/logos/${logo.idLogo}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No fue posible eliminar el logo.');
      await Promise.all([loadLogos(), refreshConfiguration()]);
      setMessage('Logo eliminado.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  return <div className="animate-fade-in">
    <div className="page-header"><div><h2 className="page-title">Identidad de la organización</h2><p className="page-subtitle">Configura los datos, colores y logos utilizados en cada área de la instalación.</p></div><Palette color="var(--primary-color)" /></div>
    {message && <div className="badge badge-success" style={{ marginBottom: 16, padding: 12 }}>{message}</div>}
    {error && <div className="badge badge-danger" style={{ marginBottom: 16, padding: 12 }}>{error}</div>}

    <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 18 }}>Datos y colores</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="input-group"><label className="input-label">Nombre comercial</label><input className="input-field" maxLength={120} required disabled={!canEdit} value={form.nombreComercial || ''} onChange={update('nombreComercial')} /></div>
        <div className="input-group"><label className="input-label">Razón social</label><input className="input-field" maxLength={180} disabled={!canEdit} value={form.razonSocial || ''} onChange={update('razonSocial')} /></div>
        <div className="input-group"><label className="input-label">Descripción breve</label><input className="input-field" maxLength={300} disabled={!canEdit} value={form.descripcion || ''} onChange={update('descripcion')} /></div>
        <div className="input-group"><label className="input-label">Mensaje al pie de documentos</label><input className="input-field" maxLength={250} disabled={!canEdit} value={form.textoPieDocumentos || ''} onChange={update('textoPieDocumentos')} /></div>
        <div className="input-group"><label className="input-label">Contacto público</label><input className="input-field" maxLength={160} placeholder="Sitio web, teléfono o redes sociales" disabled={!canEdit} value={form.contactoPublico || ''} onChange={update('contactoPublico')} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {colorFields.map(([field, label]) => <label key={field} className="input-group"><span className="input-label">{label}</span><div style={{ display: 'flex', gap: 8 }}><input type="color" disabled={!canEdit} value={form[field] || '#000000'} onChange={update(field)} style={{ width: 48, height: 44, border: 0, background: 'transparent' }} /><input className="input-field" pattern="#[0-9A-Fa-f]{6}" maxLength={7} required disabled={!canEdit} value={form[field] || ''} onChange={update(field)} /></div></label>)}
      </div>
      {canEdit && <button className="btn btn-primary" disabled={saving} type="submit"><Save size={17} /> {saving ? 'Guardando…' : 'Guardar identidad'}</button>}
    </form>

    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <div><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Image size={19} /> Biblioteca de logos</h3><p style={{ color: 'var(--text-muted)', fontSize: '.84rem', marginTop: 5 }}>Puedes cargar cualquier cantidad. Cada ubicación admite un solo logo, pero un mismo logo puede utilizarse en varias.</p></div>
        {canEdit && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="input-group" style={{ margin: 0 }}><span className="input-label">Nombre opcional</span><input className="input-field" maxLength={120} placeholder="Se usa el nombre del archivo" value={newLogoName} disabled={saving} onChange={event => setNewLogoName(event.target.value)} /></label>
          <label className="btn btn-primary" style={{ cursor: saving ? 'wait' : 'pointer' }}><Upload size={16} /> Subir logos<input type="file" accept="image/png,image/jpeg" multiple hidden disabled={saving} onChange={uploadLogos} /></label>
        </div>}
      </div>

      {!logos.length ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--panel-border)', borderRadius: 12 }}>Todavía no hay logos cargados.</div> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
          {logos.map(logo => <article key={logo.idLogo} style={{ border: '1px solid var(--panel-border)', borderRadius: 14, padding: 16, background: 'var(--bg-color)' }}>
            <div style={{ minHeight: 125, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <img src={`/api/organization-configuration/branding/logos/${logo.idLogo}/content?v=${encodeURIComponent(logo.fechaActualizacion)}`} alt={logo.nombre} style={{ maxWidth: '100%', maxHeight: 100, objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}><strong style={{ display: 'block' }}>{logo.nombre}</strong><small style={{ color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{logo.nombreArchivo}</small></div>
              {canEdit && <button type="button" className="btn btn-danger" title="Eliminar logo" disabled={saving} onClick={() => deleteLogo(logo)} style={{ padding: 8 }}><Trash2 size={15} /></button>}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {locations.map(location => <label key={location.codigo} title={location.descripcion} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.84rem', cursor: canEdit ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={logo.ubicaciones.includes(location.codigo)} disabled={!canEdit || saving} onChange={() => toggleLocation(logo, location.codigo)} />
                <span>{location.nombre}</span>
              </label>)}
            </div>
          </article>)}
        </div>}
    </section>
  </div>;
};

export default BrandingSettings;
