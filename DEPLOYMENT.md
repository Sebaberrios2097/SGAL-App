# Despliegue manual con Docker

SGAL App utiliza imágenes separadas para la API y el frontend. SQL Server no forma parte del contenedor de la aplicación: cada cliente debe utilizar una instancia administrada o instalada en infraestructura compatible con SQL Server.

La automatización con GitHub Actions se incorporará en una etapa posterior. Este procedimiento permite ordenar y validar primero el producto.

## 1. Preparar la configuración

En el servidor crea un directorio exclusivo para la instalación y copia `compose.yaml` y `.env.example`:

```bash
mkdir -p /opt/sgal-app
cd /opt/sgal-app
cp .env.example .env
chmod 600 .env
```

Completa `.env` con la conexión SQL Server y las credenciales privadas del cliente. Nunca guardes secretos en Git.

## 2. Construir las imágenes

Desde la raíz del repositorio:

```bash
docker compose build
```

Esto produce dos imágenes independientes:

- `sgal-app-api`: API ASP.NET Core.
- `sgal-app-web`: frontend compilado y Nginx.

También pueden publicarse en un registro cambiando `OWNER` en `compose.yaml` y ejecutando `docker compose push`.

## 3. Aplicar cambios de base de datos

Respalda la base y ejecuta en orden los scripts pendientes de `DatabaseChanges`. Para habilitar la configuración por organización y módulos aplica:

```text
DatabaseChanges/20260916_Configuracion_Organizacion_Modulos.sql
DatabaseChanges/20260917_Logos_Multiples.sql
```

SQL Server oficial se distribuye para Linux x86-64; un servidor ARM no puede ejecutar esa imagen de forma nativa. API y frontend sí pueden compilarse para ARM, conectándose a SQL Server en otra máquina compatible.

## 4. Iniciar y verificar

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=200 api web
```

La aplicación queda publicada en `APP_PORT` (80 por defecto). Configura HTTPS con un proxy inverso como Caddy, Traefik o Nginx y limita el acceso directo a SQL Server.

Después del primer ingreso, configura nombre, colores y logo; luego habilita solamente los módulos contratados y asigna permisos a los roles.

## Actualización manual

```bash
git pull
docker compose build
docker compose up -d
```

Antes de actualizar producción, conserva la imagen anterior, respalda la base y valida las migraciones en un entorno de prueba. El archivo `.env` y los datos del cliente no deben reemplazarse durante una actualización.
