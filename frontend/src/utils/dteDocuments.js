export const EMPTY_INVOICE_RECIPIENT = {
  idClienteEmpresa: null, rut: '', razonSocial: '', giro: '', direccion: '', comuna: '', ciudad: '', correo: ''
};

export const isInvoiceDocument = documentType => documentType === 'factura' || documentType === 'factura_exenta';

export const isInvoiceRecipientComplete = recipient =>
  ['rut', 'razonSocial', 'giro', 'direccion', 'comuna']
    .every(field => Boolean(recipient?.[field]?.trim()));
