namespace SieteVidasAPI.Security;

/// <summary>
/// Dependencies that make an action usable in the UI. Authorization still checks
/// the action itself; these rules only prevent saving internally inconsistent roles.
/// </summary>
public static class PermissionDependencies
{
    public static IEnumerable<string> RequiredBy(string code)
    {
        if (code.StartsWith("ordenes_compra.") && code != Permissions.PurchaseOrdersView)
            yield return Permissions.PurchaseOrdersView;
        if (code.StartsWith("proveedores.") && code != Permissions.ProvidersView)
            yield return Permissions.ProvidersView;
        if (code.StartsWith("inventario.productos.") && code != Permissions.ProductsView)
        {
            yield return Permissions.ProductsView;
            yield return Permissions.CategoriesView;
        }
        if (code.StartsWith("inventario.categorias.") && code != Permissions.CategoriesView)
            yield return Permissions.CategoriesView;
        if (code.StartsWith("inventario.descuentos.") && code != Permissions.DiscountsView)
        {
            yield return Permissions.DiscountsView;
            yield return Permissions.ProductsView;
        }
        if (code == Permissions.RecipesEdit)
        {
            yield return Permissions.RecipesView;
            yield return Permissions.RawMaterialsView;
            yield return Permissions.UnitsView;
        }
        if (code.StartsWith("ingredientes_extra.") && code != Permissions.ExtraIngredientsView)
            yield return Permissions.ExtraIngredientsView;
        if (code.StartsWith("usuarios.") && code != Permissions.UsersView)
            yield return Permissions.UsersView;
        if (code == Permissions.UsersRolesAssign)
            yield return Permissions.RolesView;
        if (code.StartsWith("roles.") && code != Permissions.RolesView)
            yield return Permissions.RolesView;
        if (code.StartsWith("turnos.") && code != Permissions.OwnTurnsView)
            yield return Permissions.OwnTurnsView;
        if (code.StartsWith("ventas.") && code != Permissions.SalesOperate)
            yield return Permissions.SalesOperate;
        if (code == Permissions.SalesDocumentsReprint)
            yield return Permissions.OwnSalesView;
        if (code.StartsWith("bitacora.") && code != Permissions.OwnLogbookView)
            yield return Permissions.OwnLogbookView;
        if (code.StartsWith("configuracion_inventario.unidades.") && code != Permissions.UnitsView)
            yield return Permissions.UnitsView;
        if (code.StartsWith("configuracion_inventario.categorias_materia.") && code != Permissions.MaterialCategoriesView)
            yield return Permissions.MaterialCategoriesView;
        if (code.StartsWith("configuracion_inventario.marcas.") && code != Permissions.BrandsView)
            yield return Permissions.BrandsView;
        if (code.StartsWith("configuracion_inventario.cortesia.") && code != Permissions.CourtesyView)
            yield return Permissions.CourtesyView;
        if (code is Permissions.CourtesyCreate or Permissions.CourtesyEdit)
            yield return Permissions.ProductsView;
        if (code.StartsWith("configuracion_inventario.materias_primas.") && code != Permissions.RawMaterialsView)
        {
            yield return Permissions.RawMaterialsView;
            yield return Permissions.UnitsView;
            yield return Permissions.MaterialCategoriesView;
            yield return Permissions.BrandsView;
        }
        if (code.StartsWith("configuracion_inventario.presentaciones.") && code != Permissions.PresentationsView)
        {
            yield return Permissions.PresentationsView;
            yield return Permissions.UnitsView;
        }
        if (code == Permissions.StockEntry)
        {
            yield return Permissions.PresentationsView;
            yield return Permissions.RawMaterialsView;
        }
    }

    public static HashSet<string> MissingFrom(IEnumerable<string> selectedCodes)
    {
        var selected = selectedCodes.ToHashSet(StringComparer.Ordinal);
        var missing = new HashSet<string>(StringComparer.Ordinal);
        foreach (var code in selected)
            CollectMissing(code, selected, missing, []);
        return missing;
    }

    private static void CollectMissing(string code, HashSet<string> selected, HashSet<string> missing, HashSet<string> visited)
    {
        if (!visited.Add(code)) return;
        foreach (var dependency in RequiredBy(code).Distinct())
        {
            if (!selected.Contains(dependency)) missing.Add(dependency);
            else CollectMissing(dependency, selected, missing, visited);
        }
    }
}
