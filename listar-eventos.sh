#!/bin/bash

# ==============================================================================
# listar-eventos.sh
#
# Lista eventos culturais e infantis na região de Coimbra (e concelhos
# vizinhos) entre agora e uma data limite futura.
#
# A validação de argumentos e do ambiente Docker é feita aqui; toda a lógica
# de datas e de filtragem corre dentro de um container node:alpine, invocando
# o script eventos.js.
#
# Uso: ./listar-eventos.sh <data-limite-AAAA-MM-DD> [filtro-categoria-ou-local]
# Exemplos:
#   ./listar-eventos.sh 2026-12-31
#   ./listar-eventos.sh 2026-12-31 coimbra
#   ./listar-eventos.sh 2026-12-31 infantil
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DATA_REGEX='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
IMAGEM_DOCKER="node:alpine"

uso() {
  echo "Uso: $0 <data-limite-AAAA-MM-DD> [filtro-categoria-ou-local]"
  echo
  echo "Exemplos:"
  echo "  $0 2026-12-31"
  echo "  $0 2026-12-31 coimbra"
  echo "  $0 2026-12-31 infantil"
}

# --- Validação de argumentos --------------------------------------------------
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Erro: número de argumentos inválido." >&2
  uso
  exit 1
fi

DATA_LIMITE="$1"
FILTRO="${2:-}"

if [[ ! "$DATA_LIMITE" =~ $DATA_REGEX ]]; then
  echo "Erro: data limite \"$DATA_LIMITE\" não está no formato AAAA-MM-DD." >&2
  uso
  exit 1
fi

# --- Validação do ambiente Docker --------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: o Docker não está instalado ou não está no PATH." >&2
  echo "Instale o Docker Desktop (macOS/Windows) ou o Docker Engine (Linux) e tente novamente." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Erro: o daemon do Docker não está a responder. Verifique se o Docker está a correr." >&2
  exit 1
fi

# --- Execução dentro do container ---------------------------------------------
echo "A pesquisar eventos até $DATA_LIMITE${FILTRO:+ (filtro: \"$FILTRO\")}..."
echo

docker run --rm --network none \
  -v "$DIR":/app -w /app \
  "$IMAGEM_DOCKER" node eventos.js "$DATA_LIMITE" "$FILTRO"
