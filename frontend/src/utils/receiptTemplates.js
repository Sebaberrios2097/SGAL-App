// Constructor único de comprobantes térmicos (80mm) para impresión.
//
// Reemplaza el HTML duplicado que vivía en SalesView (`triggerPrintTicket` /
// `triggerPrintBoleta`). Un solo layout parametrizado permite:
//   - mode 'boleta': documento completo (uso general que conserva el cliente):
//     fecha, logo, productos/cantidades/subtotales con descuentos, y —según la
//     configuración de la organización— nombre de quien atendió, detalle de pago
//     con vuelto y una cola personalizada. Opcionalmente una segunda hoja "comanda".
//   - mode 'vale': comprobante mínimo de uso interno (vendedor con módulo Caja):
//     solo fecha, logo, productos, cantidades, valores y subtotal con descuentos.
//
// La base (fecha, logo, productos, cantidades y subtotales con descuentos) siempre
// se muestra; el resto es opcional vía `options`.

import { code39Svg } from './barcode';

const MONO = "'Consolas', 'Lucida Console', 'DejaVu Sans Mono', monospace";

// Imprime un HTML de comprobante en un iframe oculto (impresora térmica).
export const printReceipt = (htmlContent) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = '0px';
  iframe.style.top = '-1000px';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow || iframe.contentDocument;
  const iframeDoc = doc.document || doc;
  iframeDoc.open();
  iframeDoc.write(htmlContent);
  iframeDoc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => { document.body.removeChild(iframe); }, 1000);
  }, 500);
};

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

export const renderPrintedSelections = (selections = [], fontSize = 11) => selections.length === 0
  ? ''
  : `<br><small style="color: #444; font-size: ${fontSize}px; font-family: ${MONO};">${selections
      .map(selection => `${selection.nombreMateriaPrima}${selection.recargo > 0 ? ` (+$${selection.recargo.toLocaleString('es-CL')})` : ''}`)
      .join('<br>')}</small>`;

export const renderPrintedExtras = (extras = [], fontSize = 9) => extras.length === 0
  ? ''
  : `<br><small style="color: #444; font-size: ${fontSize}px; font-family: ${MONO};">${extras
      .map(extra => `+ ${extra.nombre}${extra.precio > 0 ? ` (+$${extra.precio.toLocaleString('es-CL')})` : ''}`)
      .join('<br>')}</small>`;

const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

const buildItemsRows = (items = []) => items.map(item => {
  const itemIsPromo = item.finalPrice < item.normalPrice;
  const originalSub = item.normalPrice * item.quantity;
  const finalSub = item.finalPrice * item.quantity;
  const itemDiscountTotal = originalSub - finalSub;
  const discountPercent = item.normalPrice > 0
    ? Math.round(((item.normalPrice - item.finalPrice) / item.normalPrice) * 100)
    : 0;

  const containerRow = item.containerCharge > 0 ? `<tr><td style="font-size:11px;padding:2px 0">Depósito envases · ${item.missingContainers || 0} unidad(es)</td><td></td><td style="text-align:right">${money(item.containerCharge)}</td></tr>` : '';
  return `
    <tr>
      <td style="font-size: 12px; padding: 5px 0; font-family: ${MONO}; vertical-align: top; line-height: 1.2;">
        ${escapeHtml(item.nombreProducto)}
        ${renderPrintedSelections(item.materialSelections)}
        ${renderPrintedExtras(item.extras)}
        ${itemIsPromo ? `<br><small style="color: #444; font-size: 11px; font-family: ${MONO};">Descto. ${discountPercent}% (-${money(itemDiscountTotal)})</small>` : ''}
      </td>
      <td style="text-align: center; width: 40px; font-size: 12px; padding: 5px 0; font-family: ${MONO}; vertical-align: top;">
        ${item.quantity}
      </td>
      <td style="text-align: right; width: 75px; font-size: 12px; padding: 5px 0; font-family: ${MONO}; vertical-align: top;">
        ${itemIsPromo ? `<span style="text-decoration: line-through; font-size: 11px; color: #555;">${money(originalSub)}</span><br><strong>${money(finalSub)}</strong>` : money(finalSub)}
      </td>
    </tr>${containerRow}`;
}).join('');

