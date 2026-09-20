# Despliegue de SGAL en Ubuntu

Guía para instalar SGAL con Docker, Traefik, HTTPS automático, múltiples
instancias y despliegue continuo desde GitHub Actions.

> Para registrar el avance de cada servidor utiliza
> [`SERVER_CHECKLIST.md`](SERVER_CHECKLIST.md).

## Qué instala esta guía

- Una imagen Docker para la API .NET.
- Una imagen Docker para el frontend React/Nginx.
- Un Traefik compartido por servidor para HTTPS y enrutamiento por dominio.
- Una o más instancias SGAL por servidor.
- Un `.env` independiente por instancia, con su dominio y base de datos.
- Un workflow que construye las imágenes una sola vez y despliega en los
  servidores registrados.

```text
                         Internet
                            │
                       puertos 80/443
                            │
                      ┌─────▼─────┐
                      │  Traefik  │
                      │ SSL + DNS │
                      └──┬─────┬──┘
          cliente-a.cl   │     │   cliente-b.cl
                   ┌─────▼─┐ ┌─▼─────┐
                   │ web A │ │ web B │
                   │ api A │ │ api B │
                   └───┬───┘ └───┬───┘
                       │         │
                     BD A      BD B
```

Las imágenes son iguales para todos los clientes. Lo que cambia en cada
instancia es el `.env`. Los `.env` reales permanecen únicamente en el servidor
y nunca se guardan en GitHub.

---

## 0. Requisitos

- Ubuntu 22.04 o 24.04 con IP pública fija.
- Acceso SSH al servidor.
- Puertos TCP 80 y 443 abiertos.
- Un dominio o subdominio por instancia.
- SQL Server accesible desde el servidor Ubuntu.
- Una base de datos independiente por cliente.
- Repositorio `Sebaberrios2097/SGAL-App`.

---

## 1. Preparar Ubuntu

### 1.1 Instalar Docker y Git

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Cierra la sesión SSH y vuelve a entrar. Verifica:

```bash
docker version
docker compose version
```

### 1.2 Configurar el firewall

