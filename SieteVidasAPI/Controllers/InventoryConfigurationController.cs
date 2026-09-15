using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/inventory-configuration")]
    public class InventoryConfigurationController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public InventoryConfigurationController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet("catalogs")]
        [Permission(Permissions.InventoryCatalogsView + "|" + Permissions.UnitsView + "|" + Permissions.MaterialCategoriesView + "|" + Permissions.BrandsView + "|" + Permissions.RawMaterialsView + "|" + Permissions.PresentationsView)]
        public async Task<IActionResult> GetCatalogs()
        {
            return Ok(new
            {
                Unidades = await _context.InvUnidadesMedida.AsNoTracking().OrderBy(x => x.NombreUnidadMedida).ToListAsync(),
                Categorias = await _context.InvCategoriasMateria.AsNoTracking().OrderBy(x => x.NombreCategoriaMateria).ToListAsync(),
                Marcas = await _context.InvMarcas.AsNoTracking().OrderBy(x => x.NombreMarca).ToListAsync()
            });
        }

        [HttpGet("units")]
        [Permission(Permissions.UnitsView + "|" + Permissions.RawMaterialsView + "|" + Permissions.PresentationsView + "|" + Permissions.RecipesView + "|" + Permissions.RecipesEdit + "|" + Permissions.StockEntry)]
        public async Task<IActionResult> GetUnits() => Ok(await _context.InvUnidadesMedida
            .AsNoTracking().OrderBy(x => x.NombreUnidadMedida).ToListAsync());

        [HttpGet("material-categories")]
        [Permission(Permissions.MaterialCategoriesView + "|" + Permissions.RawMaterialsView)]
        public async Task<IActionResult> GetMaterialCategories() => Ok(await _context.InvCategoriasMateria
            .AsNoTracking().OrderBy(x => x.NombreCategoriaMateria).ToListAsync());

        [HttpGet("brands")]
        [Permission(Permissions.BrandsView + "|" + Permissions.RawMaterialsView)]
        public async Task<IActionResult> GetBrands() => Ok(await _context.InvMarcas
            .AsNoTracking().OrderBy(x => x.NombreMarca).ToListAsync());

        [HttpPost("units")]
        [Permission(Permissions.UnitsCreate)]
        public async Task<IActionResult> CreateUnit([FromBody] MeasurementUnitDto dto)
        {
            var validation = ValidateUnit(dto);
            if (validation != null) return BadRequest(new { mensaje = validation });
            var name = dto.Nombre.Trim();
            var abbreviation = dto.Abreviacion.Trim();
            if (await _context.InvUnidadesMedida.AnyAsync(x => x.NombreUnidadMedida.ToLower() == name.ToLower()))
                return Conflict(new { mensaje = "La unidad de medida ya existe." });
            if (await _context.InvUnidadesMedida.AnyAsync(x => x.Abreviacion.ToLower() == abbreviation.ToLower()))
                return Conflict(new { mensaje = "La abreviación ya está siendo utilizada." });
            if (dto.EsUnidadBase && await _context.InvUnidadesMedida.AnyAsync(x => x.TipoMagnitud == dto.TipoMagnitud && x.EsUnidadBase))
                return Conflict(new { mensaje = "Ya existe una unidad base para esta magnitud." });

            var entity = new InvUnidadesMedida
            {
                NombreUnidadMedida = name,
                Abreviacion = abbreviation,
                TipoMagnitud = dto.TipoMagnitud,
                FactorConversionBase = dto.FactorConversionBase,
                EsUnidadBase = dto.EsUnidadBase
            };
            _context.InvUnidadesMedida.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(entity);
        }

        [HttpPut("units/{id:int}")]
        [Permission(Permissions.UnitsEdit)]
        public async Task<IActionResult> UpdateUnit(int id, [FromBody] MeasurementUnitDto dto)
        {
            var entity = await _context.InvUnidadesMedida.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Unidad de medida no encontrada." });
            var validation = ValidateUnit(dto);
            if (validation != null) return BadRequest(new { mensaje = validation });
            var name = dto.Nombre.Trim();
            var abbreviation = dto.Abreviacion.Trim();
            if (await _context.InvUnidadesMedida.AnyAsync(x => x.IdUnidadMedida != id && x.NombreUnidadMedida.ToLower() == name.ToLower()))
                return Conflict(new { mensaje = "La unidad de medida ya existe." });
            if (await _context.InvUnidadesMedida.AnyAsync(x => x.IdUnidadMedida != id && x.Abreviacion.ToLower() == abbreviation.ToLower()))
                return Conflict(new { mensaje = "La abreviación ya está siendo utilizada." });
            if (dto.EsUnidadBase && await _context.InvUnidadesMedida.AnyAsync(x => x.IdUnidadMedida != id && x.TipoMagnitud == dto.TipoMagnitud && x.EsUnidadBase))
                return Conflict(new { mensaje = "Ya existe una unidad base para esta magnitud." });

            var conversionChanged = entity.TipoMagnitud != dto.TipoMagnitud || entity.FactorConversionBase != dto.FactorConversionBase;
            if (conversionChanged && (await _context.InvMateriaPrima.AnyAsync(x => x.IdUnidadMedida == id)
                || await _context.InvMaterialesReceta.AnyAsync(x => x.IdUnidadMedida == id)
                || await _context.InvPresentacionesMateriaPrima.AnyAsync(x => x.IdUnidadMedida == id)))
                return Conflict(new { mensaje = "No se puede cambiar la magnitud ni el factor porque la unidad ya está en uso." });

            entity.NombreUnidadMedida = name;
            entity.Abreviacion = abbreviation;
            entity.TipoMagnitud = dto.TipoMagnitud;
            entity.FactorConversionBase = dto.FactorConversionBase;
            entity.EsUnidadBase = dto.EsUnidadBase;
            await _context.SaveChangesAsync();
            return Ok(entity);
        }

        [HttpDelete("units/{id:int}")]
        [Permission(Permissions.UnitsDelete)]
        public async Task<IActionResult> DeleteUnit(int id) => await DeleteCatalog(
            await _context.InvUnidadesMedida.FindAsync(id), "Unidad de medida");

        private static string? ValidateUnit(MeasurementUnitDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombre)) return "El nombre es obligatorio.";
            if (string.IsNullOrWhiteSpace(dto.Abreviacion)) return "La abreviación es obligatoria.";
            if (dto.Nombre.Trim().Length > 50) return "El nombre no puede superar los 50 caracteres.";
            if (dto.Abreviacion.Trim().Length > 15) return "La abreviación no puede superar los 15 caracteres.";
            if (dto.TipoMagnitud is not ("Masa" or "Volumen" or "Unidad")) return "La magnitud debe ser Masa, Volumen o Unidad.";
            if (dto.FactorConversionBase <= 0) return "El factor de conversión debe ser mayor que cero.";
            if (dto.EsUnidadBase && dto.FactorConversionBase != 1) return "Una unidad base debe tener factor de conversión 1.";
            return null;
        }

        [HttpPost("material-categories")]
        [Permission(Permissions.MaterialCategoriesCreate)]
        public async Task<IActionResult> CreateMaterialCategory([FromBody] NamedCatalogDto dto)
        {
            var name = (dto.Nombre ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { mensaje = "El nombre es obligatorio." });
            if (await _context.InvCategoriasMateria.AnyAsync(x => x.NombreCategoriaMateria.ToLower() == name.ToLower()))
                return Conflict(new { mensaje = "La categoría ya existe." });
            var entity = new InvCategoriasMateria { NombreCategoriaMateria = name };
            _context.InvCategoriasMateria.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(entity);
        }

        [HttpPut("material-categories/{id:int}")]
        [Permission(Permissions.MaterialCategoriesEdit)]
        public async Task<IActionResult> UpdateMaterialCategory(int id, [FromBody] NamedCatalogDto dto)
        {
            var entity = await _context.InvCategoriasMateria.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Categoría no encontrada." });
            var name = (dto.Nombre ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { mensaje = "El nombre es obligatorio." });
            if (await _context.InvCategoriasMateria.AnyAsync(x => x.IdCategoriaMateria != id && x.NombreCategoriaMateria.ToLower() == name.ToLower()))
                return Conflict(new { mensaje = "La categoría ya existe." });
            entity.NombreCategoriaMateria = name;
            await _context.SaveChangesAsync();
            return Ok(entity);
        }

        [HttpDelete("material-categories/{id:int}")]
        [Permission(Permissions.MaterialCategoriesDelete)]
        public async Task<IActionResult> DeleteMaterialCategory(int id) => await DeleteCatalog(
            await _context.InvCategoriasMateria.FindAsync(id), "Categoría");

        [HttpPost("brands")]
        [Permission(Permissions.BrandsCreate)]
        public async Task<IActionResult> CreateBrand([FromBody] NamedCatalogDto dto)
        {
            var name = (dto.Nombre ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { mensaje = "El nombre es obligatorio." });
            if (await _context.InvMarcas.AnyAsync(x => x.NombreMarca.ToLower() == name.ToLower()))
                return Conflict(new { mensaje = "La marca ya existe." });
            var entity = new InvMarcas { NombreMarca = name };
            _context.InvMarcas.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(entity);
        }

        [HttpPut("brands/{id:int}")]
        [Permission(Permissions.BrandsEdit)]
        public async Task<IActionResult> UpdateBrand(int id, [FromBody] NamedCatalogDto dto)
        {
            var entity = await _context.InvMarcas.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Marca no encontrada." });
            var name = (dto.Nombre ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { mensaje = "El nombre es obligatorio." });
            if (await _context.InvMarcas.AnyAsync(x => x.IdMarca != id && x.NombreMarca.ToLower() == name.ToLower()))
                return Conflict(new { mensaje = "La marca ya existe." });
            entity.NombreMarca = name;
            await _context.SaveChangesAsync();
            return Ok(entity);
        }

        [HttpDelete("brands/{id:int}")]
        [Permission(Permissions.BrandsDelete)]
        public async Task<IActionResult> DeleteBrand(int id) => await DeleteCatalog(
            await _context.InvMarcas.FindAsync(id), "Marca");

        [HttpGet("courtesy-products")]
        [Permission(Permissions.CourtesyView)]
        public async Task<IActionResult> GetCourtesyProducts()
        {
            return Ok(await _context.InvProductosCortesia.AsNoTracking()
                .OrderBy(x => x.IdProductoNavigation.NombreProducto)
                .Select(x => new
                {
                    x.IdProductoCortesia,
                    x.IdProducto,
                    x.IdProductoNavigation.NombreProducto,
                    x.CantidadDiaria,
                    Activo = x.Activo == 1,
                    x.FechaCreacion,
                    x.FechaModificacion
                }).ToListAsync());
        }

        [HttpGet("courtesy-policy")]
        [Permission(Permissions.CourtesyView)]
        public async Task<IActionResult> GetCourtesyPolicy()
        {
            var policy = await _context.InvConfiguracionCortesia.AsNoTracking()
                .FirstOrDefaultAsync(x => x.IdConfiguracion == 1);
            return Ok(new { limiteDiarioGlobal = policy?.LimiteDiarioGlobal ?? 2 });
        }

        [HttpPut("courtesy-policy")]
        [Permission(Permissions.CourtesyPolicyEdit)]
        public async Task<IActionResult> UpdateCourtesyPolicy([FromBody] CourtesyPolicyDto dto)
        {
            if (dto.LimiteDiarioGlobal <= 0)
                return BadRequest(new { mensaje = "El límite diario global debe ser mayor que cero." });

            var policy = await _context.InvConfiguracionCortesia.FindAsync(1);
            if (policy == null)
            {
                policy = new InvConfiguracionCortesia { IdConfiguracion = 1 };
                _context.InvConfiguracionCortesia.Add(policy);
            }
            policy.LimiteDiarioGlobal = dto.LimiteDiarioGlobal;
            policy.FechaModificacion = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(new { mensaje = "Límite diario global actualizado.", policy.LimiteDiarioGlobal });
        }

        [HttpPost("courtesy-products")]
        [Permission(Permissions.CourtesyCreate)]
        public async Task<IActionResult> CreateCourtesyProduct([FromBody] CourtesyProductDto dto)
        {
            if (dto.CantidadDiaria <= 0) return BadRequest(new { mensaje = "La cantidad diaria debe ser mayor que cero." });
            if (!await _context.InvProductos.AnyAsync(x => x.IdProducto == dto.IdProducto && x.Activo))
                return BadRequest(new { mensaje = "El producto no es válido o está inactivo." });
            if (await _context.InvProductosCortesia.AnyAsync(x => x.IdProducto == dto.IdProducto))
                return Conflict(new { mensaje = "El producto ya está configurado como cortesía." });

            var now = DateTime.Now;
            var entity = new InvProductosCortesia
            {
                IdProducto = dto.IdProducto,
                CantidadDiaria = dto.CantidadDiaria,
                Activo = 1,
                FechaCreacion = now,
                FechaModificacion = now
            };
            _context.InvProductosCortesia.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdProductoCortesia });
        }

        [HttpPut("courtesy-products/{id:int}")]
        [Permission(Permissions.CourtesyEdit)]
        public async Task<IActionResult> UpdateCourtesyProduct(int id, [FromBody] CourtesyProductDto dto)
        {
            var entity = await _context.InvProductosCortesia.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Producto de cortesía no encontrado." });
            if (dto.CantidadDiaria <= 0) return BadRequest(new { mensaje = "La cantidad diaria debe ser mayor que cero." });
            if (!await _context.InvProductos.AnyAsync(x => x.IdProducto == dto.IdProducto && x.Activo))
                return BadRequest(new { mensaje = "El producto no es válido o está inactivo." });
            if (await _context.InvProductosCortesia.AnyAsync(x => x.IdProductoCortesia != id && x.IdProducto == dto.IdProducto))
                return Conflict(new { mensaje = "El producto ya está configurado como cortesía." });

            entity.IdProducto = dto.IdProducto;
            entity.CantidadDiaria = dto.CantidadDiaria;
            entity.FechaModificacion = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdProductoCortesia });
        }

        [HttpPut("courtesy-products/{id:int}/status")]
        [Permission(Permissions.CourtesyStatusEdit)]
        public async Task<IActionResult> ToggleCourtesyProduct(int id)
        {
            var entity = await _context.InvProductosCortesia.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Producto de cortesía no encontrado." });
            entity.Activo = entity.Activo == 1 ? 0 : 1;
            entity.FechaModificacion = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(new { activo = entity.Activo == 1 });
        }

        [HttpGet("raw-materials")]
        [Permission(Permissions.RawMaterialsView + "|" + Permissions.PresentationsView + "|" + Permissions.RecipesView + "|" + Permissions.RecipesEdit + "|" + Permissions.StockEntry)]
        public async Task<IActionResult> GetRawMaterials()
        {
            return Ok(await _context.InvMateriaPrima.AsNoTracking()
                .OrderBy(x => x.NombreMaterial)
                .Select(x => new
                {
                    x.IdMateriaPrima,
                    x.IdMarca,
                    x.IdCategoriaMateria,
                    x.IdUnidadMedida,
                    x.NombreMaterial,
                    x.Descripcion,
                    x.Cantidad,
                    x.EsCafeCalibrable,
                    x.NoDescuentaInventario,
                    x.RecargoBase,
                    x.RecargoModificable,
                    NombreMarca = x.IdMarcaNavigation.NombreMarca,
                    NombreCategoria = x.IdCategoriaMateriaNavigation.NombreCategoriaMateria,
                    NombreUnidad = x.IdUnidadMedidaNavigation.NombreUnidadMedida,
                    AbreviacionUnidad = x.IdUnidadMedidaNavigation.Abreviacion,
                    TipoMagnitud = x.IdUnidadMedidaNavigation.TipoMagnitud,
                    ImagenBase64 = x.Imagen == null ? null : Convert.ToBase64String(x.Imagen),
                    x.FechaCreacion
                }).ToListAsync());
        }

        [HttpPost("raw-materials")]
        [Permission(Permissions.RawMaterialsCreate)]
        public async Task<IActionResult> CreateRawMaterial([FromBody] RawMaterialDto dto)
        {
            var validation = await ValidateRawMaterial(dto);
            if (validation != null) return BadRequest(new { mensaje = validation });
            if (await _context.InvMateriaPrima.AnyAsync(x => x.NombreMaterial.ToLower() == dto.NombreMaterial.Trim().ToLower()))
                return Conflict(new { mensaje = "La materia prima ya existe." });

            var entity = new InvMateriaPrima
            {
                IdMarca = dto.IdMarca,
                IdCategoriaMateria = dto.IdCategoriaMateria,
                IdUnidadMedida = dto.IdUnidadMedida,
                NombreMaterial = dto.NombreMaterial.Trim(),
                Descripcion = string.IsNullOrWhiteSpace(dto.Descripcion) ? null : dto.Descripcion.Trim(),
                // Las materias que no se descuentan no llevan existencia: se guarda 0.
                Cantidad = dto.NoDescuentaInventario ? 0 : dto.Cantidad,
                EsCafeCalibrable = dto.EsCafeCalibrable,
                NoDescuentaInventario = dto.NoDescuentaInventario,
                RecargoBase = dto.RecargoBase < 0 ? 0 : dto.RecargoBase,
                RecargoModificable = dto.RecargoBase > 0 && dto.RecargoModificable,
                Imagen = ParseImage(dto.ImagenBase64),
                FechaCreacion = DateTime.Now
            };
            _context.InvMateriaPrima.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdMateriaPrima });
        }

        [HttpPut("raw-materials/{id:int}")]
        [Permission(Permissions.RawMaterialsEdit)]
        public async Task<IActionResult> UpdateRawMaterial(int id, [FromBody] RawMaterialDto dto)
        {
            var entity = await _context.InvMateriaPrima.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Materia prima no encontrada." });
            var validation = await ValidateRawMaterial(dto, id);
            if (validation != null) return BadRequest(new { mensaje = validation });
            if (await _context.InvMateriaPrima.AnyAsync(x => x.IdMateriaPrima != id && x.NombreMaterial.ToLower() == dto.NombreMaterial.Trim().ToLower()))
                return Conflict(new { mensaje = "La materia prima ya existe." });
            if (entity.IdUnidadMedida != dto.IdUnidadMedida
                && (await _context.TurProductosBitacoraMateriales.AnyAsync(x => x.IdMateriaPrima == id)
                    || await _context.VenDetalleVentaMateriales.AnyAsync(x => x.IdMateriaPrima == id)))
                return Conflict(new { mensaje = "No se puede cambiar la unidad de inventario porque ya existen descuentos históricos para esta materia prima." });

            // Las materias que no se descuentan no llevan existencia: se guarda 0 y no hay
            // conversión de stock al cambiar de unidad.
            var quantityToStore = dto.NoDescuentaInventario ? 0 : dto.Cantidad;
            if (!dto.NoDescuentaInventario && entity.IdUnidadMedida != dto.IdUnidadMedida)
            {
                var oldUnit = await _context.InvUnidadesMedida.FindAsync(entity.IdUnidadMedida);
                var newUnit = await _context.InvUnidadesMedida.FindAsync(dto.IdUnidadMedida);
                quantityToStore = ConvertQuantity(entity.Cantidad, oldUnit!, newUnit!);
                if (newUnit!.TipoMagnitud == "Unidad" && decimal.Truncate(quantityToStore) != quantityToStore)
                    return Conflict(new { mensaje = "El cambio de unidad produciría una existencia fraccionaria de elementos discretos." });
            }

            entity.IdMarca = dto.IdMarca;
            entity.IdCategoriaMateria = dto.IdCategoriaMateria;
            entity.IdUnidadMedida = dto.IdUnidadMedida;
            entity.NombreMaterial = dto.NombreMaterial.Trim();
            entity.Descripcion = string.IsNullOrWhiteSpace(dto.Descripcion) ? null : dto.Descripcion.Trim();
            entity.Cantidad = quantityToStore;
            entity.EsCafeCalibrable = dto.EsCafeCalibrable;
            entity.NoDescuentaInventario = dto.NoDescuentaInventario;
            entity.RecargoBase = dto.RecargoBase < 0 ? 0 : dto.RecargoBase;
            entity.RecargoModificable = dto.RecargoBase > 0 && dto.RecargoModificable;
            if (dto.ImagenBase64 == string.Empty) entity.Imagen = null;
            else if (dto.ImagenBase64 != null) entity.Imagen = ParseImage(dto.ImagenBase64);
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdMateriaPrima });
        }

        [HttpDelete("raw-materials/{id:int}")]
        [Permission(Permissions.RawMaterialsDelete)]
        public async Task<IActionResult> DeleteRawMaterial(int id) => await DeleteCatalog(
            await _context.InvMateriaPrima.FindAsync(id), "Materia prima");

        [HttpGet("raw-material-presentations")]
        [Permission(Permissions.PresentationsView + "|" + Permissions.StockEntry)]
        public async Task<IActionResult> GetRawMaterialPresentations([FromQuery] int? idMateriaPrima = null)
        {
            var query = _context.InvPresentacionesMateriaPrima.AsNoTracking().AsQueryable();
            if (idMateriaPrima.HasValue) query = query.Where(x => x.IdMateriaPrima == idMateriaPrima.Value);
            return Ok(await query.OrderBy(x => x.IdMateriaPrimaNavigation.NombreMaterial)
                .ThenBy(x => x.NombrePresentacion)
                .Select(x => new
                {
                    x.IdPresentacionMateriaPrima,
                    x.IdMateriaPrima,
                    x.IdUnidadMedida,
                    x.NombrePresentacion,
                    x.CantidadContenido,
                    x.Activo,
                    NombreMaterial = x.IdMateriaPrimaNavigation.NombreMaterial,
                    NombreUnidad = x.IdUnidadMedidaNavigation.NombreUnidadMedida,
                    AbreviacionUnidad = x.IdUnidadMedidaNavigation.Abreviacion
                }).ToListAsync());
        }

        [HttpPost("raw-material-presentations")]
        [Permission(Permissions.PresentationsCreate)]
        public async Task<IActionResult> CreateRawMaterialPresentation([FromBody] RawMaterialPresentationDto dto)
        {
            var validation = await ValidatePresentation(dto);
            if (validation != null) return BadRequest(new { mensaje = validation });
            var entity = new InvPresentacionesMateriaPrima
            {
                IdMateriaPrima = dto.IdMateriaPrima,
                IdUnidadMedida = dto.IdUnidadMedida,
                NombrePresentacion = dto.NombrePresentacion.Trim(),
                CantidadContenido = dto.CantidadContenido,
                Activo = dto.Activo,
                FechaCreacion = DateTime.Now
            };
            _context.InvPresentacionesMateriaPrima.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdPresentacionMateriaPrima });
        }

        [HttpPut("raw-material-presentations/{id:int}")]
        [Permission(Permissions.PresentationsEdit)]
        public async Task<IActionResult> UpdateRawMaterialPresentation(int id, [FromBody] RawMaterialPresentationDto dto)
        {
            var entity = await _context.InvPresentacionesMateriaPrima.FindAsync(id);
            if (entity == null) return NotFound(new { mensaje = "Presentación no encontrada." });
            var validation = await ValidatePresentation(dto, id);
            if (validation != null) return BadRequest(new { mensaje = validation });
            entity.IdMateriaPrima = dto.IdMateriaPrima;
            entity.IdUnidadMedida = dto.IdUnidadMedida;
            entity.NombrePresentacion = dto.NombrePresentacion.Trim();
            entity.CantidadContenido = dto.CantidadContenido;
            entity.Activo = dto.Activo;
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdPresentacionMateriaPrima });
        }

        [HttpDelete("raw-material-presentations/{id:int}")]
        [Permission(Permissions.PresentationsDelete)]
        public async Task<IActionResult> DeleteRawMaterialPresentation(int id) => await DeleteCatalog(
            await _context.InvPresentacionesMateriaPrima.FindAsync(id), "Presentación");

        [HttpPost("raw-material-presentations/{id:int}/stock-entry")]
        [Permission(Permissions.StockEntry)]
        public async Task<IActionResult> AddStockFromPresentation(int id, [FromBody] RawMaterialStockEntryDto dto)
        {
            if (dto.CantidadPresentaciones <= 0)
                return BadRequest(new { mensaje = "La cantidad de presentaciones debe ser mayor que cero." });

            var presentation = await _context.InvPresentacionesMateriaPrima
                .Include(x => x.IdUnidadMedidaNavigation)
                .Include(x => x.IdMateriaPrimaNavigation).ThenInclude(x => x.IdUnidadMedidaNavigation)
                .FirstOrDefaultAsync(x => x.IdPresentacionMateriaPrima == id && x.Activo);
            if (presentation == null) return NotFound(new { mensaje = "Presentación activa no encontrada." });

            var material = presentation.IdMateriaPrimaNavigation;
            if (material.NoDescuentaInventario)
                return BadRequest(new { mensaje = "Esta materia prima no se descuenta del inventario, por lo que no lleva existencias." });
            var added = ConvertQuantity(
                presentation.CantidadContenido * dto.CantidadPresentaciones,
                presentation.IdUnidadMedidaNavigation,
                material.IdUnidadMedidaNavigation);
            if (material.IdUnidadMedidaNavigation.TipoMagnitud == "Unidad" && decimal.Truncate(added) != added)
                return Conflict(new { mensaje = "El ingreso produciría una cantidad fraccionaria de unidades." });

            material.Cantidad += added;
            await _context.SaveChangesAsync();
            return Ok(new
            {
                mensaje = "Existencia agregada correctamente.",
                CantidadAgregada = added,
                CantidadActual = material.Cantidad,
                Unidad = material.IdUnidadMedidaNavigation.Abreviacion
            });
        }

        private async Task<string?> ValidateRawMaterial(RawMaterialDto dto, int? idMateriaPrima = null)
        {
            if (string.IsNullOrWhiteSpace(dto.NombreMaterial)) return "El nombre es obligatorio.";
            if (dto.NoDescuentaInventario && dto.EsCafeCalibrable)
                return "Una materia prima no puede ser café calibrable y a la vez no descontarse del inventario.";
            // Las materias que no se descuentan no llevan existencia: se omiten los chequeos de cantidad.
            if (!dto.NoDescuentaInventario && dto.Cantidad < 0) return "La cantidad no puede ser negativa.";
            if (!await _context.InvMarcas.AnyAsync(x => x.IdMarca == dto.IdMarca)) return "La marca no es válida.";
            if (!await _context.InvCategoriasMateria.AnyAsync(x => x.IdCategoriaMateria == dto.IdCategoriaMateria)) return "La categoría no es válida.";
            var unit = await _context.InvUnidadesMedida.FindAsync(dto.IdUnidadMedida);
            if (unit == null) return "La unidad de medida no es válida.";
            if (!dto.NoDescuentaInventario && unit.TipoMagnitud == "Unidad" && decimal.Truncate(dto.Cantidad) != dto.Cantidad)
                return "Las existencias medidas en unidades deben ser números enteros.";
            if (idMateriaPrima.HasValue)
            {
                var recipeUnitsAreCompatible = !await _context.InvMaterialesReceta
                    .AnyAsync(x => x.IdMateriaPrima == idMateriaPrima.Value
                        && x.IdUnidadMedidaNavigation.TipoMagnitud != unit.TipoMagnitud);
                var presentationUnitsAreCompatible = !await _context.InvPresentacionesMateriaPrima
                    .AnyAsync(x => x.IdMateriaPrima == idMateriaPrima.Value
                        && x.IdUnidadMedidaNavigation.TipoMagnitud != unit.TipoMagnitud);
                if (!recipeUnitsAreCompatible || !presentationUnitsAreCompatible)
                    return "La nueva unidad no es compatible con las recetas o presentaciones existentes de esta materia prima.";
            }
            if (dto.EsCafeCalibrable && await _context.InvMateriaPrima
                .AnyAsync(x => x.EsCafeCalibrable && (!idMateriaPrima.HasValue || x.IdMateriaPrima != idMateriaPrima.Value)))
                return "Ya existe otra materia prima marcada como café calibrable. Solo puede haber una.";
            try { ParseImage(dto.ImagenBase64); }
            catch (FormatException) { return "La imagen no tiene un formato válido."; }
            return null;
        }

        private async Task<string?> ValidatePresentation(RawMaterialPresentationDto dto, int? id = null)
        {
            if (string.IsNullOrWhiteSpace(dto.NombrePresentacion)) return "El nombre de la presentación es obligatorio.";
            if (dto.NombrePresentacion.Trim().Length > 100) return "El nombre no puede superar los 100 caracteres.";
            if (dto.CantidadContenido <= 0) return "El contenido debe ser mayor que cero.";
            var material = await _context.InvMateriaPrima.Include(x => x.IdUnidadMedidaNavigation)
                .FirstOrDefaultAsync(x => x.IdMateriaPrima == dto.IdMateriaPrima);
            var unit = await _context.InvUnidadesMedida.FindAsync(dto.IdUnidadMedida);
            if (material == null) return "La materia prima no es válida.";
            if (material.NoDescuentaInventario) return "Esta materia prima no se descuenta del inventario, por lo que no admite presentaciones ni ingreso de stock.";
            if (unit == null) return "La unidad de medida no es válida.";
            if (unit.TipoMagnitud != material.IdUnidadMedidaNavigation.TipoMagnitud)
                return "La unidad de la presentación no es compatible con la unidad de inventario de la materia prima.";
            if (unit.TipoMagnitud == "Unidad" && decimal.Truncate(dto.CantidadContenido) != dto.CantidadContenido)
                return "Una presentación de elementos discretos debe contener una cantidad entera.";
            if (await _context.InvPresentacionesMateriaPrima.AnyAsync(x => x.IdPresentacionMateriaPrima != id
                && x.IdMateriaPrima == dto.IdMateriaPrima
                && x.NombrePresentacion.ToLower() == dto.NombrePresentacion.Trim().ToLower()))
                return "Ya existe una presentación con ese nombre para la materia prima.";
            return null;
        }

        private static decimal ConvertQuantity(decimal quantity, InvUnidadesMedida from, InvUnidadesMedida to)
        {
            if (from.TipoMagnitud != to.TipoMagnitud)
                throw new InvalidOperationException("Las unidades no pertenecen a la misma magnitud.");
            return decimal.Round(quantity * from.FactorConversionBase / to.FactorConversionBase, 3, MidpointRounding.AwayFromZero);
        }

        private static byte[]? ParseImage(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var base64 = value.Contains(',') ? value[(value.IndexOf(',') + 1)..] : value;
            return Convert.FromBase64String(base64);
        }

        private async Task<IActionResult> DeleteCatalog(object? entity, string label)
        {
            if (entity == null) return NotFound(new { mensaje = $"{label} no encontrada." });
            _context.Remove(entity);
            try
            {
                await _context.SaveChangesAsync();
                return NoContent();
            }
            catch (DbUpdateException)
            {
                return Conflict(new { mensaje = $"No se puede eliminar {label.ToLower()} porque está en uso." });
            }
        }
    }
}