const buildPromotionRows = (promotions = []) => promotions.map(promo => `
  <tr>
    <td style="font-size: 12px; padding: 7px 0; font-family: ${MONO}; vertical-align: top; line-height: 1.25;">
      <strong>PROMO: ${escapeHtml(promo.nombre)}</strong>
      ${(promo.productos || []).length ? `<br><small style="font-size: 10px;">${promo.productos.map(p => `${p.cantidad}× ${escapeHtml(p.nombreProducto)}`).join('<br>')}</small>` : ''}
      ${promo.descuento > 0 ? `<br><small style="font-size: 10px;">Descuento promo: -${money(promo.descuento)}</small>` : ''}
    </td>
    <td style="text-align:center; font-size:12px; font-family:${MONO}; vertical-align:top; padding:7px 0;">${promo.cantidad || 1}</td>
    <td style="text-align:right; font-size:12px; font-family:${MONO}; vertical-align:top; padding:7px 0;"><strong>${money((promo.precio || 0) * (promo.cantidad || 1))}</strong></td>
  </tr>`).join('');

// payments: [{ name, amount, isCash }]; cashReceived opcional para el vuelto.
const buildPaymentsHtml = (payments = [], cashReceived = null) => payments
  .filter(p => p.amount > 0)
  .map(p => {
    let html = `
      <p style="margin: 2px 0; display: flex; justify-content: space-between; font-size: 12px; font-family: ${MONO};">
        <span>- ${escapeHtml(p.name)}:</span>
        <strong>${money(p.amount)}</strong>
      </p>`;
    if (p.isCash && cashReceived != null) {
      const received = parseInt(cashReceived) || 0;
      const change = Math.max(0, received - p.amount);
      html += `
        <p style="margin: 2px 0 2px 10px; display: flex; justify-content: space-between; font-size: 11px; color: #555; font-family: ${MONO};">
          <span>Recibido:</span>
          <span>${money(received)}</span>
        </p>
        <p style="margin: 2px 0 2px 10px; display: flex; justify-content: space-between; font-size: 11px; color: #555; font-family: ${MONO};">
          <span>Vuelto:</span>
          <span>${money(change)}</span>
        </p>`;
    }
    return html;
  }).join('');

const buildComandaSection = (idVenta, items = []) => {
  const rows = items.map(item => `
    <tr>
      <td style="font-size: 13px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee; font-family: ${MONO}; line-height: 1.3;">${escapeHtml(item.nombreProducto)}${renderPrintedSelections(item.materialSelections, 12)}</td>
      <td style="width: 50px; text-align: right; font-size: 16px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee; font-family: ${MONO};">${item.quantity}x</td>
    </tr>`).join('');

  return `
    <div class="page-break"></div>
    <div class="comanda-section">
      <h2 class="text-center" style="margin: 0; font-size: 18px; font-family: ${MONO};">COMANDA DE PREPARACIÓN</h2>
      <div class="divider"></div>
      <p style="margin: 4px 0; font-family: ${MONO};"><strong>Nro. Boleta: #${idVenta}</strong></p>
      <div class="divider"></div>
      <table class="item-table">
        <thead>
          <tr>
            <th style="text-align: left; font-size: 13px; border-bottom: 1px solid #000; padding-bottom: 4px; font-family: ${MONO};">Producto</th>
            <th style="text-align: right; width: 50px; font-size: 13px; border-bottom: 1px solid #000; padding-bottom: 4px; font-family: ${MONO};">Cant</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="divider"></div>
      <p class="text-center" style="font-size: 13px; margin-top: 20px; font-family: ${MONO};">-- Fin de Comanda --</p>
    </div>`;
};

