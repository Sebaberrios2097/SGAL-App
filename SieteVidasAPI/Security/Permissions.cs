namespace SieteVidasAPI.Security;

public static class Permissions
{
    public const string DashboardView = "inicio.dashboard.ver";
    public const string TurnRecordsView = "registros_turnos.ver";
    public const string TurnRecordsDashboardView = "registros_turnos.dashboard.ver";
    public const string TurnRecordsLogbookView = "registros_turnos.bitacora.ver";
    public const string TurnRecordsSalesView = "registros_turnos.ventas.ver";

    public const string UsersView = "usuarios.ver";
    public const string EmployeesCreate = "usuarios.empleado.crear";
    public const string EmployeesEdit = "usuarios.empleado.editar";
    public const string AccountsCreate = "usuarios.cuenta.crear";
    public const string AccountsEdit = "usuarios.cuenta.editar";
    public const string UsersStatusEdit = "usuarios.estado.modificar";
    public const string UsersRolesAssign = "usuarios.roles.asignar";
    public const string UsersPasswordReset = "usuarios.password.restablecer";

    public const string RolesView = "roles.ver";
    public const string RolesCreate = "roles.crear";
    public const string RolesEdit = "roles.editar";
    public const string RolesDelete = "roles.eliminar";
    public const string RolesPermissionsAssign = "roles.permisos.asignar";

    public const string ProductsView = "inventario.productos.ver";
    public const string ProductsCreate = "inventario.productos.crear";
    public const string ProductsEdit = "inventario.productos.editar";
    public const string ProductsStatusEdit = "inventario.productos.estado.modificar";
    public const string CategoriesView = "inventario.categorias.ver";
    public const string CategoriesCreate = "inventario.categorias.crear";
    public const string CategoriesEdit = "inventario.categorias.editar";
    public const string CategoriesStatusEdit = "inventario.categorias.estado.modificar";
    public const string DiscountsView = "inventario.descuentos.ver";
    public const string DiscountsCreate = "inventario.descuentos.crear";
    public const string DiscountsStatusEdit = "inventario.descuentos.estado.modificar";
    public const string DiscountsDelete = "inventario.descuentos.eliminar";

    public const string RecipesView = "recetas.ver";
    public const string RecipesEdit = "recetas.editar";

    public const string ExtraIngredientsView = "ingredientes_extra.ver";
    public const string ExtraIngredientsCreate = "ingredientes_extra.crear";
    public const string ExtraIngredientsEdit = "ingredientes_extra.editar";
    public const string ExtraIngredientsStatusEdit = "ingredientes_extra.estado.modificar";
    // Inventory catalogs have independent read permissions. InventoryCatalogsView is
    // retained only as a legacy grant while existing installations are migrated.
    public const string InventoryCatalogsView = "configuracion_inventario.catalogos.ver";
    public const string UnitsView = "configuracion_inventario.unidades.ver";
    public const string UnitsCreate = "configuracion_inventario.unidades.crear";
    public const string UnitsEdit = "configuracion_inventario.unidades.editar";
    public const string UnitsDelete = "configuracion_inventario.unidades.eliminar";
    public const string MaterialCategoriesView = "configuracion_inventario.categorias_materia.ver";
    public const string MaterialCategoriesCreate = "configuracion_inventario.categorias_materia.crear";
    public const string MaterialCategoriesEdit = "configuracion_inventario.categorias_materia.editar";
    public const string MaterialCategoriesDelete = "configuracion_inventario.categorias_materia.eliminar";
    public const string BrandsView = "configuracion_inventario.marcas.ver";
    public const string BrandsCreate = "configuracion_inventario.marcas.crear";
    public const string BrandsEdit = "configuracion_inventario.marcas.editar";
    public const string BrandsDelete = "configuracion_inventario.marcas.eliminar";
    public const string CourtesyView = "configuracion_inventario.cortesia.ver";
    public const string CourtesyPolicyEdit = "configuracion_inventario.cortesia.politica.editar";
    public const string CourtesyCreate = "configuracion_inventario.cortesia.crear";
    public const string CourtesyEdit = "configuracion_inventario.cortesia.editar";
    public const string CourtesyStatusEdit = "configuracion_inventario.cortesia.estado.modificar";
    public const string RawMaterialsView = "configuracion_inventario.materias_primas.ver";
    public const string RawMaterialsCreate = "configuracion_inventario.materias_primas.crear";
    public const string RawMaterialsEdit = "configuracion_inventario.materias_primas.editar";
    public const string RawMaterialsDelete = "configuracion_inventario.materias_primas.eliminar";
    public const string PresentationsView = "configuracion_inventario.presentaciones.ver";
    public const string PresentationsCreate = "configuracion_inventario.presentaciones.crear";
    public const string PresentationsEdit = "configuracion_inventario.presentaciones.editar";
    public const string PresentationsDelete = "configuracion_inventario.presentaciones.eliminar";
    public const string StockEntry = "configuracion_inventario.stock.ingresar";

    public const string ProvidersView = "proveedores.ver";
    public const string ProvidersCreate = "proveedores.crear";
    public const string ProvidersEdit = "proveedores.editar";
    public const string ProvidersStatusEdit = "proveedores.estado.modificar";

    public const string PurchaseOrdersView = "ordenes_compra.ver";
    public const string PurchaseOrdersCreate = "ordenes_compra.crear";
    public const string PurchaseOrdersEdit = "ordenes_compra.editar";
    public const string PurchaseOrdersIssue = "ordenes_compra.emitir";
    public const string PurchaseOrdersReceive = "ordenes_compra.recibir";
    public const string PurchaseOrdersConfirmPrices = "ordenes_compra.precios.confirmar";
    public const string PurchaseOrdersCancel = "ordenes_compra.cancelar";
    public const string PurchaseOrdersExport = "ordenes_compra.exportar";

    public const string OwnTurnsView = "turnos.propios.ver";
    public const string TurnsOperate = "turnos.operar";
    public const string TurnsOpen = "turnos.abrir";
    public const string TurnsClose = "turnos.cerrar";
    public const string SalesOperate = "ventas.operar";
    public const string SalesCreate = "ventas.crear";
    public const string SalesCreatePoint = "ventas.crear_point";
    public const string OwnSalesView = "ventas.propias.ver";
    public const string SalesDocumentsReprint = "ventas.documentos.reimprimir";
    public const string SalesVoid = "ventas.anular";
    public const string SalesDiscountApply = "ventas.descuento.aplicar";
    public const string SalesComandasManage = "ventas.comandas.gestionar";
    public const string OwnLogbookView = "bitacora.propia.ver";
    public const string LogbookConsumptionsCreate = "bitacora.consumos.crear";
    public const string LogbookConsumptionsVoid = "bitacora.consumos.anular";
    public const string LogbookObservationEdit = "bitacora.observacion.editar";
    public const string LogbookExtractionsCreate = "bitacora.extracciones.crear";
    public const string PointAdmin = "integraciones.point.administrar";
}
