using ClosedXML.Excel;
using SgalApp.Infrastructure.Context;
using MigraDoc.DocumentObjectModel;
using MigraDoc.DocumentObjectModel.Tables;
using MigraDoc.Rendering;
using PdfSharp.Fonts;
using Microsoft.EntityFrameworkCore;
using System.Globalization;

namespace SgalApp.Api.Services;

public record PurchaseOrderExportItem(
    string Tipo,
    string Codigo,
    string Nombre,
    string Unidad,
    decimal CantidadSolicitada,
    decimal CantidadRecibida,
    int PrecioUnitarioEstimado,
    int? PrecioUnitarioReal,
    int SubtotalEstimado,
    int? SubtotalReal,
    int? PrecioVentaActual,
    int? NuevoPrecioVenta,
    bool PrecioConfirmado,
    string EstadoRecepcion);

public record PurchaseOrderExportModel(
    int IdOrdenCompra,
    string Proveedor,
    string? ProveedorRut,
    string? ProveedorDireccion,
    string? ProveedorComuna,
    string? ProveedorCiudad,
    string? ProveedorTelefono,
    string? ProveedorCorreo,
    string? ProveedorContacto,
    string Estado,
    string Usuario,
    DateTime FechaSolicitud,
    DateTime FechaLlegadaEsperada,
    DateTime? FechaRecepcion,
    string? Observaciones,
    int TotalEstimado,
    int? TotalReal,
    IReadOnlyList<PurchaseOrderExportItem> Items);

public interface IPurchaseOrderExportService
{
    byte[] CreatePdf(PurchaseOrderExportModel order);
    byte[] CreateExcel(PurchaseOrderExportModel order);
}

public class PurchaseOrderExportService : IPurchaseOrderExportService, IDisposable
{
    private const string TextColor = "#0F172A";
    private const string BorderColor = "#E2E8F0";
    private readonly string _primaryColor;
    private readonly string _brandName;
    private readonly string? _logoPath;

    static PurchaseOrderExportService()
    {
        if (GlobalFontSettings.FontResolver == null)
            GlobalFontSettings.FontResolver = new SystemPdfFontResolver();
    }

    public PurchaseOrderExportService(SgalContext context)
    {
        var branding = context.OrgConfiguracion.AsNoTracking()
            .Where(x => x.IdConfiguracion == 1)
            .Select(x => new { x.NombreComercial, x.ColorPrimario, x.LogoContenido, x.LogoTipoContenido })
            .FirstOrDefault();

        _brandName = branding?.NombreComercial ?? "SGAL App";
        _primaryColor = branding?.ColorPrimario ?? "#1F4E5F";
        if (branding?.LogoContenido != null)
        {
            var extension = branding.LogoTipoContenido switch
            {
                "image/jpeg" => ".jpg",
                _ => ".png"
            };
            _logoPath = Path.Combine(Path.GetTempPath(), $"sgal-logo-{Guid.NewGuid():N}{extension}");
            File.WriteAllBytes(_logoPath, branding.LogoContenido);
        }
    }

    public byte[] CreateExcel(PurchaseOrderExportModel order)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Orden de compra");

