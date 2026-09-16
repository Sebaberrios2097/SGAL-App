# Plan de generalización de SGAL App

Fecha de revisión: 16 de septiembre de 2026.

## Decisión de arquitectura

Se mantiene **un único código fuente** y se realiza **una instalación independiente por cliente**. Cada instalación utiliza su propio servidor, archivo de secretos y base SQL Server. Esto permite vender licencias privadas sin convertir inmediatamente el producto en un SaaS multiempresa.

No se agregó `TenantId` a las tablas porque una base de datos no compartirá información entre clientes. Si en el futuro se ofrece SaaS multiempresa, el aislamiento de datos deberá diseñarse como una iniciativa separada; no basta con añadir una columna de forma mecánica.

La aplicación permanece como un monolito modular: los módulos comparten API y frontend, pero su disponibilidad se controla en base de datos y su autorización se valida en el servidor.

## Cambios realizados

### Identidad y configuración

- Se sustituyó el nombre técnico y visual de Siete Vidas por SGAL App.
- Se eliminaron logos y fondos propios del cliente original.
- Se agregó configuración persistente para nombre comercial, razón social, descripción, pie de documentos, contacto, logo y cuatro colores.
- La configuración pública se carga al iniciar el frontend y actualiza tema, logo, favicon, títulos, comprobantes y exportaciones.
- Se incorporó una pantalla administrativa para editar la identidad sin recompilar el frontend.
- El logo acepta PNG o JPEG hasta 2 MB y se conserva en la base de datos de esa instalación.

### Modularidad y autorización

- Se agregó un catálogo descriptivo de módulos, módulos de núcleo, activación por organización y dependencias.
- Los permisos efectivos se filtran en la API según los módulos habilitados.
- Se agregó una pantalla de activación de módulos con validación de dependencias.
- Se documentaron módulos actuales, permisos y futuras áreas logísticas.

### Código y despliegue

- API, infraestructura, solución, contexto de datos, cookie y claves de configuración usan nombres genéricos.
- API y frontend vigentes quedaron reunidos en un solo repositorio de producto, aunque siguen siendo proyectos y contenedores separados.
- `compose.yaml` permite construir o ejecutar las imágenes independientes de API y frontend.
- La automatización de GitHub Actions se dejó expresamente fuera de esta etapa.

## Cambios de base de datos

El script `DatabaseChanges/20260916_Configuracion_Organizacion_Modulos.sql` realiza lo siguiente:

- amplía `Seg_Modulos` con descripción e indicador de núcleo;
- crea `Org_Configuracion` como configuración única de la instalación;
- crea `Org_Modulos` para habilitar o deshabilitar módulos opcionales;
- crea `Seg_Modulos_Dependencias` para impedir combinaciones inválidas;
- registra el módulo de configuración y sus permisos;
- habilita inicialmente los módulos existentes para no interrumpir instalaciones actuales;
- entrega al rol administrador permisos de lectura y edición de marca; la administración comercial de módulos permanece reservada al superusuario desarrollador.

No se migran logos ni nombres de Siete Vidas: cada instalación debe cargar su identidad desde Configuración.

## Trabajo pendiente recomendado

### Antes de la primera instalación comercial

- Ejecutar la migración sobre una copia reciente de la base y probar respaldo/restauración.
- Completar pruebas automáticas de permisos, módulos y flujos críticos.
- Revisar textos, datos semilla y reportes con información específica del cliente original.
- Definir versionado del producto y procedimiento de actualización reversible.
- Documentar variables secretas, respaldo, monitoreo y recuperación ante desastres.
- Sustituir el marcador `OWNER` de las imágenes cuando se configure el registro real.

### Evolución logística

- Diseñar clientes y múltiples direcciones de despacho.
- Modelar pedido, preparación, empaquetamiento, despacho y entrega como estados auditables.
- Reservar y descontar inventario en el momento de negocio correcto.
- Registrar responsables, fechas, incidencias y evidencia de entrega.
- Definir permisos separados para venta, bodega, preparación, despacho y supervisión.

### Calidad de producto

- Crear pruebas end-to-end por perfil de usuario.
- Incorporar auditoría general de cambios sensibles.
- Añadir configuración regional: moneda, zona horaria, impuestos y formatos.
- Evaluar almacenamiento externo del logo y documentos solo si crece su volumen; para un logo pequeño por instalación, la base de datos simplifica respaldo y portabilidad.
- Automatizar construcción y publicación de imágenes cuando la estructura se estabilice.

## Criterio para vender un módulo

Un módulo está listo para ofrecerse cuando tiene descripción comercial, migración versionada, permisos completos en API, interfaz condicionada, dependencias declaradas, pruebas y documentación operacional. Ocultar una opción del menú por sí solo no constituye modularidad ni seguridad.
