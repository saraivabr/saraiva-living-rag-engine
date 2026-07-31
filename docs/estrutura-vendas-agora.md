# Estrutura de venda imediata

## Oferta principal

Workshop Ligações com IA no WhatsApp.

Link:

https://workshop.saraiva.ai/checkout

Promessa:

Curso/workshop pratico para conectar WhatsApp, Wavoip, ElevenLabs, contexto de
backend e passagem para atendimento humano.

Mensagem central:

Pagamento unico de R$97. Conteudos de voz, ligacao, Wavoip e ElevenLabs podem
direcionar para esta oferta. Conteudos sem essa aderencia permanecem em
diagnostico e nao recebem preco ou link inventado.

## Canais e estado

1. Instagram Direct via Chatrace
2. Pagina de links apontando para o Direct
3. WhatsApp do dono quando o lead esquenta
4. Histórico interno no DynamoDB como destino operacional

A entrada por comentarios esta ativa somente para comentarios novos que contem
uma palavra-chave de campanha. Ela envia uma unica private reply vinculada ao
comentario; depois que a pessoa responde no Direct, o Chatrace assume a conversa.

Identificadores confirmados em 15/07/2026:

- Instagram Business Account `@saraiva.ai`: `17841401830912551`;
- Pagina do Facebook `Saraiva AI Solucoes`: `1054385387750829`;
- Chatrace: canal `@saraiva.ai` conectado;
- fluxo de continuidade: `saraiva-ai-direct-lambda` (`1784120443457`), publicado e `ON`;
- fallback do Direct: `saraiva-ai-direct-lambda`;
- agente nativo padrao removido no Chatrace (`agent_id=0`);
- demais fluxos `OFF`; inbox `ON` somente no fluxo `saraiva-ai-direct-lambda`.

Configuracao segura aplicada em producao em 15/07/2026 22:14 BRT:

```text
CHATRACE_RESPONDER_ENABLED=false
RESPONDER_ENABLED=false
WEBHOOK_RESPONDER_ENABLED=false
WEBHOOK_DM_ENABLED=false
WEBHOOK_COMMENT_ENABLED=false
WEBHOOK_STANDBY_ENABLED=false
BEDROCK_SALES_ENABLED=false
DRY_RUN=true
DISABLED_MEDIA_IDS=17876885349503055
```

Esta e uma pausa de incidente. O endpoint `/chatrace` responde `503 chatrace
responder disabled`, comentarios nao abrem private reply e nenhuma resposta
comercial e gerada. Publicacao de feed e carrossel permanece independente.
Nao reative o fluxo sem homologar as mensagens e revisar a automacao no painel
do Chatrace.

No estado normal, o endpoint autenticado `/chatrace` gera a resposta e a Lambda
nativa abre a conversa a partir de um comentario elegivel. Esse comportamento
esta suspenso pela pausa de incidente descrita acima. A midia
`17876885349503055` continua bloqueada para evitar nova atuacao automatica no
post do incidente.

## Fluxo automatico principal

1. Pessoa comenta uma palavra-chave em um post permitido ou envia uma mensagem
   nova no Direct do `@saraiva.ai`.
2. No comentario, a Lambda envia uma private reply, persiste o contexto e so
   entao responde publicamente. Comentarios genericos sao ignorados.
3. Quando a pessoa responde no Direct, o fallback `saraiva-ai-direct-lambda`
   recebe a interacao no Chatrace.
4. O Chatrace chama o endpoint autenticado `/chatrace`; retries sao aceitos.
5. A Lambda valida conta, fluxo, segredo e identificador da interacao, devolvendo
   a mesma resposta quando recebe o mesmo retry.
6. A Lambda recupera o contexto, pontua o lead e gera uma resposta segura.
7. O Chatrace envia exatamente essa resposta no Direct.
8. Contexto e lead comercial ficam persistidos em DynamoDB.
9. O dono e acionado quando o lead fica quente ou pede handoff.
10. O dono assume para diagnostico, workshop ou proposta manual conforme o caso.

## Limite atual da Meta

