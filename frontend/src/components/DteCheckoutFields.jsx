import { useEffect, useMemo, useState } from 'react';
import { Building2, FileText, Mail, MapPin, Pencil, Plus, Receipt, X } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { EMPTY_INVOICE_RECIPIENT, isInvoiceDocument, isInvoiceRecipientComplete } from '../utils/dteDocuments';

const DOCUMENTS = [
  { value: 'boleta', label: 'Boleta', detail: 'Afecta · tipo 39', icon: Receipt },
  { value: 'boleta_exenta', label: 'Boleta exenta', detail: 'Sin IVA · tipo 41', icon: Receipt, exempt: true },
  { value: 'factura', label: 'Factura', detail: 'Afecta · tipo 33', icon: FileText, invoice: true },
  { value: 'factura_exenta', label: 'Factura exenta', detail: 'Sin IVA · tipo 34', icon: FileText, invoice: true, exempt: true }
];

const FIELDS = [
  ['rut', 'RUT', '76.123.456-7', true],
  ['razonSocial', 'Razón social', 'Empresa de ejemplo SpA', true],
  ['giro', 'Giro', 'Servicios de alimentación', true],
  ['direccion', 'Dirección', 'Av. Principal 123', true],
  ['comuna', 'Comuna', 'Providencia', true],
  ['ciudad', 'Ciudad', 'Santiago', false],
  ['correo', 'Correo', 'facturacion@empresa.cl', false]
];

