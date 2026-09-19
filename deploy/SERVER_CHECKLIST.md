# Checklist de despliegue de SGAL por servidor

> Copia este archivo para cada servidor y renómbralo, por ejemplo:
> `SERVER_CHECKLIST-produccion-01.md`. Marca cada tarea con `[x]` a medida que
> avances. No escribas contraseñas, tokens, llaves privadas ni cadenas de
> conexión en este documento.

Guía de referencia: [`deploy/README.md`](README.md).

---

## 1. Identificación del servidor

- [ ] Nombre o identificador: `____________________________`
- [ ] Ambiente: `Producción / Pruebas / Desarrollo`
- [ ] Proveedor: `____________________________`
- [ ] IP pública: `____________________________`
- [ ] Versión de Ubuntu: `____________________________`
- [ ] Arquitectura: `x86_64 / ARM64 / otra: ____________`
- [ ] Usuario administrador: `____________________________`
- [ ] Ruta de instalación: `/opt/sgal`
- [ ] Responsable: `____________________________`
- [ ] Fecha de inicio: `____ / ____ / ________`
- [ ] Fecha de puesta en producción: `____ / ____ / ________`

Notas:

```text

```

---

## 2. Preparación inicial del servidor (una vez)

### Acceso y sistema

- [ ] El servidor tiene una IP pública fija.
- [ ] Se puede ingresar por SSH con un usuario no root.
- [ ] El acceso SSH usa una llave y no una contraseña, si es posible.
- [ ] Ubuntu está actualizado (`sudo apt update && sudo apt upgrade`).
- [ ] La zona horaria está configurada correctamente.
- [ ] Existe espacio suficiente en disco.
- [ ] Existe memoria suficiente para todas las instancias proyectadas.
- [ ] Se definió un mecanismo de respaldo del servidor o de su configuración.

### Firewall y red

- [ ] El puerto SSH está permitido en el firewall.
- [ ] El puerto TCP 80 está abierto hacia Internet.
- [ ] El puerto TCP 443 está abierto hacia Internet.
- [ ] SQL Server no está expuesto públicamente sin una restricción explícita.
- [ ] Se revisaron las reglas de firewall del proveedor de infraestructura.
- [ ] UFW está habilitado y sus reglas fueron verificadas.

### Docker y repositorio

- [ ] Docker Engine está instalado.
- [ ] Docker Compose Plugin está instalado.
- [ ] El usuario de despliegue pertenece al grupo `docker`.
- [ ] `docker run --rm hello-world` funciona correctamente.
- [ ] Git está instalado.
- [ ] El repositorio está clonado en `/opt/sgal`.
- [ ] El remote de Git apunta al repositorio correcto.
- [ ] La rama activa del servidor es `main`.
- [ ] Existe la red compartida `proxy` (`docker network inspect proxy`).

Resultado o incidencias:

```text

```

---

## 3. Reverse proxy y certificados SSL (una vez)

- [ ] Se creó `deploy/reverse-proxy/.env` desde `.env.example`.
- [ ] `ACME_EMAIL` contiene un correo válido y monitoreado.
- [ ] El archivo `.env` solo puede ser leído por el usuario autorizado.
- [ ] Traefik está levantado con `docker compose up -d`.
- [ ] El contenedor de Traefik aparece como saludable/activo.
- [ ] Traefik está conectado a la red Docker `proxy`.
- [ ] Los puertos 80 y 443 están publicados por Traefik.
- [ ] El archivo `letsencrypt/acme.json` existe y tiene permisos restrictivos.
- [ ] No hay otro servicio ocupando los puertos 80 o 443.
- [ ] Los logs de Traefik no muestran errores permanentes.
- [ ] Se definió cómo respaldar `letsencrypt/acme.json`.

Comprobaciones:

```bash
cd /opt/sgal/deploy/reverse-proxy
docker compose ps
docker compose logs --tail=100 traefik
docker network inspect proxy
```

---

## 4. Acceso a imágenes y automatización CI/CD (una vez)

### GitHub Container Registry

- [ ] El workflow publica `sgal-app-api` en GHCR.
- [ ] El workflow publica `sgal-app-web` en GHCR.
- [ ] La visibilidad de los paquetes permite que el servidor los descargue.
- [ ] Si los paquetes son privados, el servidor puede autenticarse en GHCR.
- [ ] Se verificó que existen las etiquetas `latest` y SHA del commit.

### GitHub Environment, llave y secrets de despliegue

