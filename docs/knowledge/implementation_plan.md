# Plano de Execução: Evolução da Integração Instagram + Zernio

Este documento detalha o plano de implementação e validação para transformar a integração Instagram + Zernio em um sistema conversacional generativo e determinístico no projeto `/Users/saraiva/_Projetos/respondedorinstagram`.

## Goal Description
Evoluir o sistema de automação para que interações via comentário, resposta ao Story, DM ou Ice Breakers passem por uma máquina de estados segura e idempotente, onde a entrega de conteúdos exclusivos exige confirmação oficial de follow (`isFollower=true`), mantendo o CRM do Zernio sincronizado e observável via métricas, sem quebrar ou alterar a produção live prematuramente.

> [!IMPORTANT]
> **Limitação Obrigatória de API:** Não será implementada nenhuma tentativa de "novo seguidor → DM automática". As entradas autorizadas são estritamente: comentário, resposta ao Story, DM iniciada pelo usuário, Ice Breakers e cliques em botões de conversas ativas.

---

## User Review Required

> [!IMPORTANT]
> **Validação do Follow Gate (Status `unknown`):**
> Quando o status de follow (`isFollower`) vier ausente ou nulo do Zernio, o sistema não acusa falso negativo (não afirma que a pessoa não segue) e solicita nova verificação via botão `JÁ SEGUI`.

> [!WARNING]
> **Governança de Rollout:**
> O rollout será realizado via Shadow/Canary antes da promoção para `live`. A versão live atual da AWS Lambda (`respondedor-instagram-saraiva-os`) será preservada intacta como ponto de rollback automático.

---

## Proposed Changes

### Módulos Internos de Regra de Negócio

#### [NEW] `src/instagram/contentCatalog.ts`
Criação do catálogo determinístico de conteúdos sem depender de URLs externas vindas via webhook.
- Suporte inicial a: `PROMPT`, `MAPA`, `AULA`, `AUTOMAÇÃO`, `PROSPECÇÃO` e `COMUNIDADE`.
- Mapeamento determinístico por ID e keywords.

#### [MODIFY] `src/instagram/followGate.ts`
Implementação dos estados do gate: `content_requested`, `checking_follow`, `awaiting_follow`, `rechecking_follow`, `delivering_content`, `content_delivered`, `follow_status_unavailable`, `technical_paused`.
- `FollowStatus` composto por `following | not_following | unknown`.
- Extração estrita de `message.sender.instagramProfile.isFollower`.

#### [NEW] `src/crm/zernioContactService.ts`
Serviço de espelhamento operacional no CRM Zernio.
- Utilização de `contactId` oficial recebido no webhook.
- Sincronização idempotente de atributos: intenção, objetivo, conteúdo solicitado/entregue, estágio e tags (`sexyflow`, `instagram`, `seguidor`, `nao-seguidor`, `follow-desconhecido`, etc.).

#### [NEW] `src/ai/zernioConversationContextProvider.ts`
Provedor de contexto isolado para a IA Generativa (Bedrock).
- Sanitização de histórico (últimas mensagens).
- Mascaramento de dados sensíveis e credenciais.
- Exclusão de mensagens deletadas do contexto generativo.

#### [NEW] `src/automation/automationJournal.ts`
Diário operacional de auditoria de eventos Zernio.
- Registro idempotente de eventos de lifecycle (`conversation.started`, `message.sent`, `message.delivered`, `message.read`, `message.edited`, `message.deleted`, `account.connected`, `account.disconnected`).

#### [NEW] `src/operations/instagramMetrics.ts`
Coletor de métricas para observabilidade do funil conversacional.
- Registro diferenciado entre conteúdo solicitado, follow checado, follow confirmado, conteúdo entregue, CTA enviado e entrada na comunidade.

---

### Módulos de Transporte e Integração Zernio

#### [MODIFY] `src/zernio/client.ts`
- Exportação de `requestZernioApi` para chamadas genéricas com métodos HTTP customizados (`POST`, `PUT`, `GET`).
- Preservação da lógica de reconciliação de áudio e private reply.

#### [MODIFY] `src/zernio/webhook.ts`
- Expansão de `ZernioLifecycleInboundV1` e `parseZernioLifecycleInbound` para aceitar a lista completa de eventos oficiais do Zernio.

#### [MODIFY] `src/lambda.ts`
- Integração da máquina de estados do Follow Gate na entrada principal da AWS Lambda.
- Conexão do diário de automação, CRM Zernio e coletor de métricas ao fluxo principal.

---

## Verification Plan

### Automated Tests
Execução da suíte completa de testes automatizados com Node.js Test Runner:

```bash
npm test
```

### Novas Suítes de Teste

#### `tests/followGateContent.test.ts`
Validação automatizada de:
1. `isFollower=true` libera conteúdo.
2. `isFollower=false` bloqueia e exibe o botão `JÁ SEGUI`.
3. `isFollower` nulo/ausente resulta em `unknown` sem acusar não-follow.
4. Botão `JÁ SEGUI` aciona nova consulta.
5. Catálogo determinístico retorna apenas conteúdos registrados e ativos.

---

## Proof Pack e Protocolo de Rollout

1. **Deploy Shadow/Canary:** Publicação em ambiente isolado sem envio de efeitos para usuários reais de produção.
2. **Jornada de Teste Controlada:** Validação com IDs allowlisted em 5 cenários:
   - Usuário seguidor (`following`).
   - Usuário não-seguidor (`not_following`).
   - Status indisponível (`unknown`).
   - Resposta a Story (`story_entry`).
   - Seleção de Ice Breaker (`ice_breaker_entry`).
3. **Métricas de Rollback Automático:** Retorno imediato à versão `live` se detectado:
   - Mensagens/áudios duplicados.
   - Perda de estado no DynamoDB.
   - Entrega de conteúdo sem follow oficialmente confirmado.
   - Falha de validação de assinatura HMAC SHA-256.
