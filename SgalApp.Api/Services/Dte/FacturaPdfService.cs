using System.Globalization;
using System.Text;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using MigraDoc.DocumentObjectModel;
using MigraDoc.DocumentObjectModel.Tables;
using MigraDoc.Rendering;
using PdfSharp.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SgalApp.Api.Services;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using ZXing;
using ZXing.PDF417;
using ZXing.PDF417.Internal;
using MColor = MigraDoc.DocumentObjectModel.Color;

namespace SgalApp.Api.Services.Dte;

public interface IFacturaPdfService
{
    Task<byte[]> CrearAsync(VenVentas venta, DteEmisorData emisor, DteReceptorData receptor,
        int tipoDte, int folio, DteMontos montos, string ted, CancellationToken cancellationToken = default);
}

public sealed class FacturaPdfService(SgalContext context) : IFacturaPdfService
{
    private const string Font = "Arial";
    private const int DetailCols = 6;
    private const double BarcodeWidthCm = 7.0;
    private const double DetailBodyHeightCm = 11.2;
    // Paleta clásica de la factura electrónica del SII: razón social y recuadro del folio en rojo,
    // datos del emisor en azul. Se mantiene fija para respetar el formato tributario habitual.
    private static readonly MColor Rojo = new(192, 0, 0);
    private static readonly MColor Azul = new(0, 51, 160);
    private static readonly MColor Gris = new(90, 90, 90);

    static FacturaPdfService()
    {
        if (GlobalFontSettings.FontResolver == null)
            GlobalFontSettings.FontResolver = new SystemPdfFontResolver();
    }

    public async Task<byte[]> CrearAsync(VenVentas venta, DteEmisorData emisor, DteReceptorData receptor,
        int tipoDte, int folio, DteMontos montos, string ted, CancellationToken cancellationToken = default)
    {
        var marca = await context.OrgConfiguracion.AsNoTracking().Where(x => x.IdConfiguracion == 1)
            .Select(x => new { x.NombreComercial, x.ContactoPublico, x.ColorPrimario }).FirstOrDefaultAsync(cancellationToken);
        var logo = await context.OrgLogosUbicaciones.AsNoTracking().Where(x => x.CodigoUbicacion == "boletas")
            .Select(x => new { x.Logo.Contenido, x.Logo.TipoContenido }).FirstOrDefaultAsync(cancellationToken);
        var vendedor = await context.EmpUsuarios.AsNoTracking().Where(u => u.IdUsuario == venta.IdUsuario)
            .Select(u => u.EmpEmpleados.Where(e => e.Activo).Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault() ?? u.NombreUsuario)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;

        var tempFiles = new List<string>();
        try
        {
            var logoPath = logo?.Contenido is { Length: > 0 } ? WriteTemp(logo.Contenido, logo.TipoContenido == "image/jpeg" ? ".jpg" : ".png", tempFiles) : null;
            var barcodePath = string.IsNullOrWhiteSpace(ted) ? null : WritePdf417(ted, tempFiles);
            var doc = BuildDocument(venta, emisor, receptor, tipoDte, folio, montos, vendedor,
                marca?.NombreComercial ?? emisor.RazonSocial, marca?.ContactoPublico, marca?.ColorPrimario ?? "#1F4E5F", logoPath, barcodePath);
            var renderer = new PdfDocumentRenderer { Document = doc };
            renderer.RenderDocument();
            using var stream = new MemoryStream();
            renderer.PdfDocument.Save(stream, false);
            return stream.ToArray();
        }
        finally
        {
            foreach (var file in tempFiles) if (File.Exists(file)) File.Delete(file);
        }
    }

