using Infraestructura.Context;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;

namespace SieteVidasAPI.Controllers
{
    /// <summary>
    /// Los ingredientes extra son materias primas marcadas con "Uso para ingrediente extra".
    /// Cada una define su recargo (precio), la cantidad que consume y la unidad de esa cantidad.
    /// </summary>
    [ApiController]
    [Route("api/extra-ingredient")]
    public class ExtraIngredientController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public ExtraIngredientController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.ExtraIngredientsView)]
        public async Task<IActionResult> GetAll()
        {
            var items = await _context.InvMateriaPrima
                .Where(m => m.UsoIngredienteExtra)
                .OrderBy(m => m.NombreMaterial)
                .Select(m => new
                {
                    m.IdMateriaPrima,
                    NombreMateriaPrima = m.NombreMaterial,
                    Precio = m.PrecioIngredienteExtra ?? 0,
                    CantidadRequerida = m.CantidadIngredienteExtra,
                    m.NoDescuentaInventario,
                    IdUnidadMedida = m.IdUnidadIngredienteExtra,
                    AbreviacionUnidad = m.IdUnidadIngredienteExtraNavigation != null
                        ? m.IdUnidadIngredienteExtraNavigation.Abreviacion
                        : null
                })
                .ToListAsync();
            return Ok(items);
        }

        /// <summary>
        /// Catálogo de ingredientes extra activos para el punto de venta. Mantiene la forma
        /// estable { idIngredienteExtra, nombre, precio } (idIngredienteExtra = Id_Materia_Prima).
        /// </summary>
        [HttpGet("active")]
        [Permission(Permissions.SalesOperate + "|" + Permissions.SalesCreate + "|" + Permissions.ExtraIngredientsView)]
        public async Task<IActionResult> GetActive()
        {
            var items = await _context.InvMateriaPrima
                .Where(m => m.UsoIngredienteExtra && m.PrecioIngredienteExtra != null
                    && m.IdUnidadIngredienteExtra != null
                    // La cantidad puede ser null cuando la materia no descuenta inventario (referencial).
                    && (m.CantidadIngredienteExtra != null || m.NoDescuentaInventario))
                .OrderBy(m => m.NombreMaterial)
                .Select(m => new
                {
                    IdIngredienteExtra = m.IdMateriaPrima,
                    Nombre = m.NombreMaterial,
                    Precio = m.PrecioIngredienteExtra ?? 0
                })
                .ToListAsync();
            return Ok(items);
        }

        /// <summary>
        /// Materias primas disponibles para marcar como extra y unidades para el formulario.
        /// </summary>
        [HttpGet("options")]
        [Permission(Permissions.ExtraIngredientsView)]
        public async Task<IActionResult> GetOptions()
        {
            var materiasPrimas = await _context.InvMateriaPrima
                .OrderBy(m => m.NombreMaterial)
                .Select(m => new
                {
                    m.IdMateriaPrima,
                    m.NombreMaterial,
                    m.IdUnidadMedida,
                    TipoMagnitud = m.IdUnidadMedidaNavigation.TipoMagnitud,
                    AbreviacionUnidad = m.IdUnidadMedidaNavigation.Abreviacion,
                    m.UsoIngredienteExtra,
                    m.NoDescuentaInventario
                })
                .ToListAsync();

            var unidades = await _context.InvUnidadesMedida
                .OrderBy(u => u.NombreUnidadMedida)
                .Select(u => new
                {
                    u.IdUnidadMedida,
                    u.NombreUnidadMedida,
                    u.Abreviacion,
                    u.TipoMagnitud
                })
                .ToListAsync();

            return Ok(new { MateriasPrimas = materiasPrimas, Unidades = unidades });
        }

        /// <summary>Marca la materia prima como ingrediente extra y fija precio/cantidad/unidad.</summary>
        [HttpPut("{idMateriaPrima:int}")]
        [Permission(Permissions.ExtraIngredientsEdit + "|" + Permissions.ExtraIngredientsCreate)]
        public async Task<IActionResult> Save(int idMateriaPrima, [FromBody] ExtraIngredientDto dto)
        {
            var validation = await ValidateAsync(idMateriaPrima, dto);
            if (validation != null) return validation;

            var material = await _context.InvMateriaPrima.FindAsync(idMateriaPrima);
            if (material == null) return NotFound(new { Mensaje = "Materia prima no encontrada" });

            material.UsoIngredienteExtra = true;
            material.PrecioIngredienteExtra = dto.Precio;
            // La materia que no descuenta inventario (p. ej. agua) lleva cantidad referencial:
            // se guarda como null y no exige un valor mayor que cero.
            material.CantidadIngredienteExtra = material.NoDescuentaInventario
                ? (dto.CantidadRequerida > 0 ? dto.CantidadRequerida : (decimal?)null)
                : dto.CantidadRequerida;
            material.IdUnidadIngredienteExtra = dto.IdUnidadMedida;

            await _context.SaveChangesAsync();
            return Ok(new { material.IdMateriaPrima });
        }

        /// <summary>Activa o desactiva el uso de una materia prima como ingrediente extra.</summary>
        [HttpPut("{idMateriaPrima:int}/status")]
        [Permission(Permissions.ExtraIngredientsStatusEdit)]
        public async Task<IActionResult> UpdateStatus(int idMateriaPrima, [FromBody] ExtraIngredientStatusDto dto)
        {
            var material = await _context.InvMateriaPrima.FindAsync(idMateriaPrima);
            if (material == null) return NotFound(new { Mensaje = "Materia prima no encontrada" });

            if (dto.Activo && (material.PrecioIngredienteExtra == null
                || material.CantidadIngredienteExtra == null || material.IdUnidadIngredienteExtra == null))
                return BadRequest(new { Mensaje = "Configure precio, cantidad y unidad antes de activar el extra." });

            material.UsoIngredienteExtra = dto.Activo;
            await _context.SaveChangesAsync();
            return Ok(new { material.IdMateriaPrima, Activo = material.UsoIngredienteExtra });
        }

        /// <summary>
        /// Comprueba precio, cantidad y que la unidad elegida comparta magnitud con la unidad de
        /// inventario de la materia prima (para poder convertir el consumo).
        /// </summary>
        private async Task<IActionResult?> ValidateAsync(int idMateriaPrima, ExtraIngredientDto dto)
        {
            if (dto == null)
                return BadRequest(new { Mensaje = "Datos del ingrediente extra no válidos" });
            if (dto.Precio < 0)
                return BadRequest(new { Mensaje = "El precio no puede ser negativo" });

            var material = await _context.InvMateriaPrima
                .Include(m => m.IdUnidadMedidaNavigation)
                .FirstOrDefaultAsync(m => m.IdMateriaPrima == idMateriaPrima);
            if (material == null)
                return BadRequest(new { Mensaje = "La materia prima seleccionada no es válida" });

            // La cantidad solo es obligatoria si la materia descuenta inventario; si no, es referencial.
            if (!material.NoDescuentaInventario && dto.CantidadRequerida <= 0)
                return BadRequest(new { Mensaje = "La cantidad requerida debe ser mayor que cero" });

            var unit = await _context.InvUnidadesMedida.FindAsync(dto.IdUnidadMedida);
            if (unit == null)
                return BadRequest(new { Mensaje = "La unidad de medida seleccionada no es válida" });

            if (!string.Equals(unit.TipoMagnitud, material.IdUnidadMedidaNavigation.TipoMagnitud, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { Mensaje = $"La unidad debe ser de la misma magnitud que la materia prima ({material.IdUnidadMedidaNavigation.TipoMagnitud})." });

            return null;
        }
    }
}
