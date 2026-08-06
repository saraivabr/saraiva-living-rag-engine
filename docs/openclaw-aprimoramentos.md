# Aprimoramentos do OpenClaw — Plano priorizado

> Pesquisa: 8 fontes (GitHub releases/docs/issues, comunidade, Reddit, blogs) → 111 melhorias brutas → 40 canônicas → 10 verificadas a fundo (as de maior peso). 9 confirmadas e aplicáveis.
> Setup-alvo: instância root self-hosted 24/7, persona "Jesus Cristo" via WhatsApp, Claude via OAuth Claude Code (MAX, sem fallback), Gemini free (TTS + embeddings), debounce 800, Composio pendente.

## Resumo executivo

Três ganhos imediatos, todos de baixo esforço/risco e custo zero: (1) **destravar o Composio MCP** — o OpenClaw já suporta `streamable-http` nativo e o bug de headers (`#65590`) foi corrigido, então a premissa antiga "só stdio" caiu; (2) **`openclaw security audit --fix`** — hardening automático de uma instância root exposta; (3) **fallback de modelo Claude→Gemini** — elimina o risco nº 1 (se a conta MAX cai, o agente para), reusando o Gemini free que já está na instância. Em seguida: observabilidade nativa (OTel/Activity tab) para detectar quedas silenciosas, aprovação por emoji no WhatsApp para gatear comandos sensíveis, e rotação multi-credencial.

## P0 — Quick wins (aplicar agora · alto impacto · baixo esforço/risco)

| Melhoria | Impacto | Esforço | Risco | Como aplicar (resumo) |
|---|---|---|---|---|
| Plugar Composio MCP (Gmail) via `streamable-http` | Alto | Baixo | Baixo | `openclaw mcp add` com `--transport streamable-http --header "Authorization: Bearer <KEY>"` |
| `openclaw security audit --fix` (hardening) | Alto | Baixo | Baixo | rodar dry-run `--json`, revisar, depois `--fix` |
| Fallback de modelo Claude→Gemini | Alto | Baixo | Baixo | `agents.defaults.model.fallbacks` apontando pro Gemini free |

## P1 — Alto impacto · esforço médio

| Melhoria | Impacto | Esforço | Risco | Como aplicar (resumo) |
|---|---|---|---|---|
| Aprovação por emoji 👍/👎 no WhatsApp | Médio | Baixo | Baixo | bloco `approvals.exec` mode `session` + nº em `allowFrom` |
| Observabilidade OTel + Activity tab | Alto | Médio | Baixo | atualizar p/ ≥v2026.5.26, Activity tab grátis + collector OTLP local |
| Rotação multi-credencial (auth profiles) | Alto | Médio | Baixo | provisionar 2º perfil anthropic + `auth.order` |

## P2 — Explorar depois

| Melhoria | Impacto | Esforço | Risco | Observação |
|---|---|---|---|---|
| Fallback de embeddings (memória) | Médio | Médio | Médio | mismatch de dimensão Gemini↔local pausa busca até reindex |
| Heartbeat + HEARTBEAT.md (proativo) | Médio | Baixo | Médio | cada tick consome cota MAX; começar conservador (2h) |

## Não aplicável agora

- **`cron.maxConcurrentRuns` / `--fallbacks` por cron job** — o default (8) já vale automaticamente após atualizar; a parte de fallback é inútil sem 2ª credencial. Setup não usa cron intensivo.

---

## Detalhamento (P0)

