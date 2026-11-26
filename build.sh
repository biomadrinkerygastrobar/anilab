#!/bin/sh
# Gera public/js/config.js a partir das variáveis de ambiente da Vercel (item 1:
# nenhuma chave fica escrita no código-fonte).
set -e

limpar() {
  printf '%s' "$1" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["'\'']//' -e 's/["'\'']$//' -e 's#/*$##'
}

url_valida() {
  printf '%s' "$1" | grep -Eq '^https://[A-Za-z0-9.-]+$'
}

URL=""
for candidata in "$SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_URL"; do
  c=$(limpar "$candidata")
  if [ -n "$c" ] && url_valida "$c"; then URL="$c"; break; fi
  if [ -n "$c" ]; then echo "AVISO: ignorando URL do Supabase inválida (deve ser https://xxxx.supabase.co)."; fi
done
if [ -z "$URL" ] && [ -n "$SUPABASE_PROJECT_REF" ]; then
  URL="https://$(limpar "$SUPABASE_PROJECT_REF").supabase.co"
fi
[ -n "$URL" ] || { echo "ERRO: defina SUPABASE_URL na Vercel no formato https://xxxx.supabase.co"; exit 1; }

KEY=""
for candidata in "$SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_PUBLISHABLE_KEY" "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"; do
  c=$(limpar "$candidata")
  if [ -n "$c" ]; then KEY="$c"; break; fi
done
[ -n "$KEY" ] || { echo "ERRO: defina SUPABASE_ANON_KEY na Vercel (chave PUBLIC/anon, nunca a service_role)"; exit 1; }

case "$KEY" in
  *service_role*|sb_secret_*) echo "ERRO: não use a chave service_role/secret no front-end"; exit 1;;
esac
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && [ "$KEY" = "$(limpar "$SUPABASE_SERVICE_ROLE_KEY")" ]; then
  echo "ERRO: a chave anon é igual à service_role"; exit 1
fi

cat > public/js/config.js <<JS
window.ANILAB_CONFIG = {
  SUPABASE_URL: "$URL",
  SUPABASE_ANON_KEY: "$KEY"
};
JS
echo "config.js gerado para $URL"
