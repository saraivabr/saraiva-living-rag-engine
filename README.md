# Respondedor de Instagram — @saraiva.ai

Uma AWS Lambda que atende o Instagram da Saraiva.AI: responde comentários e
Direct, conduz a conversa de vendas, registra o lead e reconcilia o pagamento.

Não é um produto genérico nem um framework. É a operação de uma conta só.

## Como funciona

A Meta exige um endpoint HTTPS público disponível 24/7 para entregar o webhook.
Esse endpoint é a Lambda `respondedor-instagram-saraiva-os`, e ela é o único
ponto de entrada do sistema — todo o resto (webhooks, crons, fila SQS) chega
pelo mesmo `handler()`.

```
Instagram ──webhook──▶ Lambda ──▶ resposta no comentário + Direct
                         │
                         ├─▶ DynamoDB   dedup, locks, contexto do lead
                         ├─▶ Airtable   insights de conversa
                         ├─▶ Woovi      cobrança PIX da Biblioteca de Prompts
                         ├─▶ Zernio     automação social e áudio
                         └─▶ S3 + CloudFront   calendário editorial
```

### Os caminhos de resposta

| Entrada | O que decide o texto |
|---|---|
| Comentário em post | Copy determinística por campanha + private reply |
| Direct dentro de um fluxo | Motor (`motor.empresa.ia.br`), com guardrails |
| Direct de social selling | `buildSocialSellingTurn`, determinístico |
| Intenção de compra | Cobrança Woovi + link de acesso |

O Motor é o único provedor de IA conversacional. Toda saída dele passa por
`salesResponderShared`, que recusa a resposta e cai no texto determinístico
quando ela inventa preço, link, prazo ou garantia que não estão na oferta
confiável; quando não está em português; quando faz mais de uma pergunta; ou
quando tenta vazar o prompt.

### Por que DynamoDB e não só Airtable

O Airtable guarda o que a pessoa precisa ver. O DynamoDB guarda o que o sistema
precisa para não errar: escrita condicional (`ConditionExpression`) para
idempotência de webhook e locks de conversa. O Airtable não tem esse primitivo —
sem ele, um retry da Meta gera resposta duplicada no Direct de um cliente.

## Rodando

```bash
npm install
npm run build      # tsc
npm test           # node:test via tsx
npm run typecheck
```

Não há modo local: o sistema depende do webhook da Meta e de recursos AWS.
Para inspecionar comportamento, os testes em `tests/` cobrem os guardrails, o
fluxo de vendas, o funil e os webhooks.

## Configuração

As variáveis vivem no ambiente da Lambda, não em `.env` de produção. Veja
`.env.example` para a lista e `src/config.ts` para os defaults e validações.

As chaves sensíveis (Motor, Woovi, Airtable) ficam no AWS Secrets Manager e são
lidas sob demanda, com cache em memória entre invocações.

## Estrutura

```
src/
├── lambda.ts        ponto de entrada único: HTTP, cron e SQS
├── responder.ts     ciclo de varredura de comentários
├── ai/              Motor conversacional e guardrails compartilhados
├── instagram/       cliente da Graph API, fluxos e personalização
├── socialSelling/   máquina de estados da conversa de vendas
├── payments/        Woovi (PIX) e Biblioteca de Prompts
├── store/           acesso ao DynamoDB
├── crm/             sincronismo com Airtable
├── zernio/          webhook e cliente da automação social
├── sales/           reengajamento e pacote de tarefas
├── secondBrain/     hipóteses e relatório de aprendizado
└── calendarSync.ts  publica o calendário editorial em S3/CloudFront
```

## Ações administrativas

O `handler()` aceita invocação direta com `{"action": "..."}` para operações
pontuais — entre elas `syncCalendar`, `syncAirtableInsights`,
`exportSalesLeads`, `listUnansweredLeads`, `runCommentCampaign` e
`exportSecondBrainReport`. A lista completa está no início de `src/lambda.ts`.
