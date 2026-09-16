using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace SgalApp.Infrastructure.Extensions
{
    public static class ServiceCollectionExtensions
    {
        /// <summary>
        /// Registra los servicios de SgalApp.Infrastructure en el contenedor de DI.
        /// </summary>
        public static IServiceCollection AddInfrastructure(
            this IServiceCollection services,
            IConfiguration configuration)
        {
            string sgalDatabase = configuration.GetConnectionString("SgalConnection")
                ?? throw new InvalidOperationException(
                    "No se configuró ConnectionStrings:SgalConnection. " +
                    "Use User Secrets en desarrollo o ConnectionStrings__SgalConnection en el servidor.");

            if (string.IsNullOrWhiteSpace(sgalDatabase))
                throw new InvalidOperationException(
                    "ConnectionStrings:SgalConnection está vacía. Configure una cadena SQL Server válida.");

            // Contextos
            services.AddDbContext<SgalContext>(options =>
                options.UseSqlServer(sgalDatabase));

            services.AddDbContext<SpSgalContext>(options =>
                options.UseSqlServer(sgalDatabase));

            // Stored Procedures
            services.AddScoped<ISpSgalContextProcedures, SpSgalContextProcedures>();

            // Registro automático de repositorios e interfaces por convención
            var assembly = Assembly.GetExecutingAssembly();
            services.RegisterByConvention(assembly, "Service");
            services.RegisterByConvention(assembly, "Repository");
            services.RegisterByConvention(assembly, "StoredProcedures");

            return services;
        }

        /// <summary>
        /// Recorre el ensamblado buscando clases concretas cuyo nombre termine en <paramref name="suffix"/>
        /// y las registra en el contenedor de DI junto a su interfaz correspondiente.
        /// </summary>
        private static void RegisterByConvention(
            this IServiceCollection services,
            Assembly assembly,
            string suffix)
        {
            var types = assembly.GetTypes()
                // 1. Solo clases concretas (excluye interfaces y clases abstractas)
                .Where(t => t.IsClass && !t.IsAbstract && t.Name.EndsWith(suffix))

                // 2. Para cada clase, busca la interfaz que le corresponde por nombre
                .Select(t => new
                {
                    Implementation = t,
                    Interface = t.GetInterfaces()
                        .FirstOrDefault(i => i.Name.StartsWith("I") && i.Name.EndsWith(suffix))
                })

                // 3. Descarta clases que no tienen una interfaz con esa convención de nombre
                .Where(x => x.Interface != null);

            // 4. Registra cada par (interfaz → implementación) como Scoped
            foreach (var type in types)
                services.AddScoped(type.Interface!, type.Implementation);

            // ── Exclusión manual (descomentar si alguna clase no debe registrarse) ────────
            //
            // Opción A — por atributo: crear un atributo [SkipAutoRegister] y filtrar así:
            //
            //   .Where(t => t.IsClass && !t.IsAbstract
            //            && t.Name.EndsWith(suffix)
            //            && !t.IsDefined(typeof(SkipAutoRegisterAttribute), false))
            //
            // Opción B — por nombre: excluir clases específicas con una lista negra:
            //
            //   var excluded = new[] { "ClaseQueNoQuieroRegistrar" };
            //   .Where(t => t.IsClass && !t.IsAbstract
            //            && t.Name.EndsWith(suffix)
            //            && !excluded.Contains(t.Name))
            //
            // ────────────────────────────────────────────────────────────────────────────────
        }
    }
}
