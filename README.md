# SGAL App

**Sistema de Gestión, Administración y Logística** para pequeñas y medianas empresas.

SGAL App es una base de producto modular y configurable. El mismo código se puede desplegar de forma independiente para cada cliente, conservando su propia base de datos, identidad visual, módulos habilitados y permisos de usuario.

## Componentes

- `SgalApp.Api`: API REST en ASP.NET Core.
- `SgalApp.Infrastructure`: acceso a datos con Entity Framework Core y SQL Server.
- `frontend`: interfaz React/Vite servida por Nginx.
- `DatabaseChanges`: migraciones SQL explícitas del producto.
- `compose.yaml`: despliegue conjunto de API y frontend; SQL Server puede ejecutarse fuera del Compose.

La identidad de la organización se administra en tiempo de ejecución: nombre, razón social, descripción, textos públicos, biblioteca de logos y hasta cuatro colores. Cada logo puede asignarse a login, sidebar, punto de venta, boletas, documentos y favicon; cada ubicación admite exactamente un logo. La activación de módulos se almacena en la base de datos de cada instalación y los permisos de los roles se filtran por los módulos habilitados.

## Documentación funcional

- [Catálogo de módulos](docs/MODULOS.md)
- [Plan de generalización y cambios](docs/PLAN_GENERALIZACION.md)
- [Matriz detallada de permisos](MATRIZ_MODULOS_PERMISOS.md)
- [Despliegue completo en Ubuntu: Docker, HTTPS, multi-instancia y CI/CD](deploy/README.md)
- [Referencia de despliegue manual](DEPLOYMENT.md)

## Desarrollo local

```powershell
dotnet build SGAL.slnx
cd frontend
npm ci
npm run dev
```

Antes de iniciar una base existente, aplica en orden los scripts de `DatabaseChanges`. La configuración de organización y módulos se incorpora mediante `20260916_Configuracion_Organizacion_Modulos.sql`; la biblioteca y asignación de logos mediante `20260917_Logos_Multiples.sql`; los fondos personalizados por zona (imagen de fondo para menú lateral, ventas y comandas) mediante `20260918_Fondos_Personalizados.sql`; el fondo de inicio de sesión mediante `20260919_Fondo_Login.sql`; el catálogo funcional consolidado mediante `20260920_Consolidacion_Modulos.sql`; las ventas sin turno mediante `20260920_Ventas_Sin_Turnos.sql`, y el módulo DTE mediante `20260923_Modulo_Boletas.sql`, `20260924_Contingencia_Dte.sql` y `20260925_Clientes_Factura_Unicos.sql`.

En desarrollo, configura la conexión sin guardarla en Git:

```powershell
dotnet user-secrets set "ConnectionStrings:SgalConnection" "Server=SERVIDOR;Database=SGAL;..." --project SgalApp.Api/SgalApp.Api.csproj
```

En Docker o en el servidor se utiliza la variable `ConnectionStrings__SgalConnection`, incluida como referencia en `.env.example`. Si falta la configuración, la API se detiene al iniciar con un mensaje explícito en lugar de fallar al atender la primera solicitud.

No se incluyen credenciales ni datos del cliente original. Usa `.env.example` como base para la configuración privada de cada instalación.
