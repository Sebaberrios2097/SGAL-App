import { FileText, Info, Plug, Receipt, RefreshCw, Save, ShieldCheck, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useNotificationMessage } from '../components/NotificationCenter';

const emptyForm = {
  rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '',
  acteco: '', resolucionNumero: '', resolucionFecha: '', ambiente: 'certificacion',
  libredteUrl: '', smtpHost: '', smtpPuerto: '', smtpUsuario: '', smtpClave: '',
  correoRemitente: '', envioAutomaticoCorreo: true
};

// Normaliza la respuesta del API (números y fechas pueden venir null) al modelo del formulario.
// La clave SMTP nunca se devuelve; queda vacía (solo escritura).
const toForm = (emisor) => ({
  ...emptyForm,
  ...Object.fromEntries(Object.entries(emisor || {})
    .filter(([key]) => key in emptyForm && key !== 'smtpClave')
    .map(([key, value]) => [key, value ?? (key === 'envioAutomaticoCorreo' ? true : '')]))
});

// Convierte cadenas vacías a null y textos numéricos a enteros para el payload.
const toPayload = (form) => ({
  rut: form.rut.trim(),
  razonSocial: form.razonSocial.trim(),
  giro: form.giro.trim(),
  direccion: form.direccion.trim(),
  comuna: form.comuna.trim(),
  ciudad: form.ciudad.trim(),
  acteco: form.acteco === '' ? null : Number(form.acteco),
  resolucionNumero: form.resolucionNumero === '' ? null : Number(form.resolucionNumero),
  resolucionFecha: form.resolucionFecha || null,
  ambiente: form.ambiente,
  libredteUrl: form.libredteUrl.trim() || null,
  smtpHost: form.smtpHost.trim() || null,
  smtpPuerto: form.smtpPuerto === '' ? null : Number(form.smtpPuerto),
  smtpUsuario: form.smtpUsuario.trim() || null,
  smtpClave: form.smtpClave || null,
  correoRemitente: form.correoRemitente.trim() || null,
  envioAutomaticoCorreo: Boolean(form.envioAutomaticoCorreo)
});

