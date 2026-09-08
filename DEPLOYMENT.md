# Despliegue en Ubuntu con Docker

La aplicación publica dos imágenes en GitHub Container Registry (GHCR): la API
ASP.NET y el frontend React servido por Nginx. Cada `push` a `master` genera
imágenes etiquetadas con el SHA del commit y actualiza el VPS por SSH.

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

Si la base SQL está fuera del VPS, permite el puerto 1433 solo desde la IP del
servidor. Si está en el host Docker, no uses `localhost` como nombre del servidor:
usa una IP alcanzable desde el contenedor.

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

El workflow usa el `GITHUB_TOKEN` efímero para descargar las imágenes privadas;
no hace falta crear un token personal de GitHub.

## 4. Primer despliegue y actualizaciones

Confirma que `frontend/` y los archivos de despliegue estén incluidos en el
commit. Al subir el commit a `master`, el workflow:

1. compila y publica ambas imágenes en GHCR;
2. copia `compose.yaml` a `~/sietevidas`;
3. descarga exactamente las imágenes del SHA publicado;
4. recrea los contenedores sin tocar `.env`.

La aplicación queda en el puerto indicado por `APP_PORT` (80 por defecto). Abre
ese puerto en el firewall del VPS. Para HTTPS y un dominio, coloca Caddy o el
Nginx del host delante del puerto de la aplicación y configura el certificado.

Comandos útiles en el VPS:

```bash
cd "$HOME/sietevidas"
docker compose ps
docker compose logs -f --tail=200
```

Para volver manualmente a un commit anterior, usa su SHA publicado:

```bash
IMAGE_TAG=SHA_ANTERIOR docker compose pull
IMAGE_TAG=SHA_ANTERIOR docker compose up -d
```
