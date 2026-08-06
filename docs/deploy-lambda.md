# Deploy da Lambda

Não existe script de deploy neste repositório, e isso é proposital: publicar
para uma conta que atende gente de verdade é decisão de quem opera, não efeito
colateral de um `npm run`. Este documento registra o procedimento que funciona
e as três armadilhas que ele evita.

Função: `respondedor-instagram-saraiva-os` · runtime `nodejs20.x` ·
handler `dist/lambda.handler` · região `us-east-1`.

## O pacote

O que está publicado tem exatamente três coisas na raiz do zip:

```
dist/           código compilado por tsc
node_modules/   dependências de PRODUÇÃO (47 pacotes)
package.json
```

## Procedimento

```bash
# 1. Guardar o ponto de rollback ANTES de qualquer coisa
aws lambda get-function-configuration \
  --function-name respondedor-instagram-saraiva-os \
  --query CodeSha256 --output text          # anote este valor

aws s3 cp "$(aws lambda get-function --function-name respondedor-instagram-saraiva-os \
  --query Code.Location --output text)" /tmp/rollback.zip   # baixe o atual

# 2. Compilar
npm run typecheck && npm test && npm run build

# 3. Montar a árvore de produção num diretório limpo
STAGE=$(mktemp -d)
cp package.json package-lock.json "$STAGE/"
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --force)
cp -R dist "$STAGE/dist"
(cd "$STAGE" && rm -f package-lock.json && zip -qr9 /tmp/lambda.zip dist node_modules package.json)

# 4. Publicar via S3 (upload direto de 30MB falha)
KEY="deploy/lambda-$(date +%Y%m%dT%H%M%S).zip"
aws s3 cp /tmp/lambda.zip "s3://respondedor-instagram-audio-880690593918/$KEY"
aws lambda update-function-code \
  --function-name respondedor-instagram-saraiva-os \
  --s3-bucket respondedor-instagram-audio-880690593918 --s3-key "$KEY"
aws lambda wait function-updated --function-name respondedor-instagram-saraiva-os
aws s3 rm "s3://respondedor-instagram-audio-880690593918/$KEY"
```

## As três armadilhas

**1. `npm ci` falha nesta máquina.** O `@ffmpeg-installer/linux-x64` é uma
dependência direta e recusa instalar em macOS arm64 por `os`/`cpu`. O `--force`
contorna. Sem ele, não há pacote — e o `--os=linux --cpu=x64` do npm 10 não
resolve neste caso.

**2. Zipar o `node_modules` local sobe lixo.** O local tem 55 pacotes de topo
contra 47 de produção, incluindo `fsevents`, que é só macOS e não serve num
runtime Linux. Sempre montar árvore limpa.

**3. Upload direto de 30MB cai.** `update-function-code --zip-file` falhou duas
vezes com "connection closed" e "could not connect", enquanto STS e S3
respondiam normalmente. A rota por S3 passa de primeira.

Se um upload cair, **confira o estado antes de repetir**:

```bash
aws lambda get-function-configuration \
  --function-name respondedor-instagram-saraiva-os \
  --query '{Sha:CodeSha256,Status:LastUpdateStatus,State:State}'
```

SHA inalterado significa que nada foi aplicado e repetir é seguro.

## Verificar depois de publicar

Deployou não é funciona. O mínimo:

```bash
# invocação real, somente leitura — prova que a cadeia de imports carrega
aws lambda invoke --function-name respondedor-instagram-saraiva-os \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"listUnansweredLeads","limit":3}' /tmp/smoke.json

BASE=https://52cv7zdc64autz4ltjj6h7uce40ktyfd.lambda-url.us-east-1.on.aws
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/?hub.mode=subscribe&hub.verify_token=errado"  # 403
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/instagram/prompt?intent=ter&correlation=x"    # 403
```

## Rollback

O pacote anterior ao deploy de 06/08/2026 está guardado:

```
s3://respondedor-instagram-audio-880690593918/rollback/lambda-pre-f60fbfe-20260806.zip
sha256 local  7c3ed548fcaeee4f…
CodeSha256    fD7VSPyu7k/qPPOmWNkY9oeFi8h5ut8UinaOJ/c1jo4=
```

Para voltar:

```bash
aws lambda update-function-code \
  --function-name respondedor-instagram-saraiva-os \
  --s3-bucket respondedor-instagram-audio-880690593918 \
  --s3-key rollback/lambda-pre-f60fbfe-20260806.zip
```

Confirme que o `CodeSha256` voltou ao valor acima.
