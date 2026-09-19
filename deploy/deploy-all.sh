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
    ( cd "$dir" && docker compose pull && docker compose up -d )
  fi
done

# 3) Limpia imagenes viejas para no llenar el disco
echo "==> Limpieza de imagenes sin uso"
docker image prune -f >/dev/null 2>&1 || true

echo "==> Listo."
