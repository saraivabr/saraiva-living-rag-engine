# Recuperacao segura de comentarios de um post

O comando opera em **um unico `mediaId`** e e dry-run por padrao. Ele nunca
publica a resposta publica antes de confirmar a private reply e a persistencia
do contexto comercial.

## 1. Manifesto

Crie um JSON fora do repositorio, por exemplo em `/private/tmp/recovery.json`:

```json
{
  "accountUsername": "saraiva.ai",
  "mediaId": "17800000000000000",
  "postPermalink": "https://www.instagram.com/p/SHORTCODE/",
  "promiseKind": "voice_ai_map_workshop",
  "promiseLabel": "mapa da IA de ligacao no WhatsApp",
  "privateReply": "COPY PRIVADA APROVADA",
  "publicReply": "COPY PUBLICA APROVADA",
  "comments": [
    { "commentId": "17900000000000001" },
    { "commentId": "17900000000000002" }
  ]
}
```

Nao informe `senderId` normalmente. Esse campo e aceito apenas para reparar uma
private reply antiga cuja marcacao existe, mas cujo contexto comercial ficou
incompleto.

Quando a propria Meta confirmar que a private reply ja foi consumida por uma
automacao anterior, use `privateReplyAlreadyUsed: true` junto do `senderId`
lido do campo `from.id` daquele comentario. Nesse modo o script nao tenta uma
segunda DM, nao registra uma copy privada desconhecida e usa uma resposta
publica honesta convidando o seguidor a iniciar o Direct.

## 2. Dry-run obrigatorio

```bash
npx tsx src/recoverComments.ts --input /private/tmp/recovery.json
```

O resumo JSON mostra somente IDs e estados operacionais; copies, tokens e
segredos nao sao impressos.

## 3. Execucao explicita

Antes de executar, confirme `IG_ACCESS_TOKEN`, `IG_USER_ID`, `IG_PAGE_ID`,
`DYNAMODB_TABLE` e a conta declarada no manifesto.

```bash
npx tsx src/recoverComments.ts \
  --input /private/tmp/recovery.json \
  --execute
```

Fluxo por comentario:

1. valida que o comentario pertence ao `mediaId` informado;
2. envia a private reply;
3. salva `lead-context` e `sales-leads` no DynamoDB;
4. marca a private reply no store;
5. publica a resposta publica;
6. marca a resposta publica no store.

O rerun e idempotente. Se houver uma resposta publica da conta com texto
diferente da copy aprovada, o item e bloqueado para revisao em vez de criar uma
duplicata. Se o mesmo seguidor aparecer duas vezes no lote, apenas a primeira
entrada e processada; a segunda e bloqueada para evitar duas DMs comerciais.

## Validacao local

```bash
npm test
npm run typecheck
npm run build
```