- [ ] Se creó un GitHub Environment exclusivo para este servidor.
- [ ] Su nombre está incluido en la variable JSON `DEPLOY_ENVIRONMENTS`.
- [ ] Se creó una llave SSH exclusiva para este servidor y GitHub Actions.
- [ ] La llave pública está en `authorized_keys` del usuario de despliegue.
- [ ] La llave privada no está guardada dentro del repositorio.
- [ ] Existe el secret `DEPLOY_HOST` en GitHub.
- [ ] Existe el secret `DEPLOY_USER` en GitHub.
- [ ] Existe el secret `DEPLOY_SSH_KEY` en GitHub.
- [ ] Existe el secret `DEPLOY_PATH` con el valor correcto.
- [ ] `DEPLOY_PORT` está configurado si no se usa el puerto 22.
- [ ] Los secrets anteriores pertenecen al Environment y no al repositorio.
- [ ] El usuario de despliegue puede ejecutar Docker sin `sudo`.
- [ ] El script `deploy/deploy-all.sh` tiene permiso de ejecución.
- [ ] Un push de prueba generó un job de deploy para este servidor.
- [ ] El job de este servidor terminó correctamente en GitHub Actions.
- [ ] El servidor descargó y levantó las imágenes publicadas por el workflow.

Última prueba CI/CD:

- Fecha: `____ / ____ / ________`
- Commit/SHA: `____________________________`
- Resultado: `Correcto / Con observaciones / Fallido`
- Observaciones: `__________________________________________________________`

---

## 5. Checklist repetible por cliente o instancia

> Duplica esta sección completa por cada cliente alojado en el servidor.

### Instancia: `____________________________`

#### Identificación

- [ ] Identificador Docker/Tenant: `____________________________`
- [ ] Cliente u organización: `____________________________`
- [ ] Dominio: `____________________________`
- [ ] Base de datos: `____________________________`
- [ ] Ruta: `/opt/sgal/deploy/tenants/____________________________`
- [ ] Responsable funcional: `____________________________`
- [ ] Fecha de habilitación: `____ / ____ / ________`

#### Dominio y DNS

- [ ] El dominio o subdominio fue creado en el proveedor DNS.
- [ ] El registro A apunta a la IP pública de este servidor.
- [ ] No existe un registro AAAA incorrecto si el servidor no usa IPv6.
- [ ] `dig +short DOMINIO` devuelve la IP esperada.
- [ ] La propagación DNS terminó antes de solicitar el certificado.
- [ ] Se decidió si también se utilizará el dominio con `www`.
- [ ] Si se usa `www`, su registro DNS y enrutamiento también están configurados.

#### Base de datos

- [ ] Se creó una base de datos exclusiva para esta instancia.
- [ ] Se creó un usuario SQL con permisos mínimos necesarios.
- [ ] La base de datos acepta conexiones desde el servidor Ubuntu.
- [ ] Se configuró cifrado de conexión según la infraestructura disponible.
- [ ] Se realizó un respaldo inicial.
- [ ] Se aplicaron en orden los scripts pendientes de `DatabaseChanges/`.
- [ ] Se registró externamente qué scripts fueron aplicados.
- [ ] Se probó la restauración o existe un procedimiento documentado.

Último script aplicado:

```text

```

#### Variables y secretos

- [ ] La instancia fue creada con `./new-tenant.sh IDENTIFICADOR DOMINIO`.
- [ ] El `.env` pertenece únicamente a esta instancia.
- [ ] `TENANT_NAME` es único en el servidor.
- [ ] `DOMAIN` contiene el dominio correcto.
- [ ] `ConnectionStrings__SgalConnection` apunta a la base correcta.
- [ ] Las credenciales de Mercado Pago están configuradas si corresponde.
- [ ] `MercadoPagoPoint__AllowSimulation` está desactivado en producción.
- [ ] `IMAGE_TAG` apunta a `latest` o a la versión aprobada.
- [ ] El `.env` tiene permisos `600`.
- [ ] Ningún secreto fue agregado a Git.

#### Contenedores y red

- [ ] Las imágenes API y Web fueron descargadas correctamente.
- [ ] `docker compose up -d` terminó sin errores.
- [ ] Los contenedores `api` y `web` están activos.
- [ ] Ambos servicios están conectados a su red interna.
- [ ] El servicio Web está conectado a la red compartida `proxy`.
- [ ] La API no publica directamente un puerto hacia Internet.
- [ ] El frontend no publica directamente un puerto hacia Internet.
- [ ] Los nombres de contenedor/proyecto no colisionan con otra instancia.
- [ ] Los logs no contienen errores repetitivos.

#### HTTPS y aplicación

- [ ] `http://DOMINIO` redirige a `https://DOMINIO`.
- [ ] `https://DOMINIO` abre sin advertencias del navegador.
- [ ] El certificado corresponde al dominio configurado.
- [ ] El certificado fue emitido por una autoridad válida.
- [ ] La aplicación carga sus archivos CSS, JavaScript e imágenes.
- [ ] `/api/health` responde correctamente a través del dominio.
- [ ] El frontend puede comunicarse con la API.
- [ ] No hay errores de contenido mixto HTTP/HTTPS.

#### Pruebas funcionales mínimas