    private static Document BuildDocument(VenVentas venta, DteEmisorData emisor, DteReceptorData receptor,
        int tipoDte, int folio, DteMontos montos, string vendedor, string nombreComercial,
        string? contacto, string primary, string? logoPath, string? barcodePath)
    {
        var document = new Document();
        var section = document.AddSection();
        section.PageSetup.PageFormat = PageFormat.A4;
        section.PageSetup.TopMargin = Unit.FromCentimeter(1.0);
        section.PageSetup.BottomMargin = Unit.FromCentimeter(1.0);
        section.PageSetup.LeftMargin = Unit.FromCentimeter(1.5);
        section.PageSetup.RightMargin = Unit.FromCentimeter(1.5);
        document.Styles["Normal"]!.Font.Name = Font;
        document.Styles["Normal"]!.Font.Size = 9;

        // ---- Encabezado: emisor (izquierda) y recuadro rojo del folio (derecha) ----
        var header = section.AddTable();
        header.AddColumn(Unit.FromCentimeter(11.0)); header.AddColumn(Unit.FromCentimeter(7.0));
        var hr = header.AddRow();

        var left = hr.Cells[0];
        var issuer = left.Elements.AddTable(); issuer.AddColumn(Unit.FromCentimeter(2.9)); issuer.AddColumn(Unit.FromCentimeter(8.1));
        var issuerRow = issuer.AddRow();
        issuerRow.Cells[0].VerticalAlignment = VerticalAlignment.Center;
        if (logoPath != null) { var image = issuerRow.Cells[0].AddImage(logoPath); image.LockAspectRatio = true; image.Width = Unit.FromCentimeter(2.5); }
        else { var initials = issuerRow.Cells[0].AddParagraph("LOGO"); initials.Format.Alignment = ParagraphAlignment.Center; initials.Format.Font.Size = 14; initials.Format.Font.Bold = true; issuerRow.Cells[0].Shading.Color = Colors.LightGray; }
        var issuerData = issuerRow.Cells[1];
        var brand = issuerData.AddParagraph(); brand.AddFormattedText(nombreComercial, TextFormat.Bold); brand.Format.Font.Size = 16; brand.Format.Font.Color = Rojo; brand.Format.SpaceAfter = Unit.FromMillimeter(0.5);
        if (!string.Equals(nombreComercial, emisor.RazonSocial, StringComparison.OrdinalIgnoreCase))
            AddLineColor(issuerData, emisor.RazonSocial, 8.5, Gris);
        AddLineColor(issuerData, $"Giro: {emisor.Giro}", 9, Azul);
        AddLineColor(issuerData, $"Dirección: {emisor.Direccion}", 9, Azul);
        var loc = emisor.Comuna;
        if (!string.IsNullOrWhiteSpace(emisor.Ciudad)) loc = string.IsNullOrWhiteSpace(loc) ? emisor.Ciudad : $"{emisor.Comuna} - {emisor.Ciudad}";
        if (!string.IsNullOrWhiteSpace(loc)) AddLineColor(issuerData, loc, 9, Azul);
        if (!string.IsNullOrWhiteSpace(contacto)) AddLineColor(issuerData, contacto!, 9, Azul);

        var boxCell = hr.Cells[1];
        var boxTable = boxCell.Elements.AddTable(); boxTable.Borders.Width = 1.6; boxTable.Borders.Color = Rojo; boxTable.AddColumn(Unit.FromCentimeter(6.6));
        var boxRow = boxTable.AddRow(); boxRow.Cells[0].VerticalAlignment = VerticalAlignment.Center;
        AddBoxLine(boxRow.Cells[0], $"R.U.T.: {emisor.Rut}", 13.5);
        AddBoxLine(boxRow.Cells[0], tipoDte == 34 ? "FACTURA EXENTA ELECTRÓNICA" : "FACTURA ELECTRÓNICA", 12.5);
        AddBoxLine(boxRow.Cells[0], $"N° {folio}", 15);
        var sii = boxCell.AddParagraph($"S.I.I. - {emisor.Comuna.ToUpperInvariant()}"); sii.Format.Alignment = ParagraphAlignment.Center; sii.Format.Font.Size = 8; sii.Format.Font.Bold = true; sii.Format.SpaceBefore = Unit.FromMillimeter(1.5);
        var fecha = boxCell.AddParagraph(); fecha.Format.SpaceBefore = Unit.FromMillimeter(3); fecha.AddFormattedText($"Fecha Emisión: {FechaLarga(venta.FechaVenta)}", TextFormat.Bold);
        if (!string.IsNullOrWhiteSpace(vendedor)) { var v = boxCell.AddParagraph($"Vendedor: {vendedor}"); v.Format.Font.Size = 8; v.Format.Font.Color = Gris; v.Format.SpaceBefore = Unit.FromMillimeter(0.8); }

        // ---- Datos del receptor ----
        var receptorTable = section.AddTable(); receptorTable.Format.SpaceBefore = Unit.FromCentimeter(.35); receptorTable.Borders.Width = .75;
        receptorTable.AddColumn(Unit.FromCentimeter(18.0));
        var rcell = receptorTable.AddRow().Cells[0]; rcell.Format.Font.Size = 8.5;
        AddReceptorLine(rcell, "SEÑOR(ES): ", receptor.RazonSocial, "R.U.T.: ", receptor.Rut);
        AddReceptorLine(rcell, "GIRO: ", receptor.Giro ?? string.Empty);
        AddReceptorLine(rcell, "DIRECCIÓN: ", receptor.Direccion);
        AddReceptorLine(rcell, "COMUNA: ", receptor.Comuna, "CIUDAD: ", receptor.Ciudad);
        if (!string.IsNullOrWhiteSpace(receptor.Contacto)) AddReceptorLine(rcell, "CONTACTO: ", receptor.Contacto!);

        // ---- Detalle: marco con separadores verticales y líneas horizontales solo en la cabecera ----
        var detail = section.AddTable(); detail.Format.SpaceBefore = Unit.FromCentimeter(.35); detail.Borders.Color = Colors.Black;
        detail.AddColumn(Unit.FromCentimeter(2.0)); detail.AddColumn(Unit.FromCentimeter(7.6)); detail.AddColumn(Unit.FromCentimeter(1.8));
        detail.AddColumn(Unit.FromCentimeter(2.3)); detail.AddColumn(Unit.FromCentimeter(1.6)); detail.AddColumn(Unit.FromCentimeter(2.7));
        var dh = detail.AddRow(); dh.Format.Font.Bold = true; dh.Format.Font.Size = 8.5; dh.VerticalAlignment = VerticalAlignment.Center;
        SetCell(dh.Cells[0], "CÓDIGO", ParagraphAlignment.Center); SetCell(dh.Cells[1], "DESCRIPCIÓN", ParagraphAlignment.Center); SetCell(dh.Cells[2], "CANTIDAD", ParagraphAlignment.Center);
        SetCell(dh.Cells[3], "PRECIO", ParagraphAlignment.Center); SetCell(dh.Cells[4], "%DESC", ParagraphAlignment.Center); SetCell(dh.Cells[5], "VALOR", ParagraphAlignment.Center);
        DetailVLines(dh);
        for (int i = 0; i < DetailCols; i++) { dh.Cells[i].Borders.Top.Width = .75; dh.Cells[i].Borders.Bottom.Width = .75; }
        foreach (var item in venta.VenDetalleVenta)
        {
            var lista = item.PrecioNormal > item.PrecioUnitario ? item.PrecioNormal : item.PrecioUnitario;
            var desc = lista > item.PrecioUnitario ? (int)Math.Round((1 - (double)item.PrecioUnitario / lista) * 100) : 0;
            var row = detail.AddRow(); row.Format.Font.Size = 9;
            SetCell(row.Cells[0], item.IdProducto.ToString(), ParagraphAlignment.Center);
            SetCell(row.Cells[1], item.IdProductoNavigation.NombreProducto);
            SetCell(row.Cells[2], item.Cantidad.ToString(), ParagraphAlignment.Center);
            SetCell(row.Cells[3], Miles(lista), ParagraphAlignment.Right);
            SetCell(row.Cells[4], desc > 0 ? $"{desc}%" : string.Empty, ParagraphAlignment.Center);
            SetCell(row.Cells[5], Miles(item.Subtotal), ParagraphAlignment.Right);
            DetailVLines(row);
        }
        // El recuadro conserva espacio para escribir sin empujar el acuse de recibo a una segunda
        // página. La altura objetivo considera el encabezado, timbre, totales y cola cedible de A4.
        var altoFilas = venta.VenDetalleVenta.Count * 0.52;
        var spacer = detail.AddRow(); spacer.Height = Unit.FromCentimeter(Math.Max(1.2, DetailBodyHeightCm - altoFilas)); spacer.HeightRule = RowHeightRule.Exactly;
        DetailVLines(spacer);
        for (int i = 0; i < DetailCols; i++) spacer.Cells[i].Borders.Bottom.Width = .75;

        // ---- Timbre electrónico (izquierda) y recuadro de totales (derecha) ----
        var lower = section.AddTable(); lower.Format.SpaceBefore = Unit.FromCentimeter(.35); lower.AddColumn(Unit.FromCentimeter(11.2)); lower.AddColumn(Unit.FromCentimeter(6.8));
        var lr = lower.AddRow(); lr.Cells[0].VerticalAlignment = VerticalAlignment.Top; lr.Cells[1].VerticalAlignment = VerticalAlignment.Top;
        if (barcodePath != null)
        {
            // El timbre y sus leyendas se agrupan en una tabla anidada que se ajusta a su contenido:
            // así el PDF417 y los textos quedan juntos y no se dispersan por la alineación de la celda.
            var timbreBox = lr.Cells[0].Elements.AddTable(); timbreBox.Format.SpaceBefore = Unit.FromMillimeter(1); timbreBox.AddColumn(Unit.FromCentimeter(8.5));
            var tb = timbreBox.AddRow().Cells[0]; tb.Format.Alignment = ParagraphAlignment.Center;
            // El PNG del PDF417 se guarda con una resolución tal que su ancho intrínseco ya es ~7 cm
            // (ver WritePdf417): así MigraDoc reserva exactamente ese alto y las leyendas quedan pegadas al timbre.
            var image = tb.AddImage(barcodePath); image.LockAspectRatio = true; image.Width = Unit.FromCentimeter(BarcodeWidthCm);
            var timbre = tb.AddParagraph("Timbre Electrónico S.I.I."); timbre.Format.Alignment = ParagraphAlignment.Center; timbre.Format.Font.Size = 8; timbre.Format.SpaceBefore = Unit.FromMillimeter(1);
            var res = ResolucionTexto(emisor); if (res != null) { var rp2 = tb.AddParagraph(res); rp2.Format.Alignment = ParagraphAlignment.Center; rp2.Format.Font.Size = 8; }
            var verif = tb.AddParagraph("Verifique documento: www.sii.cl"); verif.Format.Alignment = ParagraphAlignment.Center; verif.Format.Font.Size = 8;
        }
        var totals = lr.Cells[1].Elements.AddTable(); totals.Borders.Width = .75; totals.AddColumn(Unit.FromCentimeter(6.8));
        var tcell = totals.AddRow().Cells[0]; tcell.Format.Font.Size = 9.5;
        if (montos.Neto > 0) AddTotalLine(tcell, "MONTO NETO", montos.Neto);
        if (montos.Exento > 0) AddTotalLine(tcell, "MONTO EXENTO", montos.Exento);
        if (montos.Iva > 0) AddTotalLine(tcell, "I.V.A. 19%", montos.Iva);
        AddTotalLine(tcell, "TOTAL", montos.Total, true);

        // ---- Acuse de recibo (Ley 19.983) y leyenda CEDIBLE ----
        var receipt = section.AddTable(); receipt.Format.SpaceBefore = Unit.FromCentimeter(.25); receipt.Borders.Width = .75; receipt.AddColumn(Unit.FromCentimeter(18.0));
        var receiptRow = receipt.AddRow(); receiptRow.Height = Unit.FromCentimeter(1.25); receiptRow.HeightRule = RowHeightRule.AtLeast;
        var rp = receiptRow.Cells[0].AddParagraph(); rp.Format.Font.Size = 7.5;
        rp.AddFormattedText("NOMBRE: _______________________   R.U.T.: ______________   FECHA: __________   RECINTO: __________________\n", TextFormat.Bold);
        rp.AddFormattedText("FIRMA: ___________________________\n\n", TextFormat.Bold);
        rp.AddText("El acuse de recibo que se declara en este acto, de acuerdo con lo dispuesto en la letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).");
        var cedible = section.AddParagraph("CEDIBLE"); cedible.Format.Alignment = ParagraphAlignment.Right; cedible.Format.Font.Bold = true; cedible.Format.Font.Size = 9; cedible.Format.Font.Color = Rojo; cedible.Format.SpaceBefore = Unit.FromMillimeter(1.5);
        return document;
    }

