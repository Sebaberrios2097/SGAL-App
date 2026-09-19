#!/usr/bin/env bash
# Crea una nueva instancia (tenant) de SGAL en el servidor.
# Uso:  ./new-tenant.sh <nombre> <dominio>
# Ej.:  ./new-tenant.sh cliente2 cliente2.tudominio.cl
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TENANTS_DIR="${BASE_DIR}/tenants"
TEMPLATE_DIR="${BASE_DIR}/tenant-template"

NAME="${1:-}"
DOMAIN="${2:-}"

if [[ -z "$NAME" || -z "$DOMAIN" ]]; then
  echo "Uso: $0 <nombre> <dominio>" >&2
  echo "Ej.: $0 cliente2 cliente2.tudominio.cl" >&2
  exit 1
fi

DEST="${TENANTS_DIR}/${NAME}"
if [[ -d "$DEST" ]]; then
  echo "Ya existe la instancia '${NAME}' en ${DEST}" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "${TEMPLATE_DIR}/compose.yaml" "${DEST}/compose.yaml"
cp "${TEMPLATE_DIR}/.env.example" "${DEST}/.env"

# Prellenar TENANT y DOMAIN en el .env nuevo
sed -i "s/^TENANT=.*/TENANT=${NAME}/" "${DEST}/.env"
sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" "${DEST}/.env"
chmod 600 "${DEST}/.env"

echo "Instancia creada en: ${DEST}"
echo
echo "SIGUIENTE PASO (obligatorio):"
echo "  1) Edita ${DEST}/.env con la cadena de conexion de la BD del cliente."
echo "  2) Verifica que ${DOMAIN} apunte (DNS) a este servidor."
echo "  3) Levantala:  cd ${DEST} && docker compose up -d"
echo "     (Traefik emitira el certificado SSL en el primer acceso https.)"
