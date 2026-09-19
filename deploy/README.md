# Despliegue de SGAL en Ubuntu (Docker + CI/CD + multi-instancia + SSL)

> Para registrar el avance de cada servidor utiliza
> [`SERVER_CHECKLIST.md`](SERVER_CHECKLIST.md).

Esta guia deja el sistema funcionando con:

- **Todo en Docker** en un servidor Ubuntu.
- **Despliegue automatico multi-servidor**: cada `git push` a `main` construye
  las imagenes una sola vez y actualiza todos los servidores registrados.
- **Dominio propio** (NIC Chile) con **HTTPS/SSL automatico** (Let's Encrypt).
- **N instancias en el mismo servidor**, cada una con su **base de datos** y su
  **dominio** distintos.

## Arquitectura

```
                Internet
                   │  (443/80)
            ┌──────▼───────┐
            │   Traefik    │  reverse proxy compartido
            │  (SSL auto)  │  enruta por dominio, emite certificados
            └──┬────────┬──┘
   cliente1.cl │        │ cliente2.cl
        ┌───────▼──┐  ┌──▼───────┐
        │  web     │  │  web     │   nginx + SPA (imagen unica)
        │  api     │  │  api     │   .NET API   (imagen unica)
        └────┬─────┘  └────┬─────┘
             │             │
        BD SGAL_C1     BD SGAL_C2      SQL Server (externo)
```

- Las imagenes (`sgal-app-api`, `sgal-app-web`) son **las mismas** para todos.
  El frontend llama a `/api/...` en forma relativa, asi que una sola imagen
  sirve para cualquier dominio.
- Lo que cambia por cliente es su `.env`: **cadena de conexion** (su BD) y
  **dominio**.
- SQL Server es **externo** (no va en estos contenedores). Puede ser una
  instancia administrada o instalada en otra maquina/host. Cada instancia
  apunta a **su propia base de datos** via la cadena de conexion.

---

## Parte 0 — Requisitos

- Servidor Ubuntu (22.04/24.04) con IP publica fija.
- Puertos **80** y **443** abiertos hacia Internet.
- Acceso SSH al servidor.
- Cuenta de GitHub con el repo `Sebaberrios2097/SGAL-App`.
- Uno o mas dominios/subdominios de NIC Chile.
- Un SQL Server accesible desde el servidor, con una base por cliente.

---

## Parte 1 — Preparar el servidor Ubuntu (una sola vez)

### 1.1 Instalar Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # cerrar sesion y volver a entrar para aplicarlo
```

### 1.2 Firewall (opcional pero recomendado)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 1.3 Clonar el repo y crear la red compartida

```bash
sudo mkdir -p /opt/sgal && sudo chown $USER:$USER /opt/sgal
git clone https://github.com/Sebaberrios2097/SGAL-App.git /opt/sgal
cd /opt/sgal

# Red que comparten Traefik y todas las instancias
docker network create proxy
```

### 1.4 Levantar el reverse proxy (Traefik + SSL)

```bash
cd /opt/sgal/deploy/reverse-proxy
cp .env.example .env
nano .env          # pon tu correo real en ACME_EMAIL
docker compose up -d
docker compose logs -f traefik   # Ctrl+C para salir
```

Traefik queda escuchando en 80/443. Aun no sirve nada porque no hay instancias.

---

## Parte 2 — Dominio en NIC Chile + DNS

Necesitas que cada dominio/subdominio apunte a la IP del servidor.

1. Averigua la IP publica del servidor: `curl -4 ifconfig.me`
2. Entra a tu panel de NIC Chile (`nic.cl`) → tu dominio → **DNS / registros**.
   Tienes dos caminos:

   **Opcion A — usar el DNS de NIC Chile** (mas simple): agrega registros **A**:

   | Tipo | Nombre              | Valor (IP)      |
   |------|---------------------|-----------------|
   | A    | `@` (o `tudominio.cl`) | `TU.IP.PUBLICA` |
   | A    | `www`               | `TU.IP.PUBLICA` |
   | A    | `cliente1`          | `TU.IP.PUBLICA` |
   | A    | `cliente2`          | `TU.IP.PUBLICA` |

   Cada cliente puede ser un **subdominio** (`cliente1.tudominio.cl`) o un
   **dominio distinto** (entonces repites el registro A en ese otro dominio).

   **Opcion B — delegar a otro DNS** (Cloudflare, etc.): cambia los
   *nameservers* en NIC Chile y administra los registros A alla.

3. Espera la propagacion DNS (minutos a algunas horas). Verifica:

   ```bash
   dig +short cliente1.tudominio.cl
   ```

   Debe devolver la IP de tu servidor. **Hasta que el DNS resuelva, Let's
   Encrypt no podra emitir el certificado.**

> **SSL**: no hay pasos manuales de certificado. Cuando la instancia este
> arriba y el dominio resuelva a tu servidor, Traefik pide el certificado a
> Let's Encrypt automaticamente en el primer acceso `https://` y lo renueva
> solo. Se guarda en `deploy/reverse-proxy/letsencrypt/acme.json`.

---

## Parte 3 — Crear la primera instancia (cliente)

En el servidor:

```bash
cd /opt/sgal/deploy
./new-tenant.sh cliente1 cliente1.tudominio.cl
```

Eso crea `deploy/tenants/cliente1/` con su `compose.yaml` y `.env`. Ahora
completa la base de datos del cliente:

```bash
nano tenants/cliente1/.env
```

Ajusta al menos:

- `ConnectionStrings__SgalConnection` → la BD **de este cliente**.
- Credenciales de MercadoPago si aplica.

Prepara la base de datos (una vez por cliente): crea la base en SQL Server y
aplica en orden los scripts de `DatabaseChanges/` (ver Parte 6). Luego:

```bash
cd tenants/cliente1
docker compose pull      # baja las imagenes de GHCR
docker compose up -d
docker compose logs -f
```

Abre `https://cliente1.tudominio.cl`. El candado SSL aparece en segundos.

> Si las imagenes aun no existen en GHCR, primero haz un push a `main` (Parte 5)
> o publicalas manualmente (Parte 7).

---

## Parte 4 — Agregar mas instancias (cliente N)

Repetir es trivial y **no toca configuracion central**:

```bash
cd /opt/sgal/deploy
./new-tenant.sh cliente2 cliente2.tudominio.cl
nano tenants/cliente2/.env      # su propia BD y dominio
cd tenants/cliente2 && docker compose up -d
```

Asegurate de que el DNS de ese dominio apunte al servidor (Parte 2). Traefik
detecta la nueva instancia por sus *labels* y emite su SSL solo. Puedes tener
N clientes, cada uno con su BD y su dominio, en el mismo servidor.

---

## Parte 5 — CI/CD multi-servidor: push a `main` → despliegue automatico

El workflow `.github/workflows/deploy.yml` hace, en cada push a `main`:

1. Construye las imagenes API y Web.
2. Las publica en GHCR (`ghcr.io/sebaberrios2097/sgal-app-*`).
3. Lee la lista de GitHub Environments configurada en `DEPLOY_ENVIRONMENTS`.
4. Entra por SSH a cada servidor y corre `deploy/deploy-all.sh`, que baja las
   imagenes nuevas y reinicia las instancias alojadas en ese servidor.

Las imagenes son comunes a todos los servidores. Cada servidor conserva sus
propios archivos `deploy/tenants/*/.env`; el workflow no los copia, modifica ni
almacena en GitHub. Por eso cada servidor puede usar dominios, bases de datos y
credenciales diferentes con la misma version de la aplicacion.

### 5.1 Crear una llave SSH por servidor

Repite este proceso para cada servidor. Usa nombres distintos para no mezclar
las llaves, por ejemplo:

```bash
ssh-keygen -t ed25519 -C "github-deploy-sgal-produccion-01" -f deploy_key_produccion_01 -N ""
```

- Copia la **publica** de esa llave al servidor correspondiente:

  ```bash
  ssh-copy-id -i deploy_key_produccion_01.pub USUARIO@IP_SERVIDOR
  # o: agrega su contenido a ~/.ssh/authorized_keys en el servidor
  ```

- Guarda la **privada** en el GitHub Environment de ese servidor (siguiente
  paso). No reutilices una misma llave entre servidores.

### 5.2 Crear un GitHub Environment por servidor

En el repositorio ve a **Settings → Environments → New environment** y crea un
Environment por servidor. Ejemplo:

- `produccion-01`
- `produccion-02`
- `pruebas-01`

Dentro de cada Environment agrega estos secrets. Los nombres se repiten; los
valores son propios de cada servidor:

| Secret            | Valor                                              |
|-------------------|----------------------------------------------------|
| `DEPLOY_HOST`     | IP publica del servidor                            |
| `DEPLOY_USER`     | usuario SSH (ej. `ubuntu`)                          |
| `DEPLOY_SSH_KEY`  | contenido completo de `deploy_key` (privada)       |
| `DEPLOY_PATH`     | `/opt/sgal`                                         |
| `DEPLOY_PORT`     | `22` (opcional, si usas otro puerto)               |

`GITHUB_TOKEN` es automatico: el workflow lo usa para publicar en GHCR y para
que cada servidor haga login temporal y baje las imagenes. Si los paquetes
pertenecen a otra organizacion o repositorio, usa un token de solo lectura para
paquetes como secret adicional y adapta el login del workflow.

Opcionalmente, en cada Environment puedes configurar **Required reviewers**
para exigir una aprobacion manual antes de desplegar en ese servidor.

### 5.3 Registrar la lista de servidores

Ve a **Settings → Secrets and variables → Actions → Variables → New repository
variable** y crea:

| Variable | Valor JSON |
|---|---|
| `DEPLOY_ENVIRONMENTS` | `["produccion-01","produccion-02","pruebas-01"]` |

Los nombres deben coincidir exactamente con los GitHub Environments. Para
agregar o retirar un servidor, actualiza esta lista; no es necesario modificar
el workflow. No dejes una coma despues del ultimo elemento.

### 5.4 Probar

```bash
git add .
git commit -m "Configura despliegue Docker + CI/CD + multi-instancia"
git push origin main
```

Mira el avance en la pestana **Actions**. Aparecera un job `Deploy (...)` por
servidor. Un fallo no cancela automaticamente los despliegues de los otros
servidores. Al terminar, cada servidor conserva su configuracion local y queda
actualizado a la misma imagen.

Para verificar un servidor, revisa su job individual y luego ejecuta alli:

```bash
cd /opt/sgal
git rev-parse HEAD
docker ps
```

> **Rollback**: en el `.env` de una instancia cambia `IMAGE_TAG=latest` por un
> SHA de commit (`IMAGE_TAG=<sha>`) y `docker compose up -d`. Las imagenes se
> etiquetan con `latest` y con el SHA en cada build.

---

## Parte 6 — Cambios de base de datos

El despliegue automatico **no** ejecuta migraciones de BD (es intencional: es
riesgoso hacerlo sin respaldo). Cuando un release incluya scripts nuevos en
`DatabaseChanges/`:

1. Respalda la base del cliente.
2. Aplica en orden los scripts pendientes contra **su** base.
3. Repite por cada cliente afectado.

---

## Parte 7 — Publicar imagenes manualmente (opcional)

Util para el primer arranque o para probar sin CI:

```bash
# En tu maquina, autenticado en GHCR (usa un token con write:packages)
echo <TOKEN> | docker login ghcr.io -u sebaberrios2097 --password-stdin
docker compose build
docker compose push
```

---

## Comandos utiles en el servidor

```bash
# Estado de una instancia
cd /opt/sgal/deploy/tenants/cliente1 && docker compose ps

# Logs
docker compose logs -f api
docker compose logs -f web

# Reiniciar / detener una instancia
docker compose restart
docker compose down

# Ver certificados / logs del proxy
cd /opt/sgal/deploy/reverse-proxy && docker compose logs -f traefik

# Actualizar todo a mano (lo mismo que hace el CI)
bash /opt/sgal/deploy/deploy-all.sh
```

## Notas de seguridad

- Nunca subas los `.env` reales a Git (ya estan en `.gitignore`).
- Restringe el acceso directo a SQL Server (solo desde el servidor).
- No expongas el dashboard de Traefik en produccion sin autenticacion.
- SQL Server oficial corre en Linux x86-64; en ARM debe estar en otra maquina.