```bash
# Si SSH usa el puerto estándar
sudo ufw allow OpenSSH

# Si SSH usa un puerto distinto, por ejemplo 22022
sudo ufw allow 22022/tcp

sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Revisa también el firewall del proveedor del VPS.

### 1.3 Clonar el repositorio

```bash
sudo mkdir -p /opt/sgal
sudo chown "$USER:$USER" /opt/sgal
git clone https://github.com/Sebaberrios2097/SGAL-App.git /opt/sgal
cd /opt/sgal
```

> **Si Bash dice `No such file or directory` mostrando una URL entre
> corchetes:** se copió un enlace Markdown. Usa solamente la URL, sin
> `[texto](url)`.

Si `/opt/sgal` ya existe y está vacío:

```bash
cd /opt/sgal
git clone https://github.com/Sebaberrios2097/SGAL-App.git .
```

Si ya contiene un clon válido, no lo elimines. Actualízalo:

```bash
cd /opt/sgal
git pull --ff-only origin main
```

No borres un clon que ya contenga `.env`, certificados o configuraciones.

### 1.4 Crear la red compartida

```bash
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy
```

> **Si aparece `network with name proxy already exists`:** no es un fallo. La
> red ya existe. No la elimines si hay contenedores conectados.

---

## 2. Levantar Traefik y HTTPS

Traefik se instala una sola vez por servidor.

```bash
cd /opt/sgal/deploy/reverse-proxy
cp .env.example .env
nano .env
```

Configura un correo real:

```env
ACME_EMAIL=correo@dominio.cl
```

Luego:

```bash
chmod 600 .env
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 traefik
```

### Si no existe `deploy/reverse-proxy`

El servidor no tiene los cambios de despliegue. Confirma que se enviaron a
GitHub y actualiza:

```bash
cd /opt/sgal
git pull --ff-only origin main
ls -la deploy/reverse-proxy
```

### Si el `.env` no contiene `ACME_EMAIL`

Se abrió el archivo equivocado. El de Traefik está en:

```text
/opt/sgal/deploy/reverse-proxy/.env
```

El de cada cliente está en:

```text
/opt/sgal/deploy/tenants/CLIENTE/.env
```

### Si Traefik informa `client version 1.24 is too old`

Una versión antigua de Traefik usa una API Docker obsoleta. El compose fija
Traefik `v3.6.16`. Actualiza y recrea solamente el proxy:

```bash
cd /opt/sgal
git pull --ff-only origin main
cd deploy/reverse-proxy
docker compose pull traefik
docker compose up -d --force-recreate traefik
docker compose exec traefik traefik version
docker compose logs --tail=100 traefik
```

No elimines la red `proxy`, las instancias ni `letsencrypt/acme.json`.

---

## 3. Configurar DNS

Obtén la IP pública:

```bash
curl -4 ifconfig.me
```

En NIC Chile o en el proveedor DNS crea un registro A:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `cliente1` | `IP_PUBLICA_DEL_SERVIDOR` |

Para un dominio raíz utiliza `@`. Verifica la propagación:

```bash
dig +short cliente1.tudominio.cl
```

Debe devolver la IP del VPS. Let's Encrypt no podrá emitir el certificado si
el DNS es incorrecto o los puertos 80/443 están cerrados. Los certificados se
guardan en `deploy/reverse-proxy/letsencrypt/acme.json`.

---

## 4. Crear una instancia

Usa un identificador en minúsculas, sin espacios y único en el servidor:

```bash
cd /opt/sgal/deploy
./new-tenant.sh cliente1 cliente1.tudominio.cl
```

Esto crea `deploy/tenants/cliente1/compose.yaml` y su `.env`.

### Si aparece `Permission denied`

```bash
cd /opt/sgal
git pull --ff-only origin main
chmod +x deploy/new-tenant.sh deploy/deploy-all.sh
```

También puedes ejecutar:

```bash
bash /opt/sgal/deploy/new-tenant.sh cliente1 cliente1.tudominio.cl
```

Los commits se hacen desde el computador de desarrollo, no desde el VPS. Si
GitHub solicita una contraseña al hacer `git push`, utiliza SSH o un token;
GitHub no acepta la contraseña de la cuenta para Git.

---

## 5. Configurar la instancia y SQL Server

```bash
cd /opt/sgal/deploy/tenants/cliente1
nano .env
chmod 600 .env
```

Ejemplo:

```env
TENANT=cliente1
DOMAIN=cliente1.tudominio.cl
IMAGE_TAG=latest
ConnectionStrings__SgalConnection='Server=SQL_HOST,1433;Database=SGAL_CLIENTE1;User Id=USUARIO;Password=CONTRASEÑA;Encrypt=True;TrustServerCertificate=False;'
MercadoPagoPoint__AccessToken=
MercadoPagoPoint__TerminalId=
MercadoPagoPoint__WebhookSecret=
MercadoPagoPoint__AllowSimulation=false
```

No subas este archivo a Git ni compartas capturas con contraseñas.

### Si SQL Server está en el mismo VPS

Dentro de un contenedor, `localhost` apunta al contenedor. Utiliza:

```text
Server=host.docker.internal,1433
```

### Si SQL Server utiliza otro puerto

SQL Server usa una coma entre host y puerto:

```text
Server=sql.ejemplo.cl,49152
```

Comprueba la red desde el VPS:

```bash
sudo apt-get install -y netcat-openbsd
nc -vz -w 5 sql.ejemplo.cl 49152
```

Si expira, revisa host, puerto, TCP/IP de SQL Server, conexiones remotas,
firewall y autorización de la IP pública del VPS.

### Si SQL Server usa un certificado autofirmado

Si el log indica:

```text
A connection was successfully established with the server
Certificate failed chain validation
self-signed certificate
Certificate name mismatch
```

la red funciona, pero el certificado no es confiable. En infraestructura
controlada puedes usar:

```text
Encrypt=True;TrustServerCertificate=True;
```

La comunicación permanece cifrada, pero no se valida la identidad del
certificado. La solución más estricta es instalar un certificado confiable que
incluya el hostname de SQL Server.

### Interpretación de errores SQL

| Mensaje o código | Significado | Solución |
|---|---|---|
| Error `258` / timeout | Host o puerto inaccesible | Probar con `nc`, revisar firewall y dirección |
| `ClientConnectionId: 0000...` | No alcanzó la autenticación | Revisar primero la red |
| `Certificate failed chain validation` | Certificado no confiable | Certificado válido o `TrustServerCertificate=True` |
| `Certificate name mismatch` | Hostname distinto al certificado | Corregir certificado/hostname o confiar explícitamente |
| Error `18456` / `Login failed` | Login SQL rechazado | Revisar usuario, contraseña y permisos |
| `Cannot open database` | Base ausente o sin autorización | Crear/asignar la base y permisos |

---

## 6. Descargar y levantar la instancia

```bash
cd /opt/sgal/deploy/tenants/cliente1
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 api web
```

### Si GHCR responde `denied`

Las imágenes son privadas y el servidor no está autenticado, o todavía no
fueron publicadas. Verifica que existan `sgal-app-api` y `sgal-app-web`.

Para un pull manual crea un Personal Access Token **classic** con
`read:packages`:

```bash
read -rsp "Token GHCR: " GHCR_TOKEN
echo
printf '%s' "$GHCR_TOKEN" \
  | docker login ghcr.io -u Sebaberrios2097 --password-stdin
