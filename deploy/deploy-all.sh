#!/usr/bin/env bash
# Actualiza TODAS las instancias a la ultima imagen publicada en GHCR.
# Lo ejecuta el pipeline de CI por SSH, o puedes correrlo a mano en el servidor.
# Requisitos previos en el servidor:
#   - Red 'proxy' creada:            docker network create proxy
#   - Reverse proxy levantado:       cd deploy/reverse-proxy && docker compose up -d
#   - Sesion en GHCR iniciada:       docker login ghcr.io ...
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TENANTS_DIR="${BASE_DIR}/tenants"
LIBREDTE_OVERLAY="${BASE_DIR}/tenant-template/compose.libredte.yaml"
LICENSING_OVERLAY="${BASE_DIR}/tenant-template/compose.licensing.yaml"

# 1) Asegura el reverse proxy (idempotente)
if [[ -d "${BASE_DIR}/reverse-proxy" ]]; then
  echo "==> Reverse proxy"
  ( cd "${BASE_DIR}/reverse-proxy" && docker compose up -d )
fi

# 2) Recorre cada instancia: baja imagenes nuevas y reinicia sin downtime perceptible
if [[ ! -d "$TENANTS_DIR" ]]; then
  echo "No hay carpeta de tenants (${TENANTS_DIR}). Nada que desplegar."
  exit 0
fi

shopt -s nullglob
for dir in "${TENANTS_DIR}"/*/; do
  if [[ -f "${dir}/compose.yaml" ]]; then
    echo "==> Desplegando $(basename "$dir")"
    (
      cd "$dir"
      # El overlay de licencia se aplica siempre para actualizar también tenants
      # antiguos sin sobrescribir sus compose.yaml personalizados.
      compose_args=(-f compose.yaml -f "$LICENSING_OVERLAY")

      # Los tenants creados antes de LibreDTE conservan su compose local. Se les
      # aplica un overlay versionado sin sobrescribir personalizaciones del servidor.
      if ! docker compose -f compose.yaml config --services | grep -qx 'libredte'; then
        compose_args+=(-f "$LIBREDTE_OVERLAY")
      fi

      docker compose "${compose_args[@]}" pull
      docker compose "${compose_args[@]}" up -d

      # Los volúmenes creados por versiones antiguas pueden pertenecer a root.
      # Normaliza sus permisos con el APP_UID de la propia imagen y reinicia la API
      # para que la activación inicial se reintente inmediatamente.
      docker compose "${compose_args[@]}" exec -T --user root api sh -c '
        uid="${APP_UID:-1654}"
        mkdir -p /app/dp-keys /app/license-data
        chown -R "$uid:$uid" /app/dp-keys /app/license-data
      '
      docker compose "${compose_args[@]}" restart api
    )
  fi
done

# 3) Limpia imagenes viejas para no llenar el disco
echo "==> Limpieza de imagenes sin uso"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Listo."
