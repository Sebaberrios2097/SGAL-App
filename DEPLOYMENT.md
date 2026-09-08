# Despliegue en Ubuntu con Docker

Este repositorio publica la API ASP.NET en GitHub Container Registry (GHCR).
Cada `push` a `master` genera una imagen etiquetada con el SHA del commit y
actualiza únicamente el servicio `api` del VPS por SSH. El frontend tiene su
propio workflow en `SieteVidas_Frontend`.

## 1. Preparar el VPS una sola vez

Instala Docker Engine y el plugin Docker Compose siguiendo la documentación
oficial de Docker para Ubuntu. El usuario SSH utilizado por GitHub Actions debe
poder ejecutar `docker` sin `sudo`.

```bash
mkdir -p "$HOME/sietevidas"
cd "$HOME/sietevidas"
nano .env
```

Usa `.env.example` como referencia. La cadena SQL y las credenciales de Mercado
Pago deben existir únicamente en este archivo del servidor. Protege el archivo:

```bash
chmod 600 "$HOME/sietevidas/.env"
```

Si la base SQL está fuera del VPS, permite su puerto solo desde la IP del
servidor. Si está instalada en el mismo VPS, usa `host.docker.internal` como host
en la cadena de conexión; `compose.yaml` enlaza ese nombre con el host Docker.

## 2. Crear una llave SSH de despliegue

Desde un equipo seguro, crea una llave dedicada sin contraseña:

```bash
ssh-keygen -t ed25519 -C "github-actions-sietevidas" -f ./sietevidas_deploy
ssh-copy-id -i ./sietevidas_deploy.pub usuario@IP_DEL_VPS
```

Guarda la llave privada en GitHub y elimina la copia local cuando hayas verificado
el acceso. No reutilices la llave personal del administrador.

## 3. Configurar el environment de GitHub

En el repositorio, crea el environment `production` y agrega estos secretos:

| Secreto | Contenido |
| --- | --- |
| `VPS_HOST` | IP o dominio del VPS |
| `VPS_USER` | Usuario SSH con acceso a Docker |
| `VPS_SSH_PORT` | Puerto SSH; opcional, por defecto `22` |
| `VPS_SSH_PRIVATE_KEY` | Contenido completo de `sietevidas_deploy` |
| `VPS_KNOWN_HOSTS` | Clave pública del host SSH |

Obtén `VPS_KNOWN_HOSTS` desde una conexión confiable (sustituye el puerto si no
es 22) y comprueba la huella antes de guardarla:

```bash
ssh-keyscan -p 22 -H IP_DEL_VPS
```

El workflow usa el `GITHUB_TOKEN` efímero para publicar y descargar su propia
imagen privada; no hace falta crear un token personal de GitHub.

## 4. Primer despliegue y actualizaciones

Al subir un commit a `master` de la API, el workflow:

1. compila y publica la imagen de la API en GHCR;
2. copia `compose.yaml` a `~/sietevidas`;
3. descarga exactamente la imagen del SHA publicado;
4. recrea únicamente el contenedor `api`, sin tocar `web` ni `.env`.

Para el primer despliegue ejecuta primero este workflow y luego el workflow del
frontend. Ambos repositorios deben tener los mismos secretos de `production`.

La aplicación queda en el puerto indicado por `APP_PORT` (80 por defecto). Abre
ese puerto en el firewall del VPS. Para HTTPS y un dominio, coloca Caddy o el
Nginx del host delante del puerto de la aplicación y configura el certificado.

Comandos útiles en el VPS:

```bash
cd "$HOME/sietevidas"
docker compose ps
docker compose logs -f --tail=200
```

Para volver manualmente la API a un commit anterior, usa su SHA publicado:

```bash
API_TAG=SHA_ANTERIOR docker compose pull api
API_TAG=SHA_ANTERIOR docker compose up -d --no-deps api
```