unset GHCR_TOKEN
docker compose pull
```

### Si modificaste el `.env`

Un `restart` puede conservar las variables anteriores. Recrea la API:

```bash
docker compose up -d --force-recreate --no-deps api
docker compose logs --tail=100 api
```

Para recrear toda la instancia:

```bash
docker compose up -d --force-recreate
```

No necesitas ejecutar `down`, borrar imágenes ni eliminar redes.

### Verificar la aplicación

```bash
curl -i https://cliente1.tudominio.cl/api/health
```

Luego abre `https://cliente1.tudominio.cl`.

---

## 7. Agregar más clientes

Repite las partes 4 a 6:

```bash
cd /opt/sgal/deploy
./new-tenant.sh cliente2 cliente2.tudominio.cl
nano tenants/cliente2/.env
chmod 600 tenants/cliente2/.env
cd tenants/cliente2
docker compose pull
docker compose up -d
```

Cada cliente usa su red interna, dominio, `.env` y base de datos.

---

## 8. CI/CD multi-servidor

En cada push a `main`, `.github/workflows/deploy.yml`:

1. Construye API y Web una sola vez.
2. Publica las imágenes en GHCR con `latest` y el SHA.
3. Lee `DEPLOY_ENVIRONMENTS`.
4. Crea un job por servidor.
5. Entra por SSH y ejecuta `deploy-all.sh`.

Los `.env` locales no se reemplazan.

### 8.1 Crear una llave SSH por servidor

```bash
ssh-keygen -t ed25519 \
  -C "github-actions-sgal-produccion-01" \
  -f sgal_deploy_produccion_01 \
  -N ""
```

- Instala la `.pub` en `~/.ssh/authorized_keys` del VPS.
- Guarda la llave privada completa como `DEPLOY_SSH_KEY`.
- No subas llaves al repositorio.
- Usa una llave diferente por servidor.

Prueba la conexión, adaptando puerto y usuario:

```bash
ssh -i sgal_deploy_produccion_01 -p 22022 root@IP_DEL_SERVIDOR
```

### 8.2 Crear los GitHub Environments

En **Settings → Environments**, crea `produccion-01`, `produccion-02`, etc.
Agrega en cada uno:

| Secret | Ejemplo |
|---|---|
| `DEPLOY_HOST` | IP o hostname, sin `https://` ni `usuario@` |
| `DEPLOY_USER` | `root` o usuario de despliegue |
| `DEPLOY_SSH_KEY` | Llave privada OpenSSH completa |
| `DEPLOY_PATH` | `/opt/sgal` |
| `DEPLOY_PORT` | `22`, `22022`, etc. |

La llave privada debe incluir `BEGIN OPENSSH PRIVATE KEY` y
`END OPENSSH PRIVATE KEY`.

> **Repositorio privado con GitHub Free:** los Environment secrets no están
> disponibles. Para un solo servidor crea los mismos cinco valores como
> **Repository secrets** en **Settings → Secrets and variables → Actions**.
> Para credenciales separadas de varios servidores utiliza GitHub
> Pro/Team/Enterprise o adapta el workflow a Repository secrets sufijados.

### 8.3 Registrar los servidores

En **Settings → Secrets and variables → Actions → Variables → Repository
variables**, crea:

```text
Nombre: DEPLOY_ENVIRONMENTS
Valor:  ["produccion-01","produccion-02"]
```

Aunque haya un solo servidor, debe ser un arreglo JSON:

```json
["produccion-01"]
```

No uses solamente `produccion-01`.

### Errores frecuentes de GitHub Actions

#### `fromJSON: empty input` o `Unexpected value ''`