export default function DteCheckoutFields({ documentType, onDocumentTypeChange, recipient, onRecipientChange, canEmitExempt = false, disabled = false }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [draftRecipient, setDraftRecipient] = useState({ ...EMPTY_INVOICE_RECIPIENT });
  const [modalError, setModalError] = useState('');
  const isInvoice = isInvoiceDocument(documentType);
  const hasRecipient = Boolean(recipient?.rut?.trim() || recipient?.razonSocial?.trim());

  useEffect(() => {
    if (!isInvoice) {
      setSelectedClientId('');
      setClientsLoaded(false);
      setClientModalOpen(false);
    }
  }, [isInvoice]);

  useEffect(() => {
    setSelectedClientId(recipient?.idClienteEmpresa ? String(recipient.idClienteEmpresa) : '');
  }, [recipient?.idClienteEmpresa]);

  useEffect(() => {
    if (!clientModalOpen) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setClientModalOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [clientModalOpen]);

  useEffect(() => {
    if (!isInvoice || clientsLoaded) return;
    let active = true;
    setLoadingClients(true);
    fetch('/api/dte/clientes')
      .then(async response => {
        if (!response.ok) throw new Error('No se pudieron cargar los clientes guardados.');
        return response.json();
      })
      .then(data => { if (active) setClients(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setClients([]); })
      .finally(() => { if (active) { setLoadingClients(false); setClientsLoaded(true); } });
    return () => { active = false; };
  }, [isInvoice, clientsLoaded]);

  const clientOptions = useMemo(() => clients.map(client => ({
    value: client.idClienteEmpresa,
    label: `${client.razonSocial} · ${client.rut}`
  })), [clients]);

  const selectClient = value => {
    setSelectedClientId(String(value));
    const client = clients.find(item => String(item.idClienteEmpresa) === String(value));
    if (!client) return;
    onRecipientChange({
      idClienteEmpresa: client.idClienteEmpresa,
      rut: client.rut || '',
      razonSocial: client.razonSocial || '',
      giro: client.giro || '',
      direccion: client.direccion || '',
      comuna: client.comuna || '',
      ciudad: client.ciudad || '',
      correo: client.correo || ''
    });
  };

  const openNewClient = () => {
    setDraftRecipient({ ...EMPTY_INVOICE_RECIPIENT });
    setModalError('');
    setClientModalOpen(true);
  };

  const openEditClient = () => {
    setDraftRecipient({ ...EMPTY_INVOICE_RECIPIENT, ...recipient });
    setModalError('');
    setClientModalOpen(true);
  };

  const applyDraftRecipient = () => {
    if (!isInvoiceRecipientComplete(draftRecipient)) {
      setModalError('Completa el RUT, razón social, giro, dirección y comuna.');
      return;
    }
    const cleaned = Object.fromEntries(Object.entries(draftRecipient).map(([key, value]) =>
      [key, typeof value === 'string' ? value.trim() : value]));
    onRecipientChange(cleaned);
    setSelectedClientId(cleaned.idClienteEmpresa ? String(cleaned.idClienteEmpresa) : '');
    setClientModalOpen(false);
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: '.76rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Documento tributario
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
          {DOCUMENTS.map(option => {
            const selected = documentType === option.value;
            const unavailable = disabled || (option.exempt && !canEmitExempt);
            const Icon = option.icon;
            return (
              <button key={option.value} type="button" disabled={unavailable}
                title={option.exempt && !canEmitExempt ? 'Tu rol no tiene permiso para emitir documentos exentos.' : undefined}
                onClick={() => onDocumentTypeChange(option.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, padding: '9px 10px',
                  borderRadius: 9, textAlign: 'left', cursor: unavailable ? 'not-allowed' : 'pointer',
                  border: selected ? '1.5px solid var(--primary-color)' : '1px solid var(--panel-border)',
                  background: selected ? 'rgba(var(--primary-rgb), .07)' : '#fff',
                  color: selected ? 'var(--primary-color)' : 'var(--text-main)', opacity: unavailable ? .48 : 1
                }}>
                <Icon size={17} />
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: '.82rem' }}>{option.label}</strong>
                  <small style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)' }}>{option.detail}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isInvoice && (
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: 11, padding: 12, background: 'var(--bg-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Building2 size={16} color="var(--primary-color)" />
            <strong style={{ fontSize: '.86rem' }}>Receptor de la factura</strong>
          </div>

          <SearchableSelect options={clientOptions} value={selectedClientId} onChange={selectClient}
            disabled={disabled || loadingClients}
            placeholder={loadingClients ? 'Cargando clientes…' : 'Buscar cliente por razón social o RUT…'}
            noOptionsMessage="Aún no hay clientes guardados"
            customActionButton={(
              <button type="button" className="btn" disabled={disabled} onClick={openNewClient}
                style={{ padding: '8px 11px', whiteSpace: 'nowrap', fontSize: '.76rem' }}>
                <Plus size={14} /> Nuevo cliente
              </button>
            )} />

          {hasRecipient ? (
            <div style={{ marginTop: 10, padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(var(--primary-rgb), .22)', background: 'rgba(var(--primary-rgb), .055)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '3px 8px' }}>
                  <strong style={{ fontSize: '.84rem' }}>{recipient.razonSocial || 'Cliente sin razón social'}</strong>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary-color)' }}>{recipient.rut}</span>
                </div>
                {recipient.giro && <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{recipient.giro}</span>}
                {(recipient.direccion || recipient.comuna || recipient.ciudad) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.71rem', color: 'var(--text-muted)' }}>
                    <MapPin size={12} /> {[recipient.direccion, recipient.comuna, recipient.ciudad].filter(Boolean).join(', ')}
                  </span>
                )}
                {recipient.correo && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.71rem', color: 'var(--text-muted)' }}>
                    <Mail size={12} /> {recipient.correo}
                  </span>
                )}
              </div>
              <button type="button" className="btn" disabled={disabled} onClick={openEditClient}
                style={{ padding: '5px 8px', fontSize: '.7rem', flexShrink: 0 }}>
                <Pencil size={12} /> Editar
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 9, fontSize: '.71rem', color: 'var(--text-muted)' }}>
              Selecciona un cliente guardado o crea uno nuevo para emitir la factura.
            </div>
          )}
        </div>
      )}

      {clientModalOpen && (
        <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setClientModalOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(15, 23, 42, .56)', padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="dte-client-modal-title"
            style={{ width: 'min(680px, 100%)', maxHeight: 'calc(100vh - 36px)', overflowY: 'auto', borderRadius: 14, background: '#fff', boxShadow: '0 24px 65px rgba(15, 23, 42, .28)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 18px', borderBottom: '1px solid var(--panel-border)', background: '#fff' }}>
              <div>
                <strong id="dte-client-modal-title" style={{ display: 'block', fontSize: '1rem' }}>
                  {draftRecipient.idClienteEmpresa ? 'Editar datos del cliente' : 'Nuevo cliente'}
                </strong>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Información tributaria del receptor de la factura</span>
              </div>
              <button type="button" className="btn" aria-label="Cerrar" onClick={() => setClientModalOpen(false)} style={{ padding: 7 }}><X size={16} /></button>
            </div>

            <div style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
                {FIELDS.map(([field, label, placeholder, required]) => (
                  <label key={field} style={{ display: 'grid', gap: 5 }}>
                    <span style={{ fontSize: '.75rem', fontWeight: 700 }}>{label}{required && <span style={{ color: '#dc2626' }}> *</span>}</span>
                    <input className="input-field" autoFocus={field === 'rut'}
                      type={field === 'correo' ? 'email' : 'text'} value={draftRecipient[field] || ''}
                      placeholder={placeholder} onChange={event => {
                        setModalError('');
                        setDraftRecipient(current => ({ ...current, [field]: event.target.value }));
                      }}
                      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyDraftRecipient(); } }}
                      style={{ padding: '9px 10px', minWidth: 0 }} />
                  </label>
                ))}
              </div>

              {modalError && <div role="alert" style={{ marginTop: 12, color: '#b91c1c', fontSize: '.76rem', fontWeight: 600 }}>{modalError}</div>}
              <div style={{ marginTop: 10, fontSize: '.7rem', color: 'var(--text-muted)' }}>
                El cliente se guardará o actualizará al emitir la factura.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn" onClick={() => setClientModalOpen(false)}>Cancelar</button>
                <button type="button" className="btn btn-primary" onClick={applyDraftRecipient}>Usar cliente</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