/** Comanda de preparación como documento 80mm independiente (para imprimir aparte de la boleta DTE). */
export const buildComandaHtml = (idVenta, items = []) => `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Comanda #${idVenta}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      body { font-family:${MONO}; width:100%; margin:0 auto; padding:6px 8px; color:#000; box-sizing:border-box; }
      * { color:#000 !important; font-weight:bold !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      .text-center { text-align:center; }
      .divider { border-top:1px dashed #000; margin:4px 0; }
      .item-table { width:100%; border-collapse:collapse; }
    </style>
  </head>
  <body>${buildComandaSection(idVenta, items).replace('<div class="page-break"></div>', '')}</body>
  </html>`;

/**
 * Construye el HTML completo de un comprobante para impresión térmica.
 *
 * @param {object}  params
 * @param {'boleta'|'vale'} params.mode        Documento completo o vale mínimo.
 * @param {string}  params.commercialName      Nombre comercial (fallback sin logo).
 * @param {string=} params.logoUrl             URL del logo de boletas (o null).
 * @param {object}  params.data                { idVenta, fecha, barista, items, subtotal, total, payments, cashReceived }
 * @param {object=} params.options             { showSeller, showPayment, customFooter, defaultFooter, contacto, includeComanda }
 * @returns {string} HTML listo para imprimir.
 */
