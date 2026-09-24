// Impresión de la boleta electrónica (80mm con timbre) a partir de una venta ya emitida.
// Consulta el endpoint de impresión del DTE y arma el ticket con buildBoletaDteHtml. Si la venta
// no tiene DTE emitido (módulo apagado o emisión fallida), devuelve false para que el llamador
// imprima el ticket interno de siempre.
import { buildBoletaDteHtml, printReceipt } from './receiptTemplates';
import { ted417DataUrl } from './pdf417';

export const tryPrintBoletaDte = async ({
  idVenta, items = [], promotions = [], payments = [], cashReceived = null,
  barista = null, logoUrl = null, options = {}
}) => {
  try {
    const res = await fetch(`/api/dte/venta/${idVenta}/impresion`);
    if (!res.ok) return false;
    const dte = await res.json();
    const timbreDataUrl = await ted417DataUrl(dte.ted);
    const html = buildBoletaDteHtml({
      emisor: dte.emisor, folio: dte.folio, tipoDte: dte.tipoDte, fecha: dte.fecha,
      montos: dte.montos, timbreDataUrl, logoUrl,
      data: { items, promotions, payments, cashReceived, barista },
      options
    });
    printReceipt(html);
    return true;
  } catch {
    return false;
  }
};