`DEPLOY_ENVIRONMENTS` falta, está vacío o se creó en el lugar incorrecto. Debe
ser una **Repository variable**, no un secret ni una Environment variable.

#### `missing server host`

La acción recibió vacío `${{ secrets.DEPLOY_HOST }}`. Revisa que el secret
exista en el Environment que muestra el job. Si el repo es privado con GitHub
Free, utiliza Repository secrets o cambia de plan.

#### `connection refused` o `i/o timeout`

Revisa `DEPLOY_HOST`, `DEPLOY_PORT`, UFW, firewall del proveedor y que SSH esté
escuchando en ese puerto.

#### `handshake failed` o `Permission denied (publickey)`

La llave privada no corresponde a la pública, el usuario es incorrecto o
`authorized_keys` tiene permisos inválidos:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

#### El build está verde, pero el workflow completo falla

Build y deploy son jobs distintos. Las imágenes pueden publicarse correctamente
aunque falle la matriz o SSH. Abre el job `Deploy (...)` y revisa su primer
error.

---

## 9. Cambios de base de datos

El workflow no ejecuta migraciones automáticamente:

1. Respalda la base del cliente.
2. Revisa los scripts nuevos en `DatabaseChanges/`.
3. Ejecútalos en orden contra la base correcta.
4. Registra el último script aplicado.
5. Repite por cada cliente afectado.

---

## 10. Comandos operativos

```bash
# Estado y logs
cd /opt/sgal/deploy/tenants/cliente1
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web

# Recrear API después de cambiar .env
docker compose up -d --force-recreate --no-deps api

# Reiniciar sin cambiar variables
docker compose restart

# Detener una instancia
docker compose down

# Proxy
cd /opt/sgal/deploy/reverse-proxy
docker compose logs --tail=100 traefik

# Actualizar todas las instancias
bash /opt/sgal/deploy/deploy-all.sh
```

### Rollback

Cambia `IMAGE_TAG=latest` por el SHA estable en el `.env` y ejecuta:

```bash
docker compose pull
docker compose up -d
```

---

## 11. Diagnóstico rápido: “si pasa esto, haz esto”

| Síntoma | Qué significa | Qué hacer |
|---|---|---|
| URL con corchetes produce `No such file` | Se copió Markdown | Usar la URL plana |
| `network proxy already exists` | La red ya existe | Continuar, no eliminarla |
| No existe `deploy/reverse-proxy` | Repo desactualizado | Hacer push y luego `git pull` |
| `.env` no contiene `ACME_EMAIL` | Archivo equivocado | Editar `deploy/reverse-proxy/.env` |
| Traefik usa API Docker 1.24 | Imagen antigua | Actualizar/recrear Traefik `v3.6.16` |
| Script: `Permission denied` | Falta permiso ejecutable | `chmod +x` o ejecutar con `bash` |
| GHCR devuelve `denied` | Registro privado sin login | PAT classic `read:packages` + login |
| `fromJSON: empty input` | Falta variable de servidores | Crear `DEPLOY_ENVIRONMENTS` como JSON |
| `missing server host` | `DEPLOY_HOST` no llega al job | Revisar secrets, Environment y plan |
| Cambio de `.env` no se refleja | Variables antiguas | Recrear con `--force-recreate` |
| SQL timeout/error 258 | No llega al host/puerto | Probar `nc`, firewall y TCP SQL |
| SQL conecta pero falla TLS | Certificado no confiable | Certificado válido o confiar explícitamente |
| SQL error 18456 | Login rechazado | Revisar usuario, contraseña y permisos |
| HTTPS sin certificado | DNS o puertos incorrectos | Verificar A, 80/443 y logs de Traefik |

---

## 12. Seguridad y mantenimiento

- Nunca subas `.env`, tokens, contraseñas ni llaves privadas a Git.
- Usa permisos `600` para `.env` y `authorized_keys`.
- Restringe SQL Server a las IP necesarias.
- No expongas el dashboard de Traefik sin autenticación.
- Respalda las bases de datos fuera del servidor.
- Respalda de forma segura `letsencrypt/acme.json`.
- Revisa disco, logs y contenedores periódicamente.
- Las advertencias de ASP.NET sobre `DataProtection-Keys` no impiden arrancar,
  pero indican que las sesiones pueden invalidarse al recrear la API. Conviene
  persistir esas claves en un volumen protegido.
- SQL Server oficial para Linux requiere x86-64; en ARM debe ejecutarse en otra
  máquina compatible.
