import { Image, Palette, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import BrandLogo from '../components/BrandLogo';
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = can('configuracion_sistema.marca.editar');
  useDocumentTitle('Identidad de la organización');

  useEffect(() => { setForm(branding); }, [branding]);

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

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/organization-configuration/branding/logo', { method: 'POST', body });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible subir el logo.');
      }
      await refreshConfiguration();
      setMessage('Logo actualizado.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); event.target.value = ''; }
  };

  const deleteLogo = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/organization-configuration/branding/logo', { method: 'DELETE' });
      if (!response.ok) throw new Error('No fue posible eliminar el logo.');
      await refreshConfiguration();
      setMessage('Se eliminó el logo personalizado.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  return <div className="animate-fade-in">
    <div className="page-header"><div><h2 className="page-title">Identidad de la organización</h2><p className="page-subtitle">Nombre, logo y cuatro colores compartidos por toda la instalación.</p></div><Palette color="var(--primary-color)" /></div>
    {message && <div className="badge badge-success" style={{ marginBottom: 16, padding: 12 }}>{message}</div>}
    {error && <div className="badge badge-danger" style={{ marginBottom: 16, padding: 12 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .8fr) minmax(320px, 1.5fr)', gap: 20 }}>
      <section className="card">
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 }}><Image size={19} /> Logo</h3>
        <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', border: '1px dashed var(--panel-border)', borderRadius: 12, padding: 20, marginBottom: 16 }}><BrandLogo maxHeight={100} /></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginBottom: 14 }}>PNG o JPEG. Máximo 2 MB. El mismo logo se usa en acceso, menú y documentos.</p>
        {canEdit && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="btn btn-primary" style={{ cursor: saving ? 'wait' : 'pointer' }}><Upload size={16} /> Subir logo<input type="file" accept="image/png,image/jpeg" hidden disabled={saving} onChange={uploadLogo} /></label>
          {branding.tieneLogo && <button type="button" className="btn btn-danger" disabled={saving} onClick={deleteLogo}><Trash2 size={16} /> Eliminar</button>}
        </div>}
      </section>
      <form className="card" onSubmit={save}>
        <div className="input-group"><label className="input-label">Nombre comercial</label><input className="input-field" maxLength={120} required disabled={!canEdit} value={form.nombreComercial || ''} onChange={update('nombreComercial')} /></div>
        <div className="input-group"><label className="input-label">Razón social</label><input className="input-field" maxLength={180} disabled={!canEdit} value={form.razonSocial || ''} onChange={update('razonSocial')} /></div>
        <div className="input-group"><label className="input-label">Descripción breve</label><input className="input-field" maxLength={300} disabled={!canEdit} value={form.descripcion || ''} onChange={update('descripcion')} /></div>
        <div className="input-group"><label className="input-label">Mensaje al pie de documentos</label><input className="input-field" maxLength={250} disabled={!canEdit} value={form.textoPieDocumentos || ''} onChange={update('textoPieDocumentos')} /></div>
        <div className="input-group"><label className="input-label">Contacto público</label><input className="input-field" maxLength={160} placeholder="Sitio web, teléfono o redes sociales" disabled={!canEdit} value={form.contactoPublico || ''} onChange={update('contactoPublico')} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))', gap: 14 }}>
          {colorFields.map(([field, label]) => <label key={field} className="input-group"><span className="input-label">{label}</span><div style={{ display: 'flex', gap: 8 }}><input type="color" disabled={!canEdit} value={form[field] || '#000000'} onChange={update(field)} style={{ width: 48, height: 44, border: 0, background: 'transparent' }} /><input className="input-field" pattern="#[0-9A-Fa-f]{6}" maxLength={7} required disabled={!canEdit} value={form[field] || ''} onChange={update(field)} /></div></label>)}
        </div>
        {canEdit && <button className="btn btn-primary" disabled={saving} type="submit"><Save size={17} /> {saving ? 'Guardando…' : 'Guardar identidad'}</button>}
      </form>
    </div>
  </div>;
};

export default BrandingSettings;