### 1. Plugar Composio MCP (Gmail) — destrava o objetivo nº 5
A premissa antiga ("OpenClaw só aceita stdio") **caiu**: `docs.openclaw.ai/cli/mcp` documenta `--transport streamable-http`, `--header`, `--timeout`, `--connect-timeout`. A issue [#65590](https://github.com/openclaw/openclaw/issues/65590) (não-forwarding de headers `Authorization`/`x-api-key` no streamable-http) está **fechada**.

Passos:
1. No painel Composio, pegue o MCP URL e o header correto (pode ser `Authorization: Bearer <KEY>` **ou** `x-consumer-api-key: <KEY>` — varia por conta).
2. `openclaw mcp add composio --url https://<endpoint>.composio.dev/mcp --transport streamable-http --header "Authorization: Bearer <KEY>" --timeout 20 --connect-timeout 5`
3. `openclaw mcp list` e reinicie o gateway; cheque os logs do MCP server.
4. **Confirme a versão**: `openclaw --version` — se anterior a ~maio/2026, atualize antes (`openclaw upgrade`), senão os headers continuam não sendo enviados.
5. KEY em `/root/.openclaw/secrets` (chmod 600), referenciada por env — **nunca** hardcoded no `openclaw.json` versionado em git.
6. **Obrigatório** passar `--transport streamable-http` explícito (o default é `sse`; cair no sse contra server POST-only reabre o 405 da #72757).
- Fontes: https://docs.openclaw.ai/cli/mcp · https://github.com/openclaw/openclaw/issues/65590

### 2. `openclaw security audit --fix` — hardening
Confirmado em https://docs.openclaw.ai/cli/security. Checa reuso de `hooks.token` vs `gateway.auth`, `gateway.auth.mode=none`, `allowRealIpFallback=true` (header-spoofing), `discovery.mdns.mode=full` (vazamento via TXT), permissões de `credentials/*.json`, sandbox Docker, `gateway.nodes.allowCommands` perigosos. O `--fix` aplica só o seguro (chmod de permissões, `logging.redactSensitive` off→tools, `groupPolicy` open→allowlist); **não** rotaciona tokens nem desabilita tools.

Passos:
1. Backup: `cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.bak`
2. Dry-run: `openclaw security audit --json | tee /root/.openclaw/audit-$(date +%F).json` e revise.
3. **Atenção ao CRITICAL `hooks.token`**: garanta que não seja igual ao `gateway.auth.token/password` (se for, o startup falha desde fev/2026) — gere valor distinto em secrets.
4. Aplique: `openclaw security audit --fix --json`
5. Após `groupPolicy`→allowlist, popule os grupos/JIDs legítimos no allowlist.
6. Reinicie e confirme que sobe sem erro de token reuse. Opcional: cron periódico (sem `--fix`) para monitorar drift.
- Fonte: https://docs.openclaw.ai/cli/security

### 3. Fallback de modelo Claude→Gemini — mata o risco nº 1
Confirmado em https://docs.openclaw.ai/concepts/model-failover: failover em 2 estágios (rotação de auth profiles → fallback de modelo via `agents.defaults.model` primary/fallbacks), probe do primário a cada 5 min. **Pegadinha**: `/model` manual é seleção estrita e desliga o fallback — como a persona roda automática (não usa `/model`), o tráfego usa os defaults e **é** elegível. Cair pra outro modelo Anthropic sob a **mesma** credencial OAuth morta não resolve nada → o fallback útil deve apontar pro **Gemini** (já configurado, free).

Passos:
1. Backup do `openclaw.json`.
2. **Confirme o formato exato** do array antes de commitar: `openclaw config get agents.defaults.model` (a doc confirma as chaves mas não mostra o JSON literal — verifique se item é string `"provider/model"` ou objeto).
3. `agents.defaults.model`: `{"primary":"<id-do-claude-oauth-atual>","fallbacks":["google/gemini-2.0-flash"]}` usando o mesmo provider Gemini do TTS/embeddings.
4. Garanta credencial Gemini válida em secrets e habilitada como provider de **chat** (não só embeddings/TTS) — checar `auth.profiles`.
5. **Não** fixe modelo via `/model` no WhatsApp.
6. Reinicie e teste simulando falha do primário; confirme nos logs a queda pro Gemini e o retorno após o probe de 5 min.
- Fonte: https://docs.openclaw.ai/concepts/model-failover

## Detalhamento (P1)

### 4. Aprovação por emoji 👍/👎 no WhatsApp
Confirmado na release [v2026.5.26](https://github.com/openclaw/openclaw/releases/tag/v2026.5.26) ("WhatsApp thumb approval reaction support") e em https://docs.openclaw.ai/tools/exec-approvals. Reações nativas só funcionam em sessão originada no WhatsApp — exatamente o caso. Gateia comandos sensíveis no host (helpers `ig`/`genimg`/`publicar-site`, shell exec, tools Composio).

Passos:
1. `{"approvals":{"exec":{"enabled":true,"mode":"session"}}}`
2. Seu número deve estar em `allowFrom` do canal WhatsApp (`defaultTo` **não** conta como approver).
3. Quando plugar o Composio: `approvals.plugin` mode `targets` apontando pro seu número, pra gatear envio de e-mail.
4. Reload do gateway; teste uma ação sensível e aprove com 👍.
5. Não gateie ações de altíssima frequência (preserva a agilidade do debounce 800).

### 5. Observabilidade OTel + Activity tab
Confirmado na release v2026.5.26: "OpenTelemetry LLM spans", "Activity tab for sanitized live tool activity", "export alertable OTel and Prometheus signals for blocked tools, **model failover, stale sessions, liveness warnings**…". Os sinais de model-failover/liveness são justamente o que detecta a queda silenciosa da conta MAX. ⚠️ Os nomes exatos das chaves de config **não** foram confirmados (doc dedicada deu 404) — inspecione a config local antes.

Passos:
1. Atualize p/ ≥v2026.5.26.
2. **Ganho zero-custo imediato**: Activity tab no Control UI (efêmero, sem collector).
3. Pipeline OTLP: habilite `diagnostics-otel` com endpoint local `http://127.0.0.1:4318` (nada sai da box). Descubra o bloco real com `openclaw config get` / `openclaw plugins list`.
4. Backend: OTel Collector local ou export Prometheus + scrape local.
5. **Alerta no gap crítico**: model-failover + liveness → encaminhe pra canal **fora** da instância (e-mail/webhook), senão depende do agente que caiu.
6. Mantenha `logs:false` inicialmente (não capturar conteúdo de mensagem do WhatsApp).
- Fonte: https://github.com/openclaw/openclaw/releases/tag/v2026.5.26

### 6. Rotação multi-credencial (named auth profiles)
Confirmado em https://docs.openclaw.ai/concepts/model-failover: perfis em `~/.openclaw/agents/<id>/agent/auth-profiles.json`, ordem via `auth.order[provider]`, OAuth antes de API key, pin por sessão, backoff de billing 5h→24h e rate-limit 1min→1h. **Só entrega valor com ≥2 perfis** pro mesmo provider.

Passos:
1. Provisione um 2º perfil anthropic: (a) API key dedicada como emergência (paga só quando ativa), ou (b) 2ª conta Claude/MAX via OAuth.
2. Registre os perfis (OAuth gera ID automático; API key → secrets, nunca no git).
3. `auth.order.anthropic: ["anthropic:<email-MAX>", "anthropic:apikey"]` (OAuth primeiro).
4. Combine com o fallback de modelo (item 3).
5. Valide forçando rate-limit e observando `auth-state.json`.
- Nota: nomes de chave de cooldown não foram citados literalmente na doc — confirme no binário antes de escrever.

## Detalhamento (P2)

### 7. Fallback de embeddings (memória semântica)
`docs.openclaw.ai/reference/memory-config`: `memorySearch` aceita `provider`, `model`, `fallback`, `remote.*`, `local.modelPath`, `outputDimensionality`. Provider local (`embeddinggemma-300m`, 768-dim, ~0.6GB) roda offline/grátis. ⚠️ **Não é plug-and-play**: Gemini e o local têm dimensões diferentes → mudar provider muda a "index identity" e o OpenClaw **pausa** a busca até `openclaw memory index --force`. Fallback dispara em falha, **não** garantidamente em rate-limit. Impacto médio (Claude é o cérebro; memória caindo degrada contexto, não derruba o agente).

### 8. Heartbeat + HEARTBEAT.md (agente proativo)
`docs.openclaw.ai/gateway/heartbeat`: `agents.defaults.heartbeat` com `every`, `target`, `lightContext`, `skipWhenBusy`, `activeHours`. ⚠️ Sob OAuth o default é **1h** (não 30m) e `target` default é `none` (não envia nada). **Cada tick consome cota MAX** — sem fallback, heartbeat agressivo aumenta o risco de derrubar a única conta. Bug [#51542](https://github.com/openclaw/openclaw/issues/51542): a sessão cacheia o HEARTBEAT.md e persiste após restart → editar o arquivo não surte efeito até resetar a sessão.

Recomendação: comece conservador — `{"every":"2h","target":"none","lightContext":true,"skipWhenBusy":true,"activeHours":"08:00-22:00"}`, HEARTBEAT.md curto e estável (sem secrets), só vire `target:"last"` depois de validar.

## Plano de execução sugerido

**Fase 1 (hoje, ~30 min):** backup do `openclaw.json` → `security audit` dry-run → corrigir `hooks.token` se flagado → `--fix` → reiniciar e validar.

**Fase 2 (resiliência):** confirmar versão ≥v2026.5.26 → configurar fallback Claude→Gemini (item 3) → validar simulando falha. Este é o item de maior retorno pro objetivo nº 1.

**Fase 3 (capacidade):** plugar Composio MCP (item 1) → habilitar `approvals.exec` 👍/👎 (item 4) antes de dar mais poder ao agente.

**Fase 3.5 (visibilidade):** Activity tab imediato + pipeline OTLP local com alerta de model-failover/liveness fora da box (item 5).

**Fase 4 (opcional):** 2º auth profile (item 6) se quiser cobrir queda mantendo Claude → embeddings fallback (item 7) → heartbeat conservador (item 8).

---

### Pendente
30 melhorias de menor prioridade (das 40 canônicas) não foram verificadas — a verificação em paralelo bateu rate-limit do servidor e a síntese automática caiu junto. Este relatório foi montado a partir das 10 melhorias de maior peso, já verificadas a fundo. As outras 30 podem ser processadas numa nova rodada quando o rate-limit ceder.
