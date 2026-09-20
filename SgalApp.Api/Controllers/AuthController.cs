using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Data;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace SgalApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly SgalContext _context;
        private readonly ISpSgalContextProcedures _procedures;
        private readonly IPermissionService _permissions;

        public AuthController(SgalContext context, ISpSgalContextProcedures procedures, IPermissionService permissions)
        {
            _context = context;
            _procedures = procedures;
            _permissions = permissions;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.NombreUsuario) || string.IsNullOrWhiteSpace(dto.Pass))
            {
                return BadRequest(new { Mensaje = "Usuario y contraseña son requeridos" });
            }

            var user = await _context.EmpUsuarios
                .FirstOrDefaultAsync(u => u.NombreUsuario.ToLower() == dto.NombreUsuario.ToLower() && u.Activo);

            if (user == null)
            {
                return Unauthorized(new { Mensaje = "Usuario no encontrado o inactivo" });
            }

            var resultList = await _procedures.sp_Emp_ValidaAccesoAsync(user.IdUsuario, dto.Pass);
            var result = resultList?.FirstOrDefault();

            if (result == null || result.Acceso_Valido != true)
            {
                return Unauthorized(new { Mensaje = result?.Mensaje ?? "Credenciales inválidas" });
            }

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.IdUsuario.ToString()),
                new Claim(ClaimTypes.Name, user.NombreUsuario),
                new Claim("must_change_password", (result.Cambio_Clave == true).ToString().ToLowerInvariant())
            };
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));

            return Ok(await BuildSessionAsync(user.IdUsuario, result.Cambio_Clave == true));
        }

        /// <summary>
        /// Indica si el sistema requiere el registro inicial: es <c>true</c> cuando
        /// no existe ningún usuario Desarrollador activo. El cliente debe mostrar el
        /// formulario de creación del usuario base en lugar del login.
        /// </summary>
        [HttpGet("bootstrap-status")]
        public async Task<IActionResult> BootstrapStatus()
        {
            return Ok(new { RequiresBootstrap = !await DeveloperExistsAsync() });
        }

        /// <summary>
        /// Crea el usuario base (empleado + cuenta con rol Desarrollador) y deja la
        /// sesión iniciada. Solo se permite mientras no exista ningún Desarrollador.
        /// </summary>
        [HttpPost("bootstrap")]
        public async Task<IActionResult> Bootstrap([FromBody] CreateBaseUserDto dto)
        {
            // Solo disponible durante el arranque inicial del sistema.
            if (await DeveloperExistsAsync())
                return Conflict(new { Mensaje = "El registro inicial no está disponible: ya existe un usuario Desarrollador." });

            var userName = dto.NombreUsuario?.Trim();
            if (dto.Rut <= 0 || string.IsNullOrWhiteSpace(dto.Dv) || string.IsNullOrWhiteSpace(dto.Nombres) || string.IsNullOrWhiteSpace(dto.Apellido1))
                return BadRequest(new { Mensaje = "Rut, Dv, Nombres y Apellido Paterno son obligatorios" });
            if (string.IsNullOrWhiteSpace(userName))
                return BadRequest(new { Mensaje = "El nombre de usuario es obligatorio" });
            if (userName.Length > 50)
                return BadRequest(new { Mensaje = "El nombre de usuario no puede superar los 50 caracteres" });
            if (string.IsNullOrWhiteSpace(dto.Pass) || dto.Pass.Length < 4)
                return BadRequest(new { Mensaje = "La contraseña debe tener al menos 4 caracteres" });

            var requestedModules = (dto.CodigosModulosHabilitados ?? [])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim().ToLowerInvariant())
                .ToHashSet();
            var modules = await _context.SegModulos
                .Where(x => x.Activo)
                .Include(x => x.ConfiguracionOrganizacion)
                .ToListAsync();
            var unknownModules = requestedModules.Except(modules.Select(x => x.Codigo)).ToList();
            if (unknownModules.Count != 0)
                return BadRequest(new { Mensaje = $"Módulos desconocidos: {string.Join(", ", unknownModules)}" });

            var selectedModules = requestedModules
                .Concat(modules.Where(x => x.EsNucleo).Select(x => x.Codigo))
                .ToHashSet();
            var missingDependencies = await _context.SegModulosDependencias.AsNoTracking()
                .Where(x => selectedModules.Contains(x.Modulo.Codigo) && !selectedModules.Contains(x.ModuloRequerido.Codigo))
                .Select(x => new { Modulo = x.Modulo.Codigo, Requerido = x.ModuloRequerido.Codigo })
                .ToListAsync();
            if (missingDependencies.Count != 0)
                return BadRequest(new
                {
                    Mensaje = "La selección no cumple las dependencias entre módulos.",
                    DependenciasFaltantes = missingDependencies
                });

            var devRole = await _context.EmpRolesUsuarios.AnyAsync(r => r.IdRolUsuario == RolesUsuario.Desarrollador);
            if (!devRole)
                return Conflict(new { Mensaje = "Falta el catálogo de roles: no existe el rol Desarrollador." });

            if (await _context.EmpEmpleados.AnyAsync(e => e.Rut == dto.Rut && e.Activo))
                return BadRequest(new { Mensaje = $"Ya existe un empleado activo con el RUT {dto.Rut}" });
            var normalizedName = userName.ToLower();
            if (await _context.EmpUsuarios.AnyAsync(u => u.NombreUsuario.ToLower() == normalizedName))
                return BadRequest(new { Mensaje = "El nombre de usuario ya está en uso" });

            // 1) Empleado
            var employee = new EmpEmpleados
            {
                Rut = dto.Rut,
                Dv = dto.Dv.ToUpper(),
                Nombres = dto.Nombres.Trim(),
                Alias = string.IsNullOrWhiteSpace(dto.Alias) ? null : dto.Alias.Trim(),
                Apellido1 = dto.Apellido1.Trim(),
                Apellido2 = string.IsNullOrWhiteSpace(dto.Apellido2) ? null : dto.Apellido2.Trim(),
                NumeroTelefono = dto.NumeroTelefono,
                Correo = string.IsNullOrWhiteSpace(dto.Correo) ? null : dto.Correo.Trim(),
                FechaIngreso = DateOnly.FromDateTime(DateTime.Now),
                Activo = true
            };
            _context.EmpEmpleados.Add(employee);
            await _context.SaveChangesAsync();

            // 2) Cuenta de usuario (el SP calcula el hash de la contraseña por defecto).
            var createList = await _procedures.sp_Emp_Crea_UsuarioEmpleadoAsync(dto.Rut);
            var created = createList?.FirstOrDefault();
            if (created?.Id_Usuario_Creado == null)
            {
                // Revertimos el empleado para permitir reintentar el registro inicial.
                _context.EmpEmpleados.Remove(employee);
                await _context.SaveChangesAsync();
                return BadRequest(new { Mensaje = created?.Mensaje ?? "Error al crear la cuenta de usuario" });
            }
            var userId = created.Id_Usuario_Creado.Value;

            // 3) Nombre de usuario elegido + rol Desarrollador
            var user = await _context.EmpUsuarios.FirstAsync(u => u.IdUsuario == userId);
            user.NombreUsuario = userName;
            employee.IdUsuario = userId;
            _context.EmpRolesXusuario.Add(new EmpRolesXusuario
            {
                IdUsuario = userId,
                IdRolUsuario = RolesUsuario.Desarrollador,
                Activo = true,
                FechaAsignacion = DateTime.Now
            });

            // La selección de módulos forma parte del arranque y queda fijada antes
            // de crear el rol y construir la primera sesión y sus permisos efectivos.
            foreach (var module in modules)
            {
                var enabled = module.EsNucleo || requestedModules.Contains(module.Codigo);
                if (module.ConfiguracionOrganizacion == null)
                    _context.OrgModulos.Add(new OrgModulo
                    {
                        IdModulo = module.IdModulo,
                        Habilitado = enabled,
                        FechaActualizacion = DateTime.UtcNow
                    });
                else
                {
                    module.ConfiguracionOrganizacion.Habilitado = enabled;
                    module.ConfiguracionOrganizacion.FechaActualizacion = DateTime.UtcNow;
                }
            }
            await _context.SaveChangesAsync();

            // 4) Contraseña elegida (reset administrativo: no exige la contraseña actual).
            var passList = await _procedures.sp_Emp_CambiaClaveAsync(userId, string.Empty, dto.Pass, true);
            var passResult = passList?.FirstOrDefault();
            if (passResult == null || passResult.Resultado != 1)
                return BadRequest(new { Mensaje = passResult?.Mensaje ?? "Error al establecer la contraseña" });

            // 5) Validamos e iniciamos sesión, igual que en el login normal.
            var validaList = await _procedures.sp_Emp_ValidaAccesoAsync(userId, dto.Pass);
            var valida = validaList?.FirstOrDefault();
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Name, userName),
                new Claim("must_change_password", (valida?.Cambio_Clave == true).ToString().ToLowerInvariant())
            };
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));

            return Ok(await BuildSessionAsync(userId, valida?.Cambio_Clave == true));
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var id = User.GetUserId();
            var active = await _context.EmpUsuarios.AnyAsync(x => x.IdUsuario == id && x.Activo);
            if (!active)
            {
                await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                return Unauthorized(new { Mensaje = "La cuenta no está activa." });
            }
            return Ok(await BuildSessionAsync(id, User.FindFirstValue("must_change_password") == "true"));
        }

        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return NoContent();
        }

        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.PassNueva))
            {
                return BadRequest(new { Mensaje = "La nueva contraseña es requerida" });
            }
            if (dto.PassNueva.Length < 4)
            {
                return BadRequest(new { Mensaje = "La nueva contraseña debe tener al menos 4 caracteres" });
            }

            var currentUserId = User.GetUserId();
            var isOwnChange = dto.IdUsuario == currentUserId;
            var canResetPasswords = await _permissions.HasPermissionAsync(currentUserId, Permissions.UsersPasswordReset);
            var isAdministrativeReset = dto.EsAdmin && canResetPasswords;
            if (!isOwnChange && !canResetPasswords)
                return Forbid();

            var targetUserId = isOwnChange ? currentUserId : dto.IdUsuario;
            var resultList = await _procedures.sp_Emp_CambiaClaveAsync(targetUserId, dto.PassActual, dto.PassNueva, isAdministrativeReset || !isOwnChange);
            var result = resultList?.FirstOrDefault();

            if (result == null || result.Resultado != 1)
            {
                return BadRequest(new { Mensaje = result?.Mensaje ?? "Error al cambiar la contraseña" });
            }

            if (isOwnChange && !isAdministrativeReset)
            {
                var name = User.FindFirstValue(ClaimTypes.Name) ?? string.Empty;
                var claims = new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, currentUserId.ToString()),
                    new Claim(ClaimTypes.Name, name),
                    new Claim("must_change_password", "false")
                };
                await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                    new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
            }

            return Ok(new { Mensaje = result.Mensaje });
        }

        /// <summary>Existe al menos un usuario activo con el rol Desarrollador activo.</summary>
        private Task<bool> DeveloperExistsAsync()
        {
            return _context.EmpRolesXusuario.AnyAsync(rx =>
                rx.Activo &&
                rx.IdRolUsuario == RolesUsuario.Desarrollador &&
                rx.IdUsuarioNavigation.Activo);
        }

        private async Task<object> BuildSessionAsync(int userId, bool cambioClave)
        {
            var user = await _context.EmpUsuarios.AsNoTracking().FirstAsync(x => x.IdUsuario == userId);
            var employee = await _context.EmpEmpleados.AsNoTracking()
                .FirstOrDefaultAsync(e => e.IdUsuario == userId && e.Activo);
            var roles = await _context.EmpRolesXusuario.AsNoTracking()
                .Where(rx => rx.IdUsuario == userId && rx.Activo)
                .Select(rx => rx.IdRolUsuarioNavigation.NombreRol).ToListAsync();
            var permissions = await _permissions.GetEffectivePermissionsAsync(userId);
            var maxDiscountPercent = await _permissions.GetMaxDiscountPercentAsync(userId);

            return new
            {
                user.IdUsuario,
                user.NombreUsuario,
                CambioClave = cambioClave,
                MaxDiscountPercent = maxDiscountPercent,
                Empleado = employee == null ? null : new
                {
                    employee.IdEmpleado, employee.Nombres, employee.Alias, employee.Apellido1,
                    employee.Apellido2, employee.Correo
                },
                Roles = roles,
                Permissions = permissions
            };
        }
    }
}