const BoletasSettings = () => {
  const { can } = useAuth();
  const canEdit = can('configuracion_sistema.boletas.configurar');
  const [form, setForm] = useState(emptyForm);
  const [certInfo, setCertInfo] = useState({ cargado: false, nombre: null });
  const [smtpClaveConfigurada, setSmtpClaveConfigurada] = useState(false);
  const [folios, setFolios] = useState([]);
  const [certPassword, setCertPassword] = useState('');
  const [message, setMessage] = useNotificationMessage('success');
  const [error, setError] = useNotificationMessage('error');
  const [saving, setSaving] = useState(false);
  useDocumentTitle('Boletas y facturas (SII)');

  const load = useCallback(async () => {
    const response = await fetch('/api/dte/emisor', { cache: 'no-store' });
    if (!response.ok) throw new Error('No fue posible cargar la configuración del emisor.');
    const data = await response.json();
    setForm(toForm(data));
    setCertInfo({ cargado: Boolean(data.certificadoCargado), nombre: data.certificadoNombre || null });
    setSmtpClaveConfigurada(Boolean(data.smtpClaveConfigurada));
    setFolios(data.folios || []);
  }, []);

  useEffect(() => { load().catch(exception => setError(exception.message)); }, [load]);

  const update = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));
  const toggle = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.checked }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/dte/emisor', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form))
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible guardar la configuración del emisor.');
      }
      setForm(current => ({ ...current, smtpClave: '' }));
      await load();
      setMessage('Configuración del emisor guardada.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const checkConnection = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/dte/ping');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'LibreDTE no está disponible.');
      }
      setMessage('Conexión con LibreDTE correcta.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const emitirPrueba = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/dte/emitir-prueba', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible emitir la boleta de prueba.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('Boleta de prueba emitida (se abrió el PDF en otra pestaña).');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const uploadCertificate = async (event) => {
    event.preventDefault();
    const fileInput = event.target.elements.certificado;
    const file = fileInput?.files?.[0];
    if (!file) { setError('Adjunte el archivo del certificado.'); return; }
    if (!certPassword.trim()) { setError('Ingrese la clave del certificado.'); return; }
    setSaving(true); setMessage(''); setError('');
    try {
      const body = new FormData();
      body.append('certificado', file);
      body.append('clave', certPassword);
      const response = await fetch('/api/dte/certificado', { method: 'POST', body });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible guardar el certificado.');
      }
      setCertPassword('');
      fileInput.value = '';
      await load();
      setMessage('Certificado guardado.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const registerCaf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const body = new FormData();
      body.append('caf', file);
      const response = await fetch('/api/dte/caf', { method: 'POST', body });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible registrar el archivo CAF.');
      }
      await load();
      setMessage('CAF registrado.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  return <div className="animate-fade-in">
    <div className="page-header"><h2 className="page-title">Boletas y facturas (SII)</h2><Receipt color="var(--primary-color)" /></div>
    {message && <div className="badge badge-success" style={{ marginBottom: 16, padding: 12 }}>{message}</div>}
    {error && <div className="badge badge-danger" style={{ marginBottom: 16, padding: 12 }}>{error}</div>}

    <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 6 }}>Datos del emisor</h3>
      <p style={{ margin: '0 0 14px', fontSize: '.85rem', color: 'var(--text-secondary, #64748b)' }}>
        Estos datos aparecen en cada documento tributario. Deben coincidir con el RUT inscrito ante el SII.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div className="input-group"><label className="input-label">RUT</label><input className="input-field" maxLength={12} required disabled={!canEdit} placeholder="76.543.210-K" value={form.rut} onChange={update('rut')} /></div>
        <div className="input-group"><label className="input-label">Razón social</label><input className="input-field" maxLength={180} required disabled={!canEdit} value={form.razonSocial} onChange={update('razonSocial')} /></div>
        <div className="input-group"><label className="input-label">Giro</label><input className="input-field" maxLength={120} required disabled={!canEdit} value={form.giro} onChange={update('giro')} /></div>
        <div className="input-group"><label className="input-label">Código actividad (acteco)</label><input className="input-field" type="number" disabled={!canEdit} value={form.acteco} onChange={update('acteco')} /></div>
        <div className="input-group"><label className="input-label">Dirección</label><input className="input-field" maxLength={150} required disabled={!canEdit} value={form.direccion} onChange={update('direccion')} /></div>
        <div className="input-group"><label className="input-label">Comuna</label><input className="input-field" maxLength={60} required disabled={!canEdit} value={form.comuna} onChange={update('comuna')} /></div>
        <div className="input-group"><label className="input-label">Ciudad</label><input className="input-field" maxLength={60} required disabled={!canEdit} value={form.ciudad} onChange={update('ciudad')} /></div>
      </div>

      <h3 style={{ margin: '22px 0 6px' }}>Resolución y ambiente</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div className="input-group"><label className="input-label">N° resolución SII</label><input className="input-field" type="number" disabled={!canEdit} value={form.resolucionNumero} onChange={update('resolucionNumero')} /></div>
        <div className="input-group"><label className="input-label">Fecha resolución</label><input className="input-field" type="date" disabled={!canEdit} value={form.resolucionFecha} onChange={update('resolucionFecha')} /></div>
        <div className="input-group"><label className="input-label">Ambiente</label>
          <select className="input-field" disabled={!canEdit} value={form.ambiente} onChange={update('ambiente')}>
            <option value="certificacion">Certificación (maullin)</option>
            <option value="produccion">Producción (palena)</option>
          </select>
        </div>
        <div className="input-group"><label className="input-label">URL de LibreDTE</label><input className="input-field" maxLength={250} disabled={!canEdit} placeholder="http://localhost:8093" value={form.libredteUrl} onChange={update('libredteUrl')} /></div>
      </div>

      <h3 style={{ margin: '22px 0 6px' }}>Correo de facturas</h3>
      <p style={{ margin: '0 0 14px', fontSize: '.85rem', color: 'var(--text-secondary, #64748b)' }}>
        La factura se envía al receptor con su PDF y XML. SGAL-App realiza el envío con este servidor de correo.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div className="input-group"><label className="input-label">Servidor SMTP</label><input className="input-field" maxLength={150} disabled={!canEdit} value={form.smtpHost} onChange={update('smtpHost')} /></div>
        <div className="input-group"><label className="input-label">Puerto SMTP</label><input className="input-field" type="number" disabled={!canEdit} value={form.smtpPuerto} onChange={update('smtpPuerto')} /></div>
        <div className="input-group"><label className="input-label">Usuario SMTP</label><input className="input-field" maxLength={150} disabled={!canEdit} value={form.smtpUsuario} onChange={update('smtpUsuario')} /></div>
        <div className="input-group"><label className="input-label">Clave SMTP {smtpClaveConfigurada && <small style={{ color: 'var(--text-muted)' }}>(configurada)</small>}</label><input className="input-field" type="password" disabled={!canEdit} placeholder={smtpClaveConfigurada ? '•••••• (dejar vacío para conservar)' : ''} value={form.smtpClave} onChange={update('smtpClave')} /></div>
        <div className="input-group"><label className="input-label">Correo remitente</label><input className="input-field" type="email" maxLength={150} disabled={!canEdit} value={form.correoRemitente} onChange={update('correoRemitente')} /></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.9rem', marginTop: 12, cursor: canEdit ? 'pointer' : 'default' }}>
        <input type="checkbox" disabled={!canEdit} checked={Boolean(form.envioAutomaticoCorreo)} onChange={toggle('envioAutomaticoCorreo')} />
        Enviar la factura por correo automáticamente al emitirla
      </label>

      {canEdit && <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving} type="submit"><Save size={17} /> {saving ? 'Guardando…' : 'Guardar emisor'}</button>
        <button className="btn" disabled={saving} type="button" onClick={checkConnection}><Plug size={16} /> Probar conexión LibreDTE</button>
        <button className="btn" disabled={saving} type="button" onClick={emitirPrueba}><Receipt size={16} /> Emitir boleta de prueba</button>
      </div>}
    </form>

    <section className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}><ShieldCheck size={19} /> Certificado digital</h3>
      <p style={{ margin: '0 0 14px', fontSize: '.85rem', color: 'var(--text-secondary, #64748b)' }}>
        El certificado (.p12/.pfx) se guarda cifrado y se envía a LibreDTE al emitir. La clave no se muestra nunca.
        Estado actual: <strong>{certInfo.cargado ? `cargado${certInfo.nombre ? ` (${certInfo.nombre})` : ''}` : 'no cargado'}</strong>.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--bg-color)', border: '1px solid var(--panel-border)', borderRadius: 10, padding: 12, fontSize: '.82rem', color: 'var(--text-secondary, #64748b)', marginBottom: 14 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Para pruebas locales no necesitas un certificado real: LibreDTE trae certificado y folios ficticios. El certificado real se requiere para emitir en certificación (maullin) o producción (palena).</span>
      </div>
      {canEdit && <form onSubmit={uploadCertificate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="input-group" style={{ margin: 0 }}><span className="input-label">Archivo del certificado</span><input className="input-field" type="file" name="certificado" accept=".p12,.pfx" disabled={saving} /></label>
        <label className="input-group" style={{ margin: 0 }}><span className="input-label">Clave</span><input className="input-field" type="password" value={certPassword} disabled={saving} onChange={event => setCertPassword(event.target.value)} /></label>
        <button className="btn btn-primary" disabled={saving} type="submit"><Upload size={16} /> Guardar certificado</button>
      </form>}
    </section>

    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FileText size={19} /> Folios (CAF)</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" type="button" disabled={saving} onClick={() => load().catch(exception => setError(exception.message))}><RefreshCw size={15} /> Actualizar</button>
          {canEdit && <label className="btn btn-primary" style={{ cursor: saving ? 'wait' : 'pointer' }}><Upload size={16} /> Cargar CAF<input type="file" accept=".xml" hidden disabled={saving} onChange={registerCaf} /></label>}
        </div>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '.84rem', color: 'var(--text-secondary, #64748b)' }}>
        Los CAF se guardan aquí: SGAL-App asigna los folios al emitir y avisa cuando quedan pocos.
      </p>
      {!folios.length ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--panel-border)', borderRadius: 12 }}>Todavía no hay folios cargados.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--panel-border)' }}>
              <th style={{ padding: '8px 6px' }}>Documento</th>
              <th style={{ padding: '8px 6px' }}>Desde</th>
              <th style={{ padding: '8px 6px' }}>Hasta</th>
              <th style={{ padding: '8px 6px' }}>Último usado</th>
              <th style={{ padding: '8px 6px' }}>Disponibles</th>
            </tr></thead>
            <tbody>
              {folios.map(caf => <tr key={`${caf.tipoDte}-${caf.folioDesde}`} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                <td style={{ padding: '8px 6px' }}>{caf.nombreDte} <small style={{ color: 'var(--text-muted)' }}>({caf.tipoDte})</small></td>
                <td style={{ padding: '8px 6px' }}>{caf.folioDesde}</td>
                <td style={{ padding: '8px 6px' }}>{caf.folioHasta}</td>
                <td style={{ padding: '8px 6px' }}>{caf.ultimoFolioUtilizado}</td>
                <td style={{ padding: '8px 6px', fontWeight: 700, color: caf.disponibles <= 10 ? 'var(--danger-color, #dc2626)' : 'inherit' }}>{caf.disponibles}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </section>
  </div>;
};

export default BoletasSettings;