    private static string WritePdf417(string ted, List<string> files)
    {
        var tedCompacto = PrepararTedParaPdf417(ted);
        // El TED real incluye CAF y firma, por lo que suele superar 1 KB. ISO-8859-1 sin ECI
        // permite que ZXing use compactación de texto/byte eficientemente; EC nivel 2 es el
        // nivel recomendado para este tamaño y deja capacidad suficiente para el TED completo.
        var writer = new ZXing.BarcodeWriterPixelData
        {
            Format = BarcodeFormat.PDF_417,
            Options = new PDF417EncodingOptions
            {
                Width = 900,
                Height = 300,
                Margin = 4,
                Compact = false,
                Compaction = Compaction.TEXT,
                CharacterSet = "ISO-8859-1",
                DisableECI = true,
                ErrorCorrection = PDF417ErrorCorrectionLevel.L2,
                Dimensions = new Dimensions(2, 30, 3, 90)
            }
        };
        var pixels = writer.Write(tedCompacto);
        var path = Path.Combine(Path.GetTempPath(), $"sgal-ted-{Guid.NewGuid():N}.png");
        using var image = Image.LoadPixelData<Rgba32>(pixels.Pixels, pixels.Width, pixels.Height);

        // ZXing dibuja el PDF417 arriba a la izquierda de un lienzo fijo (900x300) y deja el resto en
        // blanco: para este TED la tinta ocupa ~510x120 px, así que sobra un gran margen blanco a la
        // derecha y abajo que, al mostrarse, se ve como un hueco entre el timbre y sus leyendas. Se
        // recorta la imagen al código real dejando una zona muda (quiet zone) para que siga siendo legible.
        Recortar(image);

        // MigraDoc reserva el alto de una imagen según su tamaño intrínseco (px / DPI), no según el ancho
        // mostrado. Se fija el DPI para que el tamaño intrínseco coincida con el ancho de impresión y no
        // aparezcan huecos por reservas de espacio sobredimensionadas.
        var dpi = image.Width / (BarcodeWidthCm / 2.54);
        image.Metadata.HorizontalResolution = dpi;
        image.Metadata.VerticalResolution = dpi;
        image.Metadata.ResolutionUnits = SixLabors.ImageSharp.Metadata.PixelResolutionUnit.PixelsPerInch;
        image.SaveAsPng(path); files.Add(path); return path;
    }