        sheet.Cell("A1").Value = $"ORDEN DE COMPRA #{order.IdOrdenCompra}";
        sheet.Range("A1:N1").Merge().Style
            .Font.SetBold().Font.SetFontSize(18).Font.SetFontColor(XLColor.White)
            .Fill.SetBackgroundColor(XLColor.FromHtml(_primaryColor))
            .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);
        sheet.Row(1).Height = 30;

        AddExcelMetadata(sheet, 3, "Proveedor", order.Proveedor);
        AddExcelMetadata(sheet, 4, "Estado", order.Estado);
        AddExcelMetadata(sheet, 5, "Creada por", order.Usuario);
        AddExcelMetadata(sheet, 6, "Fecha de solicitud", order.FechaSolicitud);
        AddExcelMetadata(sheet, 7, "Llegada esperada", order.FechaLlegadaEsperada);
        AddExcelMetadata(sheet, 8, "Fecha de recepción", order.FechaRecepcion);
        AddExcelMetadata(sheet, 9, "Observaciones", order.Observaciones ?? string.Empty);

        var headers = new[]
        {
            "Código", "Tipo", "Artículo", "Unidad", "Solicitado", "Recibido", "Costo estimado",
            "Costo real", "Subtotal estimado", "Subtotal real", "Precio venta actual",
            "Nuevo precio venta", "Precio confirmado", "Recepción"
        };
        const int headerRow = 11;
        for (var column = 1; column <= headers.Length; column++)
            sheet.Cell(headerRow, column).Value = headers[column - 1];

        var headerRange = sheet.Range(headerRow, 1, headerRow, headers.Length);
        headerRange.Style.Font.SetBold().Font.SetFontColor(XLColor.White);
        headerRange.Style.Fill.SetBackgroundColor(XLColor.FromHtml(_primaryColor));
        headerRange.Style.Alignment.WrapText = true;
        headerRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        sheet.Row(headerRow).Height = 32;

        var row = headerRow + 1;
        foreach (var item in order.Items)
        {
            sheet.Cell(row, 1).Value = item.Codigo;
            sheet.Cell(row, 2).Value = item.Tipo;
            sheet.Cell(row, 3).Value = item.Nombre;
            sheet.Cell(row, 4).Value = item.Unidad;
            sheet.Cell(row, 5).Value = item.CantidadSolicitada;
            sheet.Cell(row, 6).Value = item.CantidadRecibida;
            sheet.Cell(row, 7).Value = item.PrecioUnitarioEstimado;
            if (item.PrecioUnitarioReal.HasValue) sheet.Cell(row, 8).Value = item.PrecioUnitarioReal.Value;
            sheet.Cell(row, 9).FormulaA1 = $"=E{row}*G{row}";
            if (item.PrecioUnitarioReal.HasValue) sheet.Cell(row, 10).FormulaA1 = $"=F{row}*H{row}";
            if (item.PrecioVentaActual.HasValue) sheet.Cell(row, 11).Value = item.PrecioVentaActual.Value;
            if (item.NuevoPrecioVenta.HasValue) sheet.Cell(row, 12).Value = item.NuevoPrecioVenta.Value;
            sheet.Cell(row, 13).Value = item.PrecioConfirmado ? "Sí" : item.NuevoPrecioVenta.HasValue ? "Pendiente" : "No aplica";
            sheet.Cell(row, 14).Value = item.EstadoRecepcion;
            row++;
        }

        sheet.Cell(row, 8).Value = "Totales";
        sheet.Cell(row, 9).FormulaA1 = $"=SUM(I{headerRow + 1}:I{row - 1})";
        sheet.Cell(row, 10).FormulaA1 = $"=SUM(J{headerRow + 1}:J{row - 1})";
        sheet.Range(row, 8, row, 10).Style.Font.SetBold();
        sheet.Range(row, 8, row, 10).Style.Fill.SetBackgroundColor(XLColor.FromHtml("E8F1EC"));

        sheet.Range(headerRow + 1, 5, row, 6).Style.NumberFormat.Format = "#,##0.###";
        sheet.Range(headerRow + 1, 7, row, 12).Style.NumberFormat.Format = "$#,##0";
        sheet.Range(headerRow, 1, row, headers.Length).Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        sheet.Range(headerRow, 1, row, headers.Length).Style.Border.InsideBorder = XLBorderStyleValues.Hair;
        sheet.SheetView.FreezeRows(headerRow);
        sheet.Columns().AdjustToContents(8, 34);
        sheet.Column(3).Width = Math.Max(sheet.Column(3).Width, 24);
        sheet.Column(10).Width = 18;
        sheet.Column(12).Width = 19;
        sheet.Column(13).Width = 18;
        sheet.Column(14).Width = 18;
        sheet.PageSetup.PageOrientation = XLPageOrientation.Landscape;
        sheet.PageSetup.PagesWide = 1;
        sheet.PageSetup.Margins.SetLeft(0.3).SetRight(0.3).SetTop(0.5).SetBottom(0.5);

        workbook.RecalculateAllFormulas();
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public byte[] CreatePdf(PurchaseOrderExportModel order)
    {
        var document = new Document();
        document.Info.Title = $"Orden de compra #{order.IdOrdenCompra}";
        document.Info.Subject = $"Orden de compra para {order.Proveedor}";
        var normal = document.Styles[StyleNames.Normal]!;
        normal.Font.Name = "Arial";
        normal.Font.Size = 8.5;

        var section = document.AddSection();
        section.PageSetup.Orientation = Orientation.Portrait;
        section.PageSetup.PageFormat = PageFormat.A4;
        section.PageSetup.LeftMargin = Unit.FromCentimeter(1.2);
        section.PageSetup.RightMargin = Unit.FromCentimeter(1.2);
        section.PageSetup.TopMargin = Unit.FromCentimeter(1.1);
        section.PageSetup.BottomMargin = Unit.FromCentimeter(1.1);

        var header = section.AddTable();
        header.Borders.Visible = false;
        header.AddColumn(Unit.FromCentimeter(12.4));
        header.AddColumn(Unit.FromCentimeter(6.2));
        var headerRow = header.AddRow();
        headerRow.Height = Unit.FromCentimeter(2.25);
        headerRow.Cells[0].VerticalAlignment = VerticalAlignment.Center;
        headerRow.Cells[1].VerticalAlignment = VerticalAlignment.Center;

        var title = headerRow.Cells[0].AddParagraph("ORDEN DE COMPRA");
        title.Format.Font.Size = 23;
        title.Format.Font.Bold = true;
        title.Format.Font.Color = Color.Parse(TextColor);

        if (_logoPath != null)
        {
            var logoParagraph = headerRow.Cells[1].AddParagraph();
            logoParagraph.Format.Alignment = ParagraphAlignment.Right;
            var logo = logoParagraph.AddImage(_logoPath);
            logo.LockAspectRatio = true;
            logo.Width = Unit.FromCentimeter(3.8);
        }
        else
        {
            var brand = headerRow.Cells[1].AddParagraph(_brandName.ToUpperInvariant());
            brand.Format.Alignment = ParagraphAlignment.Right;
            brand.Format.Font.Bold = true;
            brand.Format.Font.Size = 14;
            brand.Format.Font.Color = Color.Parse(_primaryColor);
        }

        var metadata = section.AddTable();
        metadata.Borders.Visible = false;
        metadata.Format.SpaceBefore = Unit.FromCentimeter(0.2);
        metadata.Format.SpaceAfter = Unit.FromCentimeter(0.45);
        metadata.AddColumn(Unit.FromCentimeter(9.3));
        metadata.AddColumn(Unit.FromCentimeter(9.3));
        var metadataRow = metadata.AddRow();
        AddLabeledText(metadataRow.Cells[0], "N.º de orden", $"#{order.IdOrdenCompra:D5}");
        AddLabeledText(metadataRow.Cells[1], "Fecha", order.FechaSolicitud.ToString("dd-MM-yyyy"), ParagraphAlignment.Right);
        var metadataSecondRow = metadata.AddRow();
        AddLabeledText(metadataSecondRow.Cells[0], "Estado", order.Estado);
        AddLabeledText(metadataSecondRow.Cells[1], "Llegada esperada", order.FechaLlegadaEsperada.ToString("dd-MM-yyyy"), ParagraphAlignment.Right);

        AddSectionTitle(section, "DATOS DEL PROVEEDOR");
        var providerTable = section.AddTable();
        providerTable.Borders.Color = Color.Parse(BorderColor);
        providerTable.Borders.Width = 0.45;
        providerTable.AddColumn(Unit.FromCentimeter(9.3));
        providerTable.AddColumn(Unit.FromCentimeter(9.3));
        var providerRow = providerTable.AddRow();
        providerRow.TopPadding = Unit.FromCentimeter(0.2);
        providerRow.BottomPadding = Unit.FromCentimeter(0.2);
        AddProviderDetails(providerRow.Cells[0], order, true);
        AddProviderDetails(providerRow.Cells[1], order, false);

        AddSectionTitle(section, "PRODUCTOS Y MATERIAS PRIMAS", Unit.FromCentimeter(0.45));

        var table = section.AddTable();
        table.Borders.Color = Color.Parse(BorderColor);
        table.Borders.Width = 0.4;
        var widths = new[] { 0.7, 2.4, 2.1, 4.7, 1.5, 1.1, 2.7, 3.4 };
        foreach (var width in widths) table.AddColumn(Unit.FromCentimeter(width));

        var itemHeader = table.AddRow();
        itemHeader.HeadingFormat = true;
        itemHeader.Shading.Color = Color.Parse(_primaryColor);
        itemHeader.VerticalAlignment = VerticalAlignment.Center;
        var labels = new[] { "N.º", "CÓDIGO", "TIPO", "DESCRIPCIÓN", "CANT.", "UNIDAD", "COSTO UNIT.", "SUBTOTAL" };
        for (var index = 0; index < labels.Length; index++)
        {
            var paragraph = itemHeader.Cells[index].AddParagraph(labels[index]);
            paragraph.Format.Font.Bold = true;
            paragraph.Format.Font.Color = Colors.White;
            paragraph.Format.Font.Size = 7.5;
            paragraph.Format.Alignment = index == 3 ? ParagraphAlignment.Left : ParagraphAlignment.Center;
        }

        var itemNumber = 1;
        foreach (var item in order.Items)
        {
            var detail = table.AddRow();
            detail.TopPadding = Unit.FromCentimeter(0.12);
            detail.BottomPadding = Unit.FromCentimeter(0.12);
            AddCenteredText(detail.Cells[0], itemNumber++.ToString());
            var code = detail.Cells[1].AddParagraph(item.Codigo);
            code.Format.Alignment = ParagraphAlignment.Center;
            code.Format.Font.Size = 7.2;
            AddCenteredText(detail.Cells[2], string.Equals(item.Tipo, "Producto", StringComparison.OrdinalIgnoreCase) ? "P" : "MP");
            var description = detail.Cells[3].AddParagraph();
            description.AddFormattedText(item.Nombre, TextFormat.Bold);
            AddCenteredText(detail.Cells[4], FormatQuantity(item.CantidadSolicitada));
            AddCenteredText(detail.Cells[5], item.Unidad);
            AddCenteredText(detail.Cells[6], FormatCurrency(item.PrecioUnitarioEstimado));
            var total = detail.Cells[7].AddParagraph();
            total.Format.Alignment = ParagraphAlignment.Right;
            total.AddText(FormatCurrency(item.SubtotalEstimado));
        }

        for (var emptyRow = order.Items.Count; emptyRow < 10; emptyRow++)
        {
            var detail = table.AddRow();
            detail.Height = Unit.FromCentimeter(0.55);
            AddCenteredText(detail.Cells[0], (emptyRow + 1).ToString());
        }

        var totals = section.AddTable();
        totals.Format.SpaceBefore = Unit.Zero;
        totals.Borders.Color = Color.Parse(BorderColor);
        totals.Borders.Width = 0.4;
        totals.AddColumn(Unit.FromCentimeter(12.3));
        totals.AddColumn(Unit.FromCentimeter(3.1));
        totals.AddColumn(Unit.FromCentimeter(3.2));
        AddTotalRow(totals, "TOTAL ESTIMADO", FormatCurrency(order.TotalEstimado), false);
        if (order.TotalReal.HasValue)
            AddTotalRow(totals, "TOTAL REAL", FormatCurrency(order.TotalReal.Value), true);

        var typeLegend = section.AddParagraph();
        typeLegend.Format.SpaceBefore = Unit.FromCentimeter(0.08);
        typeLegend.Format.SpaceAfter = Unit.Zero;
        typeLegend.Format.Font.Size = 7;
        typeLegend.Format.Font.Color = Color.Parse(TextColor);
        typeLegend.AddFormattedText("TIPO: ", TextFormat.Bold);
        typeLegend.AddText("P = Producto  |  MP = Materia prima");

        AddSectionTitle(section, "COMENTARIOS O INSTRUCCIONES ESPECIALES", Unit.FromCentimeter(0.45));
        var comments = section.AddTable();
        comments.Borders.Color = Color.Parse(BorderColor);
        comments.Borders.Width = 0.45;
        comments.AddColumn(Unit.FromCentimeter(18.6));
        var commentsRow = comments.AddRow();
        commentsRow.Height = Unit.FromCentimeter(2.2);
        commentsRow.TopPadding = Unit.FromCentimeter(0.18);
        commentsRow.Cells[0].VerticalAlignment = VerticalAlignment.Top;
        var commentsText = commentsRow.Cells[0].AddParagraph(order.Observaciones ?? string.Empty);
        commentsText.Format.LeftIndent = Unit.FromCentimeter(0.1);

        var renderer = new PdfDocumentRenderer { Document = document };
        renderer.RenderDocument();
        using var stream = new MemoryStream();
        renderer.PdfDocument.Save(stream, false);
        return stream.ToArray();
    }

    private void AddSectionTitle(Section section, string text, Unit? spaceBefore = null)
    {
        var titleTable = section.AddTable();
        titleTable.Format.SpaceBefore = spaceBefore ?? Unit.Zero;
        titleTable.AddColumn(Unit.FromCentimeter(18.6));
        var titleRow = titleTable.AddRow();
        titleRow.HeightRule = RowHeightRule.Exactly;
        titleRow.Height = Unit.FromCentimeter(0.64);
        titleRow.Shading.Color = Color.Parse(_primaryColor);
        titleRow.TopPadding = Unit.Zero;
        titleRow.BottomPadding = Unit.Zero;
        titleRow.Cells[0].VerticalAlignment = VerticalAlignment.Center;
        var paragraph = titleRow.Cells[0].AddParagraph(text);
        paragraph.Format.LeftIndent = Unit.FromCentimeter(0.08);
        paragraph.Format.SpaceBefore = Unit.Zero;
        paragraph.Format.SpaceAfter = Unit.Zero;
        paragraph.Format.Font.Bold = true;
        paragraph.Format.Font.Color = Colors.White;
        paragraph.Format.Font.Size = 7.5;
    }

    private static void AddLabeledText(Cell cell, string label, string value, ParagraphAlignment alignment = ParagraphAlignment.Left)
    {
        var paragraph = cell.AddParagraph();
        paragraph.Format.Alignment = alignment;
        paragraph.AddFormattedText($"{label}: ", TextFormat.Bold);
        paragraph.AddText(value);
    }

    private static void AddProviderDetails(Cell cell, PurchaseOrderExportModel order, bool primary)
    {
        if (primary)
        {
            AddLabeledText(cell, "Empresa", order.Proveedor);
            AddLabeledText(cell, "RUT", order.ProveedorRut ?? "No informado");
            AddLabeledText(cell, "Dirección", BuildLocation(order));
            AddLabeledText(cell, "Contacto", order.ProveedorContacto ?? "No informado");
        }
        else
        {
            AddLabeledText(cell, "Teléfono", order.ProveedorTelefono ?? "No informado");
            AddLabeledText(cell, "Correo", order.ProveedorCorreo ?? "No informado");
            AddLabeledText(cell, "Recepción", order.FechaRecepcion?.ToString("dd-MM-yyyy HH:mm") ?? "Pendiente");
            AddLabeledText(cell, "Solicitada por", order.Usuario);
        }
    }

    private static string BuildLocation(PurchaseOrderExportModel order)
    {
        var parts = new[] { order.ProveedorDireccion, order.ProveedorComuna, order.ProveedorCiudad }
            .Where(value => !string.IsNullOrWhiteSpace(value));
        var location = string.Join(", ", parts);
        return string.IsNullOrWhiteSpace(location) ? "No informada" : location;
    }

    private static void AddCenteredText(Cell cell, string value)
    {
        var paragraph = cell.AddParagraph(value);
        paragraph.Format.Alignment = ParagraphAlignment.Center;
    }

    private void AddTotalRow(Table table, string label, string value, bool highlight)
    {
        var row = table.AddRow();
        row.Cells[0].Borders.Visible = false;
        row.Cells[1].Shading.Color = highlight ? Color.Parse(_primaryColor) : Color.Parse("#F1F5F9");
        row.Cells[2].Shading.Color = highlight ? Color.Parse(_primaryColor) : Color.Parse("#F1F5F9");
        var labelParagraph = row.Cells[1].AddParagraph(label);
        labelParagraph.Format.Alignment = ParagraphAlignment.Right;
        labelParagraph.Format.Font.Bold = true;
        var valueParagraph = row.Cells[2].AddParagraph(value);
        valueParagraph.Format.Alignment = ParagraphAlignment.Right;
        valueParagraph.Format.Font.Bold = true;
        if (highlight)
        {
            labelParagraph.Format.Font.Color = Colors.White;
            valueParagraph.Format.Font.Color = Colors.White;
        }
    }

    private void AddExcelMetadata(IXLWorksheet sheet, int row, string label, object? value)
    {
        sheet.Cell(row, 1).Value = label;
        sheet.Cell(row, 1).Style.Font.SetBold().Font.SetFontColor(XLColor.FromHtml(_primaryColor));
        switch (value)
        {
            case DateTime date:
                sheet.Cell(row, 2).Value = date;
                sheet.Cell(row, 2).Style.DateFormat.Format = "dd-mm-yyyy hh:mm";
                break;
            case null:
                sheet.Cell(row, 2).Value = string.Empty;
                break;
            default:
                sheet.Cell(row, 2).Value = value.ToString();
                break;
        }
        sheet.Range(row, 2, row, 7).Merge();
    }

    private static void AddPdfMetadata(Section section, string label, string? value)
    {
        var paragraph = section.AddParagraph();
        paragraph.AddFormattedText($"{label}: ", TextFormat.Bold);
        paragraph.AddText(value ?? string.Empty);
    }

    private static string FormatCurrency(int value) => $"${value.ToString("N0", CultureInfo.GetCultureInfo("es-CL"))}";
    private static string FormatQuantity(decimal value) => value.ToString("0.###", CultureInfo.GetCultureInfo("es-CL"));

    public void Dispose()
    {
        if (_logoPath != null && File.Exists(_logoPath)) File.Delete(_logoPath);
        GC.SuppressFinalize(this);
    }
}
