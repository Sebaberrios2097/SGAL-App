# SGAL App

**Sistema de Gestión, Administración y Logística** para pequeñas y medianas empresas.

SGAL App es una base de producto modular y configurable. El mismo código se puede desplegar de forma independiente para cada cliente, conservando su propia base de datos, identidad visual, módulos habilitados y permisos de usuario.

## Componentes

- `SgalApp.Api`: API REST en ASP.NET Core.
- `SgalApp.Infrastructure`: acceso a datos con Entity Framework Core y SQL Server.
- `frontend`: interfaz React/Vite servida por Nginx.
- `DatabaseChanges`: migraciones SQL explícitas del producto.
- `compose.yaml`: despliegue conjunto de API y frontend; SQL Server puede ejecutarse fuera del Compose.

La identidad de la organización se administra en tiempo de ejecución: nombre, razón social, descripción, textos públicos, logo y hasta cuatro colores. La activación de módulos se almacena en la base de datos de cada instalación y los permisos de los roles se filtran por los módulos habilitados.

## Documentación funcional

- [Catálogo de módulos](docs/MODULOS.md)
- [Plan de generalización y cambios](docs/PLAN_GENERALIZACION.md)
- [Matriz detallada de permisos](MATRIZ_MODULOS_PERMISOS.md)
- [Despliegue manual con Docker](DEPLOYMENT.md)

## Desarrollo local

```powershell
dotnet build SGAL.slnx
cd frontend
npm ci
npm run dev
```

Antes de iniciar una base existente, aplica en orden los scripts de `DatabaseChanges`; la configuración de organización y módulos se incorpora mediante `20260916_Configuracion_Organizacion_Modulos.sql`.

No se incluyen credenciales ni datos del cliente original. Usa `.env.example` como base para la configuración privada de cada instalación.
