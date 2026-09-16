namespace SgalApp.Api.DTOs;

public class PurchaseOrderSaveDto
{
    public int IdUsuario { get; set; }
    public int IdProveedor { get; set; }
    public DateTime FechaLlegadaPedido { get; set; }
    public string? Observaciones { get; set; }
    public List<PurchaseOrderItemDto> Items { get; set; } = new();
}

public class PurchaseOrderItemDto
{
    public string TipoItem { get; set; } = string.Empty;
    public int IdItem { get; set; }
    public decimal Cantidad { get; set; }
    public int PrecioUnitario { get; set; }
    public int? NuevoPrecioVenta { get; set; }
}

public class PurchaseOrderUserActionDto
{
    public int IdUsuario { get; set; }
}

public class PurchaseOrderReceiveDto
{
    public int IdUsuario { get; set; }
    public List<PurchaseOrderReceiveItemDto> Items { get; set; } = new();
}

public class PurchaseOrderReceiveItemDto
{
    public int IdOrdenDetalle { get; set; }
    public decimal CantidadRecibida { get; set; }
    public int PrecioUnitarioReal { get; set; }
    public int? NuevoPrecioVenta { get; set; }
    public string? ObservacionRecepcion { get; set; }
}

public class PurchaseOrderConfirmPricesDto
{
    public int IdUsuario { get; set; }
    public List<int> IdsOrdenDetalle { get; set; } = new();
}