    /// <summary>Recorta el PNG al contenido (píxeles oscuros) del PDF417, conservando una zona muda.</summary>
    private static void Recortar(Image<Rgba32> image)
    {
        int w = image.Width, h = image.Height, minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                var p = image[x, y];
                if (p.R < 128 && p.G < 128 && p.B < 128)
                {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
        if (maxX < minX || maxY < minY) return; // imagen en blanco: nada que recortar

        const int quiet = 16; // zona muda para que el lector pueda decodificar el código
        var left = Math.Max(0, minX - quiet);
        var top = Math.Max(0, minY - quiet);
        var right = Math.Min(w - 1, maxX + quiet);
        var bottom = Math.Min(h - 1, maxY + quiet);
        image.Mutate(c => c.Crop(new Rectangle(left, top, right - left + 1, bottom - top + 1)));
    }

    /// <summary>
    /// El TED del XML firmado suele venir indentado y puede contener tildes. PDF417 aprovecha
    /// mucho mejor el modo TEXT que BYTE. Se elimina únicamente whitespace de presentación y
    /// los caracteres no ASCII se escriben como entidades numéricas XML: al leer el código se
    /// obtiene el mismo árbol XML y la firma FRMT continúa validando el DD canónico.
    /// </summary>
    private static string PrepararTedParaPdf417(string ted)
    {
        var compacto = XElement.Parse(ted, LoadOptions.None).ToString(SaveOptions.DisableFormatting);
        var result = new StringBuilder(compacto.Length + 64);
        foreach (var rune in compacto.EnumerateRunes())
        {
            if (rune.Value is >= 32 and <= 126)
                result.Append((char)rune.Value);
            else
                result.Append("&#x").Append(rune.Value.ToString("X", CultureInfo.InvariantCulture)).Append(';');
        }
        return result.ToString();
    }
    private static string WriteTemp(byte[] bytes, string ext, List<string> files) { var path = Path.Combine(Path.GetTempPath(), $"sgal-factura-{Guid.NewGuid():N}{ext}"); File.WriteAllBytes(path, bytes); files.Add(path); return path; }
    private static string Miles(int value) => value.ToString("N0", CultureInfo.GetCultureInfo("es-CL"));

    /// <summary>Fecha en formato largo español ("30 de Agosto del 2025") como usa la factura del SII.</summary>
    private static string FechaLarga(DateTime fecha)
    {
        var ci = CultureInfo.GetCultureInfo("es-CL");
        var mes = ci.DateTimeFormat.GetMonthName(fecha.Month);
        if (mes.Length > 0) mes = char.ToUpper(mes[0], ci) + mes[1..];
        return $"{fecha:dd} de {mes} del {fecha:yyyy}";
    }

    private static string? ResolucionTexto(DteEmisorData emisor)
    {
        if (emisor.ResolucionNumero is null && emisor.ResolucionFecha is null) return null;
        var anio = emisor.ResolucionFecha?.Year;
        return anio.HasValue ? $"Res. N° {emisor.ResolucionNumero ?? 0} de {anio}" : $"Res. N° {emisor.ResolucionNumero ?? 0}";
    }

    private static void AddLineColor(Cell cell, string text, double size, MColor color) { var p = cell.AddParagraph(text); p.Format.Font.Size = size; p.Format.Font.Color = color; p.Format.SpaceAfter = 0; }
    private static void AddBoxLine(Cell cell, string text, double size) { var p = cell.AddParagraph(text); p.Format.Alignment = ParagraphAlignment.Center; p.Format.Font.Size = size; p.Format.Font.Bold = true; p.Format.Font.Color = Rojo; p.Format.SpaceBefore = Unit.FromMillimeter(1); p.Format.SpaceAfter = Unit.FromMillimeter(1.5); }
    private static void SetCell(Cell c, string text, ParagraphAlignment alignment = ParagraphAlignment.Left, bool bold = false) { var p = c.AddParagraph(text); p.Format.Alignment = alignment; p.Format.Font.Bold = bold; p.Format.SpaceBefore = Unit.FromMillimeter(1); p.Format.SpaceAfter = Unit.FromMillimeter(1); }

    /// <summary>Separadores verticales del detalle: líneas entre columnas y marco lateral, sin líneas horizontales entre productos.</summary>
    private static void DetailVLines(Row r)
    {
        for (int i = 0; i < DetailCols; i++) r.Cells[i].Borders.Left.Width = i == 0 ? .75 : .5;
        r.Cells[DetailCols - 1].Borders.Right.Width = .75;
    }

    /// <summary>Línea del recuadro de totales: etiqueta a la izquierda, "$" y monto alineado a la derecha mediante tabuladores.</summary>
    private static void AddTotalLine(Cell cell, string label, int value, bool bold = false)
    {
        var p = cell.AddParagraph();
        p.Format.SpaceBefore = Unit.FromMillimeter(1); p.Format.SpaceAfter = Unit.FromMillimeter(1);
        p.Format.TabStops.AddTabStop(Unit.FromCentimeter(3.6), TabAlignment.Left);
        p.Format.TabStops.AddTabStop(Unit.FromCentimeter(6.4), TabAlignment.Right);
        var format = bold ? TextFormat.Bold : TextFormat.NotBold;
        p.AddFormattedText(label, format); p.AddTab(); p.AddFormattedText("$", format); p.AddTab(); p.AddFormattedText(Miles(value), format);
        if (bold) p.Format.Font.Size = 11;
    }

    /// <summary>Etiqueta a la izquierda con su valor y, opcionalmente, un segundo par etiqueta/valor tabulado a la derecha.</summary>
    private static void AddReceptorLine(Cell cell, string label, string value, string? rightLabel = null, string? rightValue = null)
    {
        var p = cell.AddParagraph();
        p.Format.SpaceBefore = Unit.FromMillimeter(0.7); p.Format.SpaceAfter = Unit.FromMillimeter(0.7);
        p.AddFormattedText(label, TextFormat.Bold); p.AddText(value);
        if (rightLabel != null)
        {
            p.Format.TabStops.AddTabStop(Unit.FromCentimeter(12.5), TabAlignment.Left);
            p.AddTab(); p.AddFormattedText(rightLabel, TextFormat.Bold); p.AddText(rightValue ?? string.Empty);
        }
    }
}
