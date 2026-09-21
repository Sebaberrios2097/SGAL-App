import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus, Save, Trash2, ShieldCheck, X } from 'lucide-react';
import { notify } from '../components/NotificationCenter';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Metadatos por proveedor. La imagen real de la Smart Point 2 va en
// frontend/public/pos/smart-point-2.png (si falta, se muestra un ícono).
const PROVIDERS = {
  mercadopago: { nombre: 'Mercado Pago', modelo: 'Smart Point 2', imagen: '/pos/smart-point-2.png' }
};

const emptyForm = (proveedor = 'mercadopago') => ({
  idMaquina: null, proveedor, nombre: PROVIDERS[proveedor]?.nombre || '', activa: true,
  terminalId: '', baseUrl: '', printOnTerminal: '', payerCondition: '', expirationTime: '',
  permiteSimulacion: false, autoSimular: false, accessToken: '', webhookSecret: '',
  accessTokenConfigurado: false, webhookSecretConfigurado: false
});

const PosMachines = () => {
  const { user } = useAuth();
  useDocumentTitle('Máquinas POS');
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = sin editor abierto
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const esDesarrollador = Boolean(user?.esDesarrollador);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pos-machines');
      if (!res.ok) throw new Error('No fue posible cargar las máquinas POS.');
      setMachines(await res.json());
    } catch (err) {
      notify.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (esDesarrollador) load(); else setLoading(false); }, [esDesarrollador, load]);

  const editMachine = (m) => setForm({ ...emptyForm(m.proveedor), ...m, accessToken: '', webhookSecret: '' });
  const newMachine = () => setForm(emptyForm('mercadopago'));
  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const toggle = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.checked }));

  const save = async () => {
    if (!form || saving) return;
    if (!form.nombre.trim()) { notify.error('El nombre es obligatorio.'); return; }
    setSaving(true);
    try {
      const payload = {
        proveedor: form.proveedor, nombre: form.nombre, activa: form.activa,
        terminalId: form.terminalId, baseUrl: form.baseUrl, printOnTerminal: form.printOnTerminal,
        payerCondition: form.payerCondition, expirationTime: form.expirationTime,
        permiteSimulacion: form.permiteSimulacion, autoSimular: form.autoSimular,
        // Los secretos solo se envían si se escribieron (si no, se conserva el actual).
        accessToken: form.accessToken || null, webhookSecret: form.webhookSecret || null
      };
      const res = await fetch(form.idMaquina ? `/api/pos-machines/${form.idMaquina}` : '/api/pos-machines', {
        method: form.idMaquina ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.mensaje || 'No fue posible guardar la máquina.');
      }
      notify.success('Máquina POS guardada.');
      setForm(null);
      await load();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m) => {
    if (!confirm(`¿Eliminar la máquina "${m.nombre}"? Se perderán sus credenciales.`)) return;
    try {
      const res = await fetch(`/api/pos-machines/${m.idMaquina}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No fue posible eliminar la máquina.');
      notify.success('Máquina eliminada.');
      await load();
    } catch (err) { notify.error(err.message); }
  };

  const testConnection = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await fetch('/api/pos-machines/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const disponibles = (data.terminalesDisponibles || []).map(t =>
          `${t.terminalId}${t.modoOperacion ? ` (${t.modoOperacion})` : ''}`).join(', ');
        throw new Error(`${data.mensaje || 'No fue posible validar la conexión.'}${disponibles ? ` Disponibles: ${disponibles}` : ''}`);
      }
      notify.success(`${data.mensaje} Terminal ${data.terminalId}${data.modoOperacion ? ` · modo ${data.modoOperacion}` : ''}`);
    } catch (err) {
      notify.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  if (!esDesarrollador) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        La gestión de máquinas POS está reservada al rol Desarrollador.
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 className="page-title">Máquinas POS</h2>
        <CreditCard color="var(--primary-color)" />
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', maxWidth: 720, marginBottom: 18 }}>
        Configura las terminales de pago y sus credenciales. Los datos sensibles se guardan cifrados
        y nunca se muestran de vuelta. Solo puede haber una máquina activa por proveedor.
      </p>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            {machines.map(m => {
              const meta = PROVIDERS[m.proveedor] || { nombre: m.proveedor, modelo: '', imagen: null };
              return (
                <div key={m.idMaquina} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ height: 130, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {meta.imagen ? (
                      <img src={meta.imagen} alt={meta.modelo} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }} />
                    ) : null}
                    <div style={{ display: meta.imagen ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                      <CreditCard size={40} /><span style={{ fontSize: '.78rem' }}>{meta.modelo || 'Terminal POS'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{m.nombre}</strong>
                    {m.activa && <span className="badge badge-success" style={{ fontSize: '.72rem' }}>Activa</span>}
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>{meta.nombre}{meta.modelo ? ` · ${meta.modelo}` : ''}</span>
                    <span>Terminal: {m.terminalId || '—'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <ShieldCheck size={13} color={m.accessTokenConfigurado ? '#16a34a' : '#cbd5e1'} />
                      {m.accessTokenConfigurado ? 'Credencial configurada' : 'Sin credencial'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => editMachine(m)}>Editar</button>
                    <button type="button" className="btn btn-danger" onClick={() => remove(m)}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
            {machines.length === 0 && (
              <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                Aún no hay máquinas POS configuradas.
              </div>
            )}
          </div>

          {!form && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={newMachine}><Plus size={17} /> Agregar máquina POS</button>
              {machines.some(m => m.activa) && (
                <button type="button" className="btn btn-secondary" disabled={testing} onClick={testConnection}>
                  <ShieldCheck size={17} /> {testing ? 'Validando…' : 'Probar conexión'}
                </button>
              )}
            </div>
          )}

          {form && (
            <div className="card" style={{ padding: 22, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>{form.idMaquina ? `Editar ${form.nombre}` : 'Nueva máquina POS'}</h3>
                <button type="button" className="btn" onClick={() => setForm(null)} style={{ background: 'none' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <Field label="Nombre"><input className="input-field" maxLength={120} value={form.nombre} onChange={update('nombre')} /></Field>
                <Field label="Terminal ID"><input className="input-field" value={form.terminalId || ''} onChange={update('terminalId')} placeholder="PAX_A910__SMARTPOINT..." /></Field>
                <Field label="Access Token" hint={form.accessTokenConfigurado ? 'Configurado — deja vacío para conservarlo' : 'Requerido'}>
                  <input className="input-field" type="password" value={form.accessToken} onChange={update('accessToken')} placeholder={form.accessTokenConfigurado ? '•••••••• (configurado)' : 'APP_USR-...'} autoComplete="new-password" />
                </Field>
                <Field label="Webhook Secret" hint={form.webhookSecretConfigurado ? 'Configurado — deja vacío para conservarlo' : 'Opcional'}>
                  <input className="input-field" type="password" value={form.webhookSecret} onChange={update('webhookSecret')} placeholder={form.webhookSecretConfigurado ? '•••••••• (configurado)' : ''} autoComplete="new-password" />
                </Field>
                <Field label="URL base"><input className="input-field" value={form.baseUrl || ''} onChange={update('baseUrl')} placeholder="https://api.mercadopago.com" /></Field>
                <Field label="Print on terminal"><input className="input-field" value={form.printOnTerminal || ''} onChange={update('printOnTerminal')} placeholder="no_ticket" /></Field>
                <Field label="Payer condition"><input className="input-field" value={form.payerCondition || ''} onChange={update('payerCondition')} placeholder="payment_taxable_iva" /></Field>
                <Field label="Expiration time"><input className="input-field" value={form.expirationTime || ''} onChange={update('expirationTime')} placeholder="PT5M" /></Field>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '16px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem' }}>
                  <input type="checkbox" checked={form.activa} onChange={toggle('activa')} /> Activa
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem' }}>
                  <input type="checkbox" checked={form.permiteSimulacion} onChange={toggle('permiteSimulacion')} /> Permite simulación (pruebas)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem' }}>
                  <input type="checkbox" checked={form.autoSimular} onChange={toggle('autoSimular')} /> Auto-simular
                </label>
              </div>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                <Save size={16} /> {saving ? 'Guardando…' : 'Guardar máquina'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Field = ({ label, hint, children }) => (
  <div className="input-group">
    <label className="input-label">{label}</label>
    {children}
    {hint && <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{hint}</span>}
  </div>
);

export default PosMachines;
