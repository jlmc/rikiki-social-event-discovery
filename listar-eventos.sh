#!/bin/bash

# ==============================================================================
# listar-eventos.sh
#
# Lista eventos culturais e infantis na região de Coimbra (e concelhos
# vizinhos) entre agora e uma data limite futura.
#
# Pipeline em dois passos, cada um no seu próprio container node:24-alpine
# (versão fixa, em vez da tag flutuante "alpine"):
#   1) recolher-eventos.js — COM rede: faz scraping de fontes reais
#      (agenda.coimbra.pt, viralagenda.com) e escreve eventos.json.
#   2) listar-eventos.js   — SEM rede (--network none): lê eventos.json e
#      filtra/imprime os resultados. Nunca tem acesso à rede, mesmo tendo
#      acabado de instalar uma dependência de terceiros (cheerio) no passo 1.
# A validação de argumentos e do ambiente Docker é feita aqui, em Bash.
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
# Node 24 é a Active LTS atual (desde 2025-10-28); fixar a versão evita que a
# tag "alpine" (flutuante, apontando sempre para a última "latest") mude o
# comportamento do script sem aviso entre execuções.
IMAGEM_DOCKER="node:24-alpine"

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

# --- Passo 1: recolha (com rede) ----------------------------------------------
echo "A recolher eventos de fontes reais (agenda.coimbra.pt, viralagenda.com)..."

docker run --rm \
  -v "$DIR":/app -w /app \
  "$IMAGEM_DOCKER" sh -c "npm install --silent --no-audit --no-fund && node recolher-eventos.js"

echo

# --- Passo 2: apresentação (sem rede) ------------------------------------------
echo "A pesquisar eventos até $DATA_LIMITE${FILTRO:+ (filtro: \"$FILTRO\")}..."
echo

docker run --rm --network none \
  -v "$DIR":/app -w /app \
  "$IMAGEM_DOCKER" node listar-eventos.js "$DATA_LIMITE" "$FILTRO"
