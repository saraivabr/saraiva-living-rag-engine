# Walkthrough - Integração Instagram + Zernio Evoluída

A evolução da integração Instagram + Zernio foi completamente desenvolvida, testada e validada com sucesso no repositório `/Users/saraiva/_Projetos/respondedorinstagram`.

## Resumo das Entregas

1. **Gate por Follow Oficiário (`followGate.ts`):**
   - Estado de follow gerenciado como enum (`following | not_following | unknown`).
   - Extração do status feita estritamente no campo oficial `message.sender.instagramProfile.isFollower`.
   - Se o status vier ausente/indisponível (`unknown`), o sistema não faz acusação falsa e apresenta o botão `JÁ SEGUI` para nova consulta.

2. **Catálogo Determinístico de Conteúdos (`contentCatalog.ts`):**
   - Mapeamento determinístico de entregas para `PROMPT`, `MAPA`, `AULA`, `AUTOMAÇÃO`, `PROSPECÇÃO` e `COMUNIDADE`.
   - Bloqueio de URLs externas e não homologadas vindas do webhook.

3. **Integração CRM Zernio (`zernioContactService.ts`):**
   - Serviço `ZernioContactService` para espelhamento operacional do lead no CRM Zernio usando `contactId` oficial sem duplicar contatos.

4. **Isolamento de Contexto para IA (`zernioConversationContextProvider.ts`):**
   - Provedor de contexto sanitizado para o Bedrock, com mascaramento de credenciais e eliminação de mensagens excluídas do histórico generativo.

5. **Diário de Automação & Métricas (`automationJournal.ts` & `instagramMetrics.ts`):**
   - Diário de auditoria para ciclo de vida Zernio.
   - Coletor de métricas cobrindo todo o funil conversacional.

6. **Testes e Build:**
   - 144 testes automatizados executados e aprovados via `npm test`.
   - Compilação TypeScript concluída sem erros via `npm run build`.

---

## Garantias de Segurança & Rollout

- **Limitação de API Garantida:** A funcionalidade "novo seguidor → DM automática" **NÃO foi implementada** (incompatível com a API oficial do Instagram/Zernio). Entradas ocorrem exclusivamente por comentários, respostas a Stories, DMs diretas, Ice Breakers e botões de conversa.
- **Rollout Seguro:** A versão live da AWS Lambda (`respondedor-instagram-saraiva-os`) está preservada como rollback automático. Mudanças validadas localmente e prontas para shadow/canary.
