import { AlertTriangle, BookOpen, CheckCircle2, Circle, FileText, Info, Plug, Receipt, RefreshCw, Save, ShieldCheck, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useNotificationMessage } from '../components/NotificationCenter';
import { buildBoletaDteHtml } from '../utils/receiptTemplates';
import { ted417DataUrl } from '../utils/pdf417';
import DteLegalGuideModal from '../components/DteLegalGuideModal';

const emptyForm = {
  rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '',
  acteco: '', resolucionNumero: '', resolucionFecha: '', ambiente: 'certificacion', fase: 'desarrollo',
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
  fase: form.fase,
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
  const [estado, setEstado] = useState(null);
  const [contingencias, setContingencias] = useState({ pendientes: [], ultimosLotes: [] });
  const [showGuide, setShowGuide] = useState(false);
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
    const estadoResponse = await fetch('/api/dte/estado-puesta-en-marcha', { cache: 'no-store' });
    if (estadoResponse.ok) setEstado(await estadoResponse.json());
    const contingenciaResponse = await fetch('/api/dte/contingencias', { cache: 'no-store' });
    if (contingenciaResponse.ok) setContingencias(await contingenciaResponse.json());
  }, []);

  useEffect(() => { load().catch(exception => setError(exception.message)); }, [load]);

  const update = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));
  const updateFase = (event) => {
    const fase = event.target.value;
    setForm(current => ({ ...current, fase, ambiente: fase === 'produccion' ? 'produccion' : 'certificacion' }));
  };
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
      const data = await response.json();
      const timbreDataUrl = await ted417DataUrl(data.ted);
      const html = buildBoletaDteHtml({
        emisor: data.emisor, folio: data.folio, tipoDte: data.tipoDte,
        fecha: data.fecha, lineas: data.lineas, montos: data.montos, timbreDataUrl
      });
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
      else setError('Permite las ventanas emergentes para ver la boleta.');
      if (!timbreDataUrl) {
        setError(data.ted
          ? 'La boleta se emitió pero no se pudo generar el timbre PDF417. Reinicia el servidor de desarrollo (npm run dev) y reintenta.'
          : 'La boleta se emitió pero el backend no devolvió el timbre (TED vacío).');
      } else {
        setMessage('Boleta de prueba emitida (se abrió el ticket 80mm en otra pestaña).');
      }
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

  const processPending = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/dte/procesar-pendientes', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible procesar la cola SII.');
      await load();
      setMessage(data.mensaje || 'Cola SII procesada.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const regularizarContingencias = async () => {
    if (!window.confirm('Se emitirá una boleta resumen por cada tipo (afecta/exenta) y las ventas quedarán vinculadas al lote. ¿Continuar?')) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/dte/contingencias/regularizar', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible regularizar la contingencia.');
      await load();
      setMessage(data.mensaje || 'Contingencia regularizada.');
    } catch (exception) { setError(exception.message); }
    finally { setSaving(false); }
  };

  const checklist = estado ? [
    ['Conexión con LibreDTE', estado.conexionLibreDte],
    ['Datos del emisor completos', estado.datosEmisorCompletos],
    ['Certificado digital real', estado.certificadoRealCargado],
    ['CAF reales disponibles', estado.cafRealesCargados],
    ['Resolución SII configurada', estado.resolucionConfigurada]
  ] : [];

  return <div className="animate-fade-in">
    <div className="page-header" style={{ gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h2 className="page-title">Boletas y facturas (SII)</h2><Receipt color="var(--primary-color)" /></div>
      <button type="button" className="btn btn-primary" onClick={() => setShowGuide(true)}><BookOpen size={17} /> Guía para emitir legalmente</button>
    </div>
    {message && <div className="badge badge-success" style={{ marginBottom: 16, padding: 12 }}>{message}</div>}
    {error && <div className="badge badge-danger" style={{ marginBottom: 16, padding: 12 }}>{error}</div>}

    {estado && <section className="card" style={{ marginBottom: 20, borderLeft: `4px solid ${estado.fase === 'produccion' ? '#16a34a' : estado.fase === 'certificacion' ? '#d97706' : '#2563eb'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {estado.puedeEnviarAlSii ? <CheckCircle2 size={20} color="#16a34a" /> : <AlertTriangle size={20} color="#d97706" />}
            {estado.titulo}
          </h3>
          <p style={{ margin: '7px 0 0', color: 'var(--text-secondary, #64748b)', fontSize: '.88rem' }}>{estado.descripcion}</p>
        </div>
        <button className="btn" type="button" disabled={saving || estado.fase === 'desarrollo'} onClick={processPending}><RefreshCw size={15} /> Procesar cola SII</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginTop: 16 }}>
        {checklist.map(([label, ok]) => <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.84rem' }}>
          {ok ? <CheckCircle2 size={16} color="#16a34a" /> : <Circle size={16} color="#94a3b8" />}{label}
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 15, fontSize: '.8rem' }}>
        <span className="badge">Locales de prueba: {estado.localesPrueba}</span><span className="badge">Pendientes: {estado.pendientes}</span><span className="badge">Enviados: {estado.enviados}</span>
        <span className="badge badge-success">Aceptados: {estado.aceptados}</span><span className="badge badge-danger">Rechazados: {estado.rechazados}</span>
      </div>
    </section>}

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
        <div className="input-group"><label className="input-label">Fase de puesta en marcha</label>
          <select className="input-field" disabled={!canEdit} value={form.fase} onChange={updateFase}>
            <option value="desarrollo">Desarrollo local (sin envío al SII)</option>
            <option value="certificacion">Certificación SII (maullin)</option>
            <option value="produccion">Producción autorizada (palena)</option>
          </select>
        </div>
        <div className="input-group"><label className="input-label">N° resolución SII</label><input className="input-field" type="number" disabled={!canEdit} value={form.resolucionNumero} onChange={update('resolucionNumero')} /></div>
        <div className="input-group"><label className="input-label">Fecha resolución</label><input className="input-field" type="date" disabled={!canEdit} value={form.resolucionFecha} onChange={update('resolucionFecha')} /></div>
        <div className="input-group"><label className="input-label">Ambiente</label>
          <select className="input-field" disabled value={form.ambiente} onChange={update('ambiente')}>
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

    <section className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}><AlertTriangle size={19} /> Contingencias sin folios</h3>
          <p style={{ margin: 0, fontSize: '.84rem', color: 'var(--text-secondary, #64748b)' }}>
            Ventas registradas en producción cuando no había CAF disponible. El comprobante interno no reemplaza la boleta tributaria.
          </p>
        </div>
        {canEdit && <button className="btn btn-primary" type="button" disabled={saving || !contingencias.pendientes.length || form.fase !== 'produccion'} onClick={regularizarContingencias}>
          <RefreshCw size={16} /> Regularizar ahora
        </button>}
      </div>
      {!contingencias.pendientes.length
        ? <div className="badge badge-success" style={{ marginTop: 14 }}>Sin ventas pendientes de regularización</div>
        : <div style={{ overflowX: 'auto', marginTop: 14 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--panel-border)' }}><th style={{ padding: 7 }}>Tipo</th><th>Ventas</th><th>Total</th><th>Período</th></tr></thead>
          <tbody>{contingencias.pendientes.map(item => <tr key={item.tipoDte} style={{ borderBottom: '1px solid var(--panel-border)' }}>
            <td style={{ padding: 7 }}>{item.tipoDte === 41 ? 'Boleta exenta (41)' : 'Boleta afecta (39)'}</td><td>{item.cantidad}</td><td>${Number(item.montoTotal).toLocaleString('es-CL')}</td><td>{new Date(item.desde).toLocaleString('es-CL')} — {new Date(item.hasta).toLocaleString('es-CL')}</td>
          </tr>)}</tbody>
        </table></div>}
      {contingencias.ultimosLotes?.length > 0 && <p style={{ margin: '12px 0 0', fontSize: '.8rem', color: 'var(--text-muted)' }}>
        Última regularización: folio {contingencias.ultimosLotes[0].folio}, {contingencias.ultimosLotes[0].cantidadVentas} venta(s), ${Number(contingencias.ultimosLotes[0].montoTotal).toLocaleString('es-CL')}.
      </p>}
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
              <th style={{ padding: '8px 6px' }}>Origen</th>
              <th style={{ padding: '8px 6px' }}>Desde</th>
              <th style={{ padding: '8px 6px' }}>Hasta</th>
              <th style={{ padding: '8px 6px' }}>Último usado</th>
              <th style={{ padding: '8px 6px' }}>Disponibles</th>
            </tr></thead>
            <tbody>
              {folios.map(caf => <tr key={`${caf.tipoDte}-${caf.folioDesde}`} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                <td style={{ padding: '8px 6px' }}>{caf.nombreDte} <small style={{ color: 'var(--text-muted)' }}>({caf.tipoDte})</small></td>
                <td style={{ padding: '8px 6px' }}><span className={`badge ${caf.esPrueba ? 'badge-warning' : 'badge-success'}`}>{caf.esPrueba ? 'Prueba' : 'SII real'}</span></td>
                <td style={{ padding: '8px 6px' }}>{caf.folioDesde}</td>
                <td style={{ padding: '8px 6px' }}>{caf.folioHasta}</td>
                <td style={{ padding: '8px 6px' }}>{caf.ultimoFolioUtilizado}</td>
                <td style={{ padding: '8px 6px', fontWeight: 700, color: caf.disponibles <= 10 ? 'var(--danger-color, #dc2626)' : 'inherit' }}>{caf.disponibles}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </section>
    <DteLegalGuideModal open={showGuide} onClose={() => setShowGuide(false)} estado={estado} />
  </div>;
};

export default BoletasSettings;