- [ ] Se completó o verificó la configuración inicial de la organización.
- [ ] Se pudo iniciar sesión.
- [ ] Se verificaron roles y permisos.
- [ ] Se probó una operación principal del negocio.
- [ ] Se comprobó persistencia de datos en la base correcta.
- [ ] Se probó carga/visualización de logos o archivos, si aplica.
- [ ] Se probó la generación de PDF, si aplica.
- [ ] Se probaron las funciones de Mercado Pago, si aplica.
- [ ] Se verificó el cierre de sesión.
- [ ] No se observaron errores críticos en los logs después de las pruebas.

#### Cierre de habilitación

- [ ] El cliente confirmó el acceso por el dominio definitivo.
- [ ] Se registró quién conserva las credenciales administrativas iniciales.
- [ ] Se eliminó o cambió cualquier contraseña temporal.
- [ ] La instancia quedó incluida en el proceso de respaldo.
- [ ] La instancia quedó incluida en el monitoreo operativo.
- [ ] Se documentó una versión estable para rollback.
- [ ] La instancia fue aprobada para producción.

Versión inicialmente desplegada:

- Fecha: `____ / ____ / ________`
- Commit/SHA: `____________________________`
- Imagen/Tag: `____________________________`
- Aprobado por: `____________________________`

Observaciones de la instancia:

```text

```

---

## 6. Verificación integral del servidor

- [ ] Todas las instancias responden por HTTPS.
- [ ] Cada dominio dirige únicamente a la instancia que corresponde.
- [ ] Cada instancia utiliza su propia base de datos.
- [ ] Un cambio en una instancia no afecta los datos de otra.
- [ ] El despliegue automático actualiza todas las instancias esperadas.
- [ ] Se verificó que `deploy-all.sh` ignora carpetas que no sean instancias.
- [ ] Se comprobó un rollback usando una etiqueta SHA.
- [ ] Reiniciar Docker o el servidor recupera automáticamente los servicios.
- [ ] Los logs no exponen contraseñas, tokens ni cadenas de conexión.
- [ ] El uso de CPU, memoria y disco está dentro de rangos aceptables.
- [ ] Se configuró rotación o límite de logs de Docker.
- [ ] Se documentó el procedimiento ante caída del servidor.

---

## 7. Respaldo, monitoreo y mantenimiento periódico

### Respaldo

- [ ] Existe respaldo automático de cada base de datos.
- [ ] Existe una política de retención definida.
- [ ] Los respaldos se almacenan fuera del servidor de producción.
- [ ] Se respaldan los archivos de configuración `.env` de forma segura.
- [ ] Se respalda la información necesaria de Let's Encrypt.
- [ ] Se realizó al menos una prueba de restauración.

### Monitoreo

- [ ] Se monitorea disponibilidad HTTPS por dominio.
- [ ] Se monitorea espacio disponible en disco.
- [ ] Se monitorea consumo de memoria y CPU.
- [ ] Se monitorea el estado de los contenedores.
- [ ] Se definió un canal de alerta y una persona responsable.

### Revisión periódica

- [ ] Revisar actualizaciones de seguridad de Ubuntu.
- [ ] Revisar actualizaciones de Docker.
- [ ] Revisar fallos recientes de GitHub Actions.
- [ ] Revisar logs de Traefik, API y Web.
- [ ] Revisar vencimiento y renovación automática de certificados.
- [ ] Revisar tamaño y éxito de los respaldos.
- [ ] Eliminar imágenes Docker antiguas solo después de confirmar el rollback.
- [ ] Revisar usuarios y llaves SSH autorizadas.
- [ ] Probar recuperación ante desastre según la periodicidad acordada.

Próxima revisión programada: `____ / ____ / ________`

---

## 8. Registro de cambios del servidor

| Fecha | Responsable | Instancia | Cambio realizado | Commit/versión | Resultado |
|---|---|---|---|---|---|
| `____/____/______` |  |  |  |  |  |
| `____/____/______` |  |  |  |  |  |
| `____/____/______` |  |  |  |  |  |

## 9. Incidencias pendientes

| Prioridad | Fecha | Instancia | Descripción | Responsable | Estado |
|---|---|---|---|---|---|
| Alta/Media/Baja |  |  |  |  | Pendiente |
| Alta/Media/Baja |  |  |  |  | Pendiente |

## 10. Aprobación final

- [ ] Infraestructura aprobada.
- [ ] Seguridad básica aprobada.
- [ ] Respaldos aprobados.
- [ ] DNS y SSL aprobados.
- [ ] CI/CD aprobado.
- [ ] Todas las instancias fueron aprobadas por sus responsables.

| Rol | Nombre | Fecha | Confirmación |
|---|---|---|---|
| Responsable técnico |  |  |  |
| Responsable del servidor |  |  |  |
| Responsable funcional |  |  |  |
