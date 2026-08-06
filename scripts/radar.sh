#!/bin/bash
# Radar de pauta — roda sozinho e deixa carrossel meio pronto esperando.
#
# 1. Busca o que explodiu nos ultimos 30 dias no territorio da conta.
# 2. Ranqueia pelo formato de gancho calibrado nos 121 posts de @saraiva.ai.
# 3. Escreve um brief datado em content/radar/.
#
# Nada e publicado automaticamente. O radar entrega pauta; quem posta e voce.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/content/radar"
DIA="$(date +%Y-%m-%d)"
mkdir -p "$OUT"

# Territorio da conta: temas que a auditoria mostrou que puxam DM de verdade.
# 50% das 1.299 conversas vieram de sites/prompt; 19% de IA de ligacao.
CONSULTAS=(
  "WhatsApp Business AI agents"
  "ChatGPT building websites for clients"
  "AI voice agents phone calls"
  "what's exploding in AI agents?"
)
IDX=$(( $(date +%-j) % ${#CONSULTAS[@]} ))
CONSULTA="${CONSULTAS[$IDX]}"

log() { printf '[radar %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# Prefere o script Python da skill (deterministico) e cai para o Claude headless.
SKILL_SCRIPT="$(find "$HOME/.claude/plugins" "$HOME/.claude/skills" \
  -name 'last30days.py' -maxdepth 8 2>/dev/null | head -1)"

RAW="$OUT/.raw-$DIA.json"

if [ -n "$SKILL_SCRIPT" ]; then
  log "usando skill local: $SKILL_SCRIPT"
  python3 "$SKILL_SCRIPT" "$CONSULTA" --emit=json > "$RAW" 2>"$OUT/.err-$DIA.log"
elif command -v claude >/dev/null 2>&1; then
  log "skill nao encontrada; tentando claude headless"
  claude -p "/last30days $CONSULTA --emit=json. Responda APENAS com o JSON, sem texto ao redor." \
    > "$RAW" 2>"$OUT/.err-$DIA.log"
else
  log "ERRO: nem a skill nem o claude estao disponiveis"
  log "instale com: /plugin marketplace add mvanhorn/last30days-skill"
  exit 1
fi

if [ ! -s "$RAW" ]; then
  log "ERRO: pesquisa voltou vazia. veja $OUT/.err-$DIA.log"
  exit 1
fi

# Isola o primeiro objeto JSON caso o modelo tenha embrulhado em texto.
python3 - "$RAW" <<'PY' || { log "ERRO: saida nao continha JSON"; exit 1; }
import json,re,sys
p=sys.argv[1]; t=open(p,encoding="utf-8").read()
try: json.loads(t)
except Exception:
    m=re.search(r"[\{\[].*[\}\]]", t, re.S)
    if not m: sys.exit(1)
    json.loads(m.group(0))
    open(p,"w",encoding="utf-8").write(m.group(0))
PY

BRIEF="$OUT/$DIA.md"
{
  printf '<!-- consulta: %s -->\n\n' "$CONSULTA"
  cd "$REPO" && npx tsx src/content/cli.ts --file "$RAW" --top 5
} > "$BRIEF"

rm -f "$RAW"
log "brief pronto: $BRIEF"
grep -c '^## ' "$BRIEF" 2>/dev/null | xargs -I{} log "{} pautas aprovadas"
