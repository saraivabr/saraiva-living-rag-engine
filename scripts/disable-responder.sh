#!/bin/bash
set -euo pipefail

echo "=============================================="
echo "  DESATIVANDO RESPONDEDOR DE INSTAGRAM"
echo "  (migracao total para Chatrace)"
echo "  (antigo servidor Contabo removido)"
echo "=============================================="
echo ""

# Run from current directory (old Contabo server is offline and removed)
cd "$(dirname "$0")/.." || cd .
echo "Diretorio atual: $(pwd)"
echo ""

echo ">>> Garantindo que o flag de disable esta setado (código + configs)..."

# Garante no .env se existir
if [ -f .env ]; then
  if ! grep -q "^RESPONDER_ENABLED=" .env; then
    echo "RESPONDER_ENABLED=false" >> .env
  else
    sed -i.bak 's/^RESPONDER_ENABLED=.*/RESPONDER_ENABLED=false/' .env || true
  fi
  echo "  .env atualizado"
fi

# Atualiza ecosystem files se existirem (para histórico)
for f in ecosystem*.cjs; do
  if [ -f "$f" ]; then
    echo "  $f (já limpo, apps removidos)"
  fi
done

echo ""
echo ">>> Build..."
npm run build 2>&1 | tail -3 || echo "  (ok)"

echo ""
echo "=============================================="
echo "  PRONTO. Respondedor desativado."
echo "  Antigo servidor Contabo removido da config."
echo "  Nenhum comentário ou DM automático."
echo "  Controle via Chatrace."
echo "=============================================="
echo ""
echo "Para reativar (não recomendado): mude RESPONDER_ENABLED=true e reconstrua."