Follow-up proativo para lead antigo no Direct do `@saraiva.ai` ainda depende da
Meta liberar a capability do app. A continuidade de conversas novas e feita
pelo fluxo dedicado do Chatrace.

Validacao atual:

- `canReadConversations=false`
- Erro Graph API: `(#3) Application does not have the capability to make this API call.`

Enquanto essa capability nao libera, nao existe disparo proativo em massa para
seguidores antigos. O Chatrace recebe a mensagem nova, chama `/chatrace` e envia
exatamente a resposta devolvida pela Lambda. Painel/CSV ficam apenas como apoio
operacional para lead antigo, sem envio automatico.

O webhook do Chatrace tenta primeiro o mesmo Instagram-scoped ID criado pela private reply. Quando encontra esse contexto, preserva comentario, post, historico e score; identificadores internos do Chatrace continuam isolados pelo prefixo `chatrace:`.

## Pergunta de abertura

Qual tarefa da sua empresa mais depende de voce ou da sua equipe fazendo manualmente: atendimento, follow-up, vendas, conteudo, financeiro ou organizacao interna?

## Quando mandar o link

Mandar o link quando a pessoa:

- veio de conteudo de voz, ligacao, Wavoip ou ElevenLabs; e
- pede link, inscricao, Pix, compra ou entrada no workshop.

Em outros conteudos, diagnosticar primeiro. Nao reutilizar checkout antigo nem
transformar toda pergunta comercial na mesma oferta.

Resposta:

perfeito. o Workshop Ligações com IA no WhatsApp mostra como conectar WhatsApp, Wavoip, ElevenLabs e o registro do atendimento no mesmo fluxo.

o pagamento e unico: R$97.

checkout: https://workshop.saraiva.ai/checkout

se quiser validar o encaixe antes de pagar, me diz onde pretende aplicar: atendimento, vendas, suporte ou agenda.

Mensagem como "paguei" ou "Pix pago" muda o lead para
`pagamento_pendente_verificacao`. Venda e acesso so podem ser confirmados depois
de o provedor registrar o pagamento como concluido.

## Score comercial

Lead frio:

- score abaixo de 40;
- so pediu material;
- nao falou dor;
- nao falou negocio proprio.

Lead morno:

- score entre 40 e 69;
- citou area;
- citou segmento;
- esta entendendo possibilidade.

Lead quente:

- score 70 ou mais;
- pediu link;
- perguntou preco;
- falou urgencia;
- disse que e dono ou gestor;
- pediu implementacao ou conversa.

## Handoff humano

Exige aprovacao humana antes de:

- convite final para PRO;
- desconto;
- promessa fora do script;
- diagnostico sensivel;
- refund ou problema financeiro;
- envio em massa;
- anuncio ou post publico.

## Objeções

Responder uma pergunta por vez usando somente fatos presentes na oferta atual.
Nao prometer prazo, garantia, ausencia de codigo, turma ao vivo, desconto ou
resultado quando isso nao estiver confirmado na pagina vigente.

## Comandos operacionais

Ver saude do Instagram e leads comerciais:

```bash
npm run ops:instagram
```

Exportar pipeline via Lambda:

O nome AWS abaixo e legado. O runtime deve permanecer travado no Instagram
Business `@saraiva.ai` (`17841401830912551`); ele nao autoriza operar outra conta.

```bash
aws lambda invoke \
  --function-name respondedor-instagram-saraiva-os \
  --region us-east-1 \
  --payload '{"action":"exportSalesLeads"}' \
  /tmp/sales-leads.json \
  --cli-binary-format raw-in-base64-out
```

Ver apenas leads:

```bash
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('/tmp/sales-leads.json','utf8')); console.table((r.leads||[]).map(l=>({score:l.score,stage:l.stage,temp:l.temperature,icp:l.icpFit,offer:l.offer,next:l.nextAction})))"
```

## Histórico operacional

Cada lead mantém:

- titulo: `crmTitle`;
- nota: `crmNote`;
- origem: Instagram;
- status: de acordo com `stage`;
- prioridade: `temperature`;
- proxima acao: `nextAction`.

O DynamoDB e o export acima são as fontes de auditoria para conferir ou reprocessar o histórico.