export const buildReceiptHtml = ({ mode = 'boleta', commercialName = '', logoUrl = null, data, options = {} }) => {
  const isVale = mode === 'vale';
  const {
    idVenta, fecha, barista, items = [], promotions = [],
    subtotal = 0, total = 0, payments = [], cashReceived = null
  } = data || {};
  const {
    showSeller = true, showPayment = true,
    customFooter = null, defaultFooter = 'Gracias por su preferencia.',
    contacto = null, includeComanda = false, barcodeValue = null
  } = options;

  if (isVale) {
    const rows = [...items.map(item => ({ nombre: item.nombreProducto, cantidad: item.quantity, total: item.finalPrice * item.quantity })),
      ...promotions.map(item => ({ nombre: `Promo: ${item.nombre}`, cantidad: item.cantidad || 1, total: (item.precio || 0) * (item.cantidad || 1) }))]
      .map(item => `<tr><td>${escapeHtml(item.nombre)}</td><td style="text-align:center">${item.cantidad}</td><td style="text-align:right">${money(item.total)}</td></tr>`).join('');
    const internalBarcode = barcodeValue ? `<div class="divider"></div><div class="text-center">${code39Svg(barcodeValue)}<div style="font-size:10px;letter-spacing:1px">${escapeHtml(barcodeValue)}</div></div>` : '';
    // Cobro de envases retornables, enmarcado en negro para que el cajero no lo pase por alto.
    const containerTotal = items.reduce((sum, item) => sum + (item.containerCharge || 0), 0);
    const containerUnits = items.reduce((sum, item) => sum + (item.missingContainers || 0), 0);
    const containerBox = containerTotal > 0 ? `
      <div style="border:3px solid #000;border-radius:5px;padding:6px 8px;margin:7px 0;background:#000;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <div class="text-center" style="font-size:12px;letter-spacing:1px;color:#fff">COBRO DE ENVASES</div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:4px;color:#fff"><span>${containerUnits} envase(s)</span><span>${money(containerTotal)}</span></div>
        <div class="text-center" style="font-size:9px;margin-top:3px;color:#fff">Retornable · se entrega vale de canje</div>
      </div>` : '';
    return `<!doctype html><html><head><title>Ticket interno #${idVenta}</title><style>
      @page{size:80mm auto;margin:0}body{font-family:${MONO};font-size:11px;width:100%;margin:0;padding:4px 6px;box-sizing:border-box;color:#000}
      *{font-weight:bold}.text-center{text-align:center}.divider{border-top:1px dashed #000;margin:3px 0}table{width:100%;border-collapse:collapse}td,th{padding:2px 0}
    </style></head><body>
      <div class="text-center" style="font-size:13px">${escapeHtml(commercialName)}</div>
      ${fecha ? `<div style="margin-top:2px">Fecha: ${escapeHtml(fecha)}</div>` : ''}
      ${(showSeller && barista) ? `<div style="margin-top:2px">Vendedor: ${escapeHtml(barista)}</div>` : ''}
      <div class="divider"></div><table><thead><tr><th style="text-align:left">Producto</th><th>Cant.</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
      ${containerBox}
      <div class="divider"></div><div style="display:flex;justify-content:space-between;font-size:13px"><span>TOTAL</span><span>${money(total)}</span></div>
      ${internalBarcode}
    </body></html>`;
  }

  const isPromo = subtotal > total;
  const discount = subtotal - total;
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" class="logo" alt="Logo" />`
    : `<strong>${escapeHtml(commercialName)}</strong>`;

  const discountRow = isPromo ? `
    <tr>
      <td style="font-size: 12px; padding: 4px 0; font-family: ${MONO};">Descuentos:</td>
      <td></td>
      <td style="text-align: right; font-size: 12px; padding: 4px 0; color: #d93025; font-weight: bold; font-family: ${MONO};">-${money(discount)}</td>
    </tr>` : '';

  const title = isVale ? 'Vale' : 'Boleta';
  const paymentsHtml = (!isVale && showPayment) ? buildPaymentsHtml(payments, cashReceived) : '';
  const footerText = (customFooter && customFooter.trim()) ? customFooter : defaultFooter;
  const barcodeHtml = barcodeValue ? `
    <div class="divider"></div>
    <div class="text-center" style="margin: 6px 0;">
      <div style="display:flex; justify-content:center;">${code39Svg(barcodeValue)}</div>
      <div style="font-family: ${MONO}; font-size: 11px; letter-spacing: 2px; margin-top: 2px;">${escapeHtml(barcodeValue)}</div>
    </div>` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Impresión ${escapeHtml(commercialName)}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          font-family: ${MONO};
          font-size: 13px;
          width: 100%;
          margin: 0 auto;
          padding: 6px 8px;
          color: #000;
          box-sizing: border-box;
        }
        /* Térmica = 1 bit (negro/blanco): sin grises ni trazos finos suavizados */
        * { color: #000 !important; font-weight: bold !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .text-center { text-align: center; }
        .logo-container { display: flex; justify-content: center; margin-bottom: 4px; }
        .logo { width: 105px; height: auto; display: block; filter: contrast(160%); }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .item-table { width: 100%; border-collapse: collapse; }
        .totals-table { width: 100%; margin-top: 8px; }
        .footer { font-size: 11px; margin-top: 8px; }
        .disclaimer { font-size: 11px; font-weight: bold; margin-top: 8px; line-height: 1.3; color: #333; }
        .page-break { page-break-after: always; break-after: page; }
        .comanda-section { padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="logo-container">${logoHtml}</div>
      <div class="divider"></div>
      <p style="margin: 2px 0; font-family: ${MONO};"><strong>Nro. ${title}: #${idVenta}</strong></p>
      <p style="margin: 2px 0; font-family: ${MONO};">Fecha: ${escapeHtml(fecha)}</p>
      ${(!isVale && showSeller && barista) ? `<p style="margin: 2px 0; font-family: ${MONO};">Atendido por: ${escapeHtml(barista)}</p>` : ''}
      <div class="divider"></div>
      <table class="item-table">
        <thead>
          <tr>
            <th style="text-align: left; font-size: 12px; border-bottom: 1px solid #000; font-family: ${MONO};">Producto</th>
            <th style="text-align: center; width: 40px; font-size: 12px; border-bottom: 1px solid #000; font-family: ${MONO};">Cant</th>
            <th style="text-align: right; width: 75px; font-size: 12px; border-bottom: 1px solid #000; font-family: ${MONO};">Total</th>
          </tr>
        </thead>
        <tbody>${buildItemsRows(items)}${buildPromotionRows(promotions)}</tbody>
      </table>
      <div class="divider"></div>
      <table class="totals-table">
        <tr>
          <td style="font-size: 12px; padding: 4px 0; font-family: ${MONO};">Subtotal:</td>
          <td></td>
          <td style="text-align: right; font-size: 12px; padding: 4px 0; font-weight: bold; font-family: ${MONO};">${money(subtotal)}</td>
        </tr>
        ${discountRow}
        <tr>
          <td style="font-size: 13px; padding: 4px 0; font-family: ${MONO};"><strong>TOTAL:</strong></td>
          <td></td>
          <td style="text-align: right; font-size: 14px; padding: 4px 0; font-weight: bold; font-family: ${MONO};">${money(total)}</td>
        </tr>
      </table>
      ${paymentsHtml ? `
        <div class="divider"></div>
        <p style="margin: 2px 0; font-family: ${MONO};"><strong>Detalle Pago:</strong></p>
        ${paymentsHtml}` : ''}
      <div class="divider"></div>
      <p class="text-center footer" style="font-family: ${MONO}; margin-bottom: 10px;">${escapeHtml(footerText)}${contacto ? `<br>${escapeHtml(contacto)}` : ''}</p>
      <div class="text-center disclaimer" style="font-family: ${MONO};">
        *** DOCUMENTO NO VÁLIDO COMO BOLETA ELECTRÓNICA / SIN VALOR TRIBUTARIO (SII) ***
      </div>
      ${barcodeHtml}
      ${includeComanda ? buildComandaSection(idVenta, items) : ''}
    </body>
    </html>`;
};

export const buildReturnableVoucherHtml = ({ commercialName, voucher, products = [] }) => `<!doctype html><html><head><title>Vale de envases</title><style>@page{size:80mm auto;margin:0}body{font-family:${MONO};font-size:12px;padding:7px;font-weight:bold}.c{text-align:center}.d{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse}td{padding:3px 0}.bc{width:100%;padding:0 4px;box-sizing:border-box}.bc svg{width:100%;height:60px;display:block}</style></head><body><div class="c" style="font-size:15px">${escapeHtml(commercialName)}</div><div class="c">VALE DE ENVASES</div><div class="d"></div><div>Fecha: ${escapeHtml(new Date(voucher.fechaEmision).toLocaleString('es-CL'))}</div>${voucher.fechaVencimiento ? `<div>Vence: ${escapeHtml(new Date(voucher.fechaVencimiento).toLocaleDateString('es-CL'))}</div>` : ''}<table>${products.map(p => `<tr><td>${p.cantidad}× ${escapeHtml(p.nombreProducto || `Producto ${p.idProducto}`)}</td><td style="text-align:right">${money(p.cantidad * p.precioUnitario)}</td></tr>`).join('')}</table><div class="d"></div><div style="display:flex;justify-content:space-between;font-size:14px"><span>TOTAL</span><span>${money(voucher.montoOriginal)}</span></div><div class="d"></div><div class="bc">${code39Svg(voucher.codigo, { fit: true, height: 60 })}</div><div class="c" style="letter-spacing:1px;margin-top:2px">${escapeHtml(voucher.codigo)}</div><p class="c">Presente este vale para devolver los envases. Canje en efectivo.</p></body></html>`;

/**
 * Construye el HTML de una BOLETA ELECTRÓNICA (80mm) con su timbre PDF417. Fusiona el ticket
 * interno (logo, atendido por, líneas con selecciones/extras/promos, detalle de pago y pie) con
 * los datos tributarios del DTE (emisor, folio, Neto/IVA/Total y timbre).
 *
 * @param {object}  params
 * @param {object}  params.emisor        { rut, razonSocial, giro, direccion, comuna }
 * @param {number}  params.folio         Folio del documento.
 * @param {number}  params.tipoDte       39 (afecta) o 41 (exenta).
 * @param {string}  params.fecha         Fecha de emisión (ISO).
 * @param {object}  params.montos        { neto, exento, iva, total }
 * @param {string=} params.timbreDataUrl Data URL (PNG) del PDF417 del TED.
 * @param {string=} params.logoUrl       URL del logo de boletas (o null).
 * @param {object=} params.data          { items, promotions, payments, cashReceived, barista } (ticket completo).
 * @param {Array=}  params.lineas        Alternativa simple a data.items: [{ nombre, cantidad, precioUnitario, subtotal }].
 * @param {object=} params.options       { showSeller, showPayment, customFooter, defaultFooter, contacto }
 */
export const buildBoletaDteHtml = ({ emisor = {}, folio, tipoDte = 39, fecha, montos = {}, timbreDataUrl = null, logoUrl = null, data = {}, lineas = [], containerDeposit = 0, options = {} }) => {
  const nombreDoc = tipoDte === 41 ? 'BOLETA EXENTA ELECTRÓNICA' : 'BOLETA ELECTRÓNICA';
  const fechaTxt = fecha ? new Date(fecha).toLocaleString('es-CL') : '';
  const {
    items: richItems = [], promotions = [], payments = [], cashReceived = null, barista = null
  } = data;
  const {
    showSeller = true, showPayment = true, customFooter = null,
    defaultFooter = 'Gracias por su preferencia.', contacto = null
  } = options;

  // Acepta items enriquecidos (con selecciones/extras) o la forma simple `lineas`.
  const items = richItems.length ? richItems : (lineas || []).map(l => ({
    nombreProducto: l.nombre, quantity: l.cantidad,
    normalPrice: l.precioUnitario, finalPrice: l.precioUnitario, materialSelections: [], extras: []
  }));

  const logoHtml = logoUrl
    ? `<div class="text-center" style="margin-bottom:4px;"><img src="${logoUrl}" alt="Logo" style="width:105px; max-width:100%; height:auto; filter:contrast(160%);" /></div>`
    : '';

  const totalesRows = `
    ${montos.iva > 0 ? `
    <tr><td style="font-size:12px; padding:2px 0; font-family:${MONO};">Neto:</td><td></td><td style="text-align:right; font-size:12px; padding:2px 0; font-family:${MONO};">${money(montos.neto)}</td></tr>
    <tr><td style="font-size:12px; padding:2px 0; font-family:${MONO};">IVA 19%:</td><td></td><td style="text-align:right; font-size:12px; padding:2px 0; font-family:${MONO};">${money(montos.iva)}</td></tr>` : ''}
    ${montos.exento > 0 ? `<tr><td style="font-size:12px; padding:2px 0; font-family:${MONO};">Exento:</td><td></td><td style="text-align:right; font-size:12px; padding:2px 0; font-family:${MONO};">${money(montos.exento)}</td></tr>` : ''}
    <tr><td style="font-size:13px; padding:4px 0; font-family:${MONO};"><strong>TOTAL:</strong></td><td></td><td style="text-align:right; font-size:14px; padding:4px 0; font-weight:bold; font-family:${MONO};">${money(montos.total)}</td></tr>
    ${containerDeposit > 0 ? `
    <tr><td style="font-size:11px; padding:2px 0; font-family:${MONO};">Depósito envases (no tributable):</td><td></td><td style="text-align:right; font-size:11px; padding:2px 0; font-family:${MONO};">${money(containerDeposit)}</td></tr>
    <tr><td style="font-size:13px; padding:4px 0; font-family:${MONO};"><strong>TOTAL PAGADO:</strong></td><td></td><td style="text-align:right; font-size:14px; padding:4px 0; font-weight:bold; font-family:${MONO};">${money((montos.total || 0) + containerDeposit)}</td></tr>` : ''}`;

  const paymentsHtml = showPayment ? buildPaymentsHtml(payments, cashReceived) : '';
  const footerText = (customFooter && customFooter.trim()) ? customFooter : defaultFooter;

  const timbreHtml = timbreDataUrl ? `
    <div class="divider"></div>
    <div class="text-center" style="margin:8px 0;">
      <img src="${timbreDataUrl}" alt="Timbre Electrónico SII" style="width:92%; max-width:280px; image-rendering:pixelated;" />
      <div style="font-family:${MONO}; font-size:10px; margin-top:2px;">Timbre Electrónico SII</div>
      <div style="font-family:${MONO}; font-size:10px;">Verifique en www.sii.cl</div>
    </div>` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${nombreDoc} N° ${folio}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family:${MONO}; font-size:13px; width:100%; margin:0 auto; padding:6px 8px; color:#000; box-sizing:border-box; }
        * { color:#000 !important; font-weight:bold !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
        .text-center { text-align:center; }
        .divider { border-top:1px dashed #000; margin:5px 0; }
        .rut-box { border:1.5px solid #000; border-radius:4px; padding:5px; text-align:center; margin:8px 0; font-weight:bold; }
        table { width:100%; border-collapse:collapse; }
      </style>
    </head>
    <body>
      ${logoHtml}
      <div class="text-center" style="font-weight:bold; font-size:14px;">${escapeHtml(emisor.razonSocial || '')}</div>
      ${emisor.giro ? `<div class="text-center" style="font-size:11px;">${escapeHtml(emisor.giro)}</div>` : ''}
      ${(emisor.direccion || emisor.comuna) ? `<div class="text-center" style="font-size:11px;">${escapeHtml([emisor.direccion, emisor.comuna].filter(Boolean).join(', '))}</div>` : ''}
      <div class="rut-box">
        <div>R.U.T.: ${escapeHtml(emisor.rut || '')}</div>
        <div>${nombreDoc}</div>
        <div>N° ${folio}</div>
      </div>
      <div style="font-size:12px; font-family:${MONO};">Fecha: ${escapeHtml(fechaTxt)}</div>
      ${(showSeller && barista) ? `<div style="font-size:12px; font-family:${MONO};">Atendido por: ${escapeHtml(barista)}</div>` : ''}
      <div class="divider"></div>
      <table>
        <thead><tr>
          <th style="text-align:left; font-size:11px; border-bottom:1px solid #000; font-family:${MONO};">Producto</th>
          <th style="text-align:center; width:34px; font-size:11px; border-bottom:1px solid #000; font-family:${MONO};">Cant</th>
          <th style="text-align:right; width:80px; font-size:11px; border-bottom:1px solid #000; font-family:${MONO};">Total</th>
        </tr></thead>
        <tbody>${buildItemsRows(items)}${buildPromotionRows(promotions)}</tbody>
      </table>
      <div class="divider"></div>
      <table>${totalesRows}</table>
      ${containerDeposit > 0 ? `<p style="font-size:10px; font-family:${MONO}; margin:4px 0 0;">Incluye depósito de envases retornables por ${money(containerDeposit)} (no afecto a impuesto). Reembolsable presentando el vale de envases.</p>` : ''}
      ${paymentsHtml ? `
        <div class="divider"></div>
        <p style="margin:2px 0; font-family:${MONO};"><strong>Detalle Pago:</strong></p>
        ${paymentsHtml}` : ''}
      <div class="divider"></div>
      <p class="text-center" style="font-size:11px; font-family:${MONO}; margin:6px 0;">${escapeHtml(footerText)}${contacto ? `<br>${escapeHtml(contacto)}` : ''}</p>
      ${timbreHtml}
    </body>
    </html>`;
};
