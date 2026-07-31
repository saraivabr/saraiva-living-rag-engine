# Central de Voz — Wavoip → ElevenLabs → Jesus (OpenClaw)

Central de voz para WhatsApp. Quando alguém **liga** para o número conectado no Wavoip, a ligação entra por **SIP** na ElevenLabs, que executa um **Agente de voz**. Esse agente atende **como o Jesus** (o mesmo agente OpenClaw que já responde no WhatsApp), **com o contexto daquele contato** — persona, histórico recente da conversa e fatos da memória.

A "mágica" do contexto é feita pelo **`bridge.py`**, que roda **no mesmo VPS do OpenClaw** e expõe 3 endpoints para a ElevenLabs.

---

## 1. O que é

```
                  liga no WhatsApp
   Contato ──────────────────────────────────► Número (Wavoip device)
                                                      │ SIP/TCP 5060
                                                      ▼
                                          sip.rtc.elevenlabs.io  (sip_trunk)
                                                      │
                                                      ▼
                                       ElevenLabs Agent (voz pt-BR)
                                                      │
            ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
            │ (1) início da conversa                   │ (2) durante a conversa                   │ (3) fim
            ▼                                          ▼                                          ▼
   POST /elevenlabs/init                      POST /elevenlabs/jesus                     POST /elevenlabs/postcall
   (conversation initiation webhook)          (server tool, Bearer)                      (post-call webhook)
            │                                          │                                          │
            ▼                                          ▼                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                              bridge.py  (mesmo host do OpenClaw)                                    │
   │  init:  lê persona (IDENTITY/SOUL/AGENTS.md) + histórico (sessions.json -> .jsonl) + memory search  │
   │         -> devolve conversation_config_override (prompt + first_message + language)                 │
   │  jesus: openclaw agent --message <fala> --to <caller> --channel whatsapp --json  (1 turno ao vivo)  │
   │  postcall: grava a transcrição em workspace/memory/AAAA-MM-DD.md                                    │
   └──────────────────────────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
   OpenClaw / Jesus  (binário `openclaw`, workspace, sessions, memory)
```

Resultado: o Jesus atende a ligação **já sabendo quem é** e **continuando a relação** do WhatsApp — não se reapresenta do zero.

| Endpoint | Tipo na ElevenLabs | Autenticação | O que faz |
|---|---|---|---|
| `POST /elevenlabs/init` | Conversation initiation webhook | HMAC `ElevenLabs-Signature` | Injeta persona + histórico via `conversation_config_override`. **Tem que ser RÁPIDO** (não roda turno do Jesus). |
| `POST /elevenlabs/jesus` | Server tool (`consultar_jesus`) | `Authorization: Bearer` | Roda **1 turno real** do Jesus e devolve `reply`. |
| `POST /elevenlabs/postcall` | Post-call webhook | HMAC `ElevenLabs-Signature` | Grava a transcrição em `memory/AAAA-MM-DD.md`. |
| `GET /health` | — | nenhuma | `{"ok": true, "agent": ...}` para healthcheck. |

---

## 2. Pré-requisitos

| Requisito | Detalhe |
|---|---|
| VPS com OpenClaw + Jesus rodando | O binário `openclaw` precisa estar no `PATH` (ou aponte `OPENCLAW_BIN`). O workspace do Jesus precisa ter `IDENTITY.md` / `SOUL.md` / `AGENTS.md`. |
| `python3` (stdlib apenas) | `central.py` e `bridge.py` **não têm dependências externas**. Não precisa de `pip install`. |
| Domínio + HTTPS | A ElevenLabs só chama webhooks HTTPS. Você vai expor o bridge (porta `8077`) atrás de um reverse proxy (Caddy/nginx) com TLS. |
| Conta ElevenLabs | Com acesso a Conversational AI (Agents) e API Key. |
| Conta Wavoip | Com um **device** (token) e um número de WhatsApp conectado. **1 device = 1 chamada simultânea.** |
| `pm2` (recomendado) | Para manter o `bridge.py` no ar (`ecosystem.bridge.cjs` incluído). |

> **Importante:** o `bridge.py` lê o workspace, as `sessions` e a `memory` do OpenClaw **no disco local**. Por isso ele **tem que rodar no mesmo VPS do Jesus** — não funciona em outra máquina.

Prepare o `.env`:

```bash
cp /opt/central-voz-wavoip/.env.example /opt/central-voz-wavoip/.env
```

Ajuste o caminho `/opt/central-voz-wavoip` para onde você clonou o projeto no VPS. Os exemplos abaixo assumem que você está **dentro do diretório do projeto**.

---

## 3. Parte A — Agente de voz + SIP (ElevenLabs ↔ Wavoip)

### 3.1 Preencher o `.env` (bloco ElevenLabs + Wavoip)

| Variável | Onde obter |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs → Profile → API Keys. |
| `ELEVENLABS_VOICE_ID` | Descubra no passo 3.2. Prefira voz multilíngue/pt-BR. |
| `WAVOIP_TOKEN` | Token do **device** no painel Wavoip (cada device = 1 chamada). |
| `WHATSAPP_NUMBER` | Número conectado no Wavoip em **E.164** (ex.: `+5516999999999`). Tem que bater **exatamente** com o `Caller_ID` do painel SIP. |
| `AGENT_NAME` / `AGENT_LLM` / `TTS_MODEL` | Opcionais. Padrões: `Central de Voz`, `gemini-2.0-flash`, `eleven_flash_v2_5`. |

`AGENT_ID` e `PHONE_NUMBER_ID` são preenchidos automaticamente pelos comandos — **não edite à mão**.

A persona/instruções base do agente de voz vêm de `agente/prompt.md`.

### 3.2 Listar as vozes (achar o `voice_id` pt-BR)

```bash
python3 central.py listar-vozes
```

Copie o ID desejado para `ELEVENLABS_VOICE_ID` no `.env`.

### 3.3 Setup (cria agente + número + configura SIP)

```bash
python3 central.py setup
```

Isso roda em sequência:

| Passo | Comando interno | O que faz | Salva no `.env` |
|---|---|---|---|
| 1/3 | `criar-agente` | `POST /v1/convai/agents/create` usando `agente/prompt.md`. | `AGENT_ID` |
| 2/3 | `criar-numero` | `POST /v1/convai/phone-numbers/create` (provider `sip_trunk`, termination `sipv2.wavoip.com`). | `PHONE_NUMBER_ID` |
| 3/3 | `configurar-sip` | `PATCH /v1/convai/phone-numbers/{id}` com agente + credenciais Wavoip (inbound/outbound). **Passo obrigatório** — o `create` sozinho não salva credencial. | — |

Se preferir rodar avulso: `python3 central.py criar-agente`, depois `criar-numero`, depois `configurar-sip`.

### 3.4 Verificar

```bash
python3 central.py verificar
```

Confirme **`Inbound creds: True`** (`has_auth_credentials`) e o nome do agente atribuído. Se vier diferente, rode `python3 central.py configurar-sip` de novo.

### 3.5 Painel SIP do Wavoip

No painel do Wavoip (`app.wavoip.com` → Integrações → SIP), configure o destino do device para a ElevenLabs:

| Campo | Valor |
|---|---|
| Caller_ID | `WHATSAPP_NUMBER` em E.164 (ex.: `+5516999999999`) — **idêntico** ao `.env` |
| Host / IP | `sip.rtc.elevenlabs.io` |
| Porta | `5060` |
| Transporte | **TCP** |

> **Atenção (ponto sensível):** o `caller_id` do contato **pode não chegar** no SIP do Wavoip. Se o Wavoip oferecer cabeçalho customizado, configure **`X-Caller-ID`** com o número do chamador — é dele que o bridge depende para carregar histórico. Sem isso, o Jesus atende com a persona mas **sem histórico**. Veja a validação na seção 6.

---

## 4. Parte B — Bridge de contexto (Jesus / OpenClaw)

### 4.1 Ajustar o `.env` (blocos Bridge + OpenClaw)

| Variável | Valor |
|---|---|
| `BRIDGE_PUBLIC_URL` | URL HTTPS pública do bridge (ex.: `https://central.seudominio.com`). |
| `BRIDGE_PORT` | Porta local do bridge. Padrão `8077`. |
| `EL_INIT_WEBHOOK_SECRET` | Secret do init webhook (gerado pela ElevenLabs no passo 4.5). |
| `EL_POSTCALL_WEBHOOK_SECRET` | Secret do post-call webhook (passo 4.5). |
| `BRIDGE_TOOL_BEARER` | Token aleatório forte para o server tool. Gere com `openssl rand -hex 32`. |
| `EL_VERIFY_SIGNATURES` | `1` em produção. `0` só para teste inicial (ver seção 6). |
| `OPENCLAW_BIN` | Caminho do binário. `openclaw` se estiver no `PATH`. |
| `OPENCLAW_HOME` | Padrão `~/.openclaw`. |
| `OPENCLAW_WORKSPACE` | Padrão `~/.openclaw/workspace` (onde estão `IDENTITY.md`/`SOUL.md`/`AGENTS.md`). |
| `OPENCLAW_AGENT_ID` | **No VPS provavelmente `jesus`** (o `.env.example` traz `main`). Confirme com seu setup OpenClaw. |
| `OPENCLAW_CHANNEL` | `whatsapp`. |

> O `bridge.py` dá prioridade às variáveis do **ambiente do processo** (pm2/systemd) sobre o `.env`. Defina-as em um só lugar para evitar confusão.

### 4.2 Selftest (valida persona + histórico **sem** ElevenLabs)

```bash
python3 bridge.py selftest +5511988642668
```

Troque pelo número de um contato real que **já conversou** com o Jesus no WhatsApp. A saída mostra:

```
OPENCLAW_BIN=openclaw  AGENT=jesus  WORKSPACE=/root/.openclaw/workspace
persona: 3842 chars | histórico: 1190 chars
--- resposta /init que iria pro ElevenLabs ---
{ ...conversation_config_override... }
```

Checklist do selftest:

- `persona` > 0 → leu `IDENTITY.md`/`SOUL.md`/`AGENTS.md` (senão, confira `OPENCLAW_WORKSPACE`).
- `histórico` > 0 → achou a sessão do contato (senão, confira `OPENCLAW_AGENT_ID` e o path real das sessões — ver seção 6).
- O JSON traz `conversation_config_override.agent.prompt.prompt` com persona + contexto.

### 4.3 Subir o bridge com pm2

```bash
pm2 start ecosystem.bridge.cjs
pm2 logs bridge-jesus
pm2 save
```

O processo `bridge-jesus` roda `python3 bridge.py` na pasta do projeto e lê o `.env` sozinho. Teste local:

```bash
curl -s http://127.0.0.1:8077/health
# {"ok": true, "agent": "jesus"}
```

### 4.4 Expor por HTTPS (reverse proxy no `:8077`)

O bridge escuta em `0.0.0.0:8077` (HTTP puro). Coloque um reverse proxy TLS na frente. `BRIDGE_PUBLIC_URL` deve apontar para esse domínio.

**Caddy** (`/etc/caddy/Caddyfile`):

```caddy
central.seudominio.com {
    reverse_proxy 127.0.0.1:8077
}
```

```bash
sudo systemctl reload caddy
```

**nginx** (equivalente):

```nginx
server {
    listen 443 ssl;
    server_name central.seudominio.com;
    # ssl_certificate / ssl_certificate_key (ex.: certbot)

    location / {
        proxy_pass         http://127.0.0.1:8077;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $remote_addr;
    }
}
```

Valide o caminho público:

```bash
curl -s https://central.seudominio.com/health
```

### 4.5 Criar o server tool, habilitar overrides e apontar os webhooks

**a) Criar o tool `consultar_jesus`** (`POST /v1/convai/tools` + anexa ao agente):

```bash
python3 central.py criar-tool-jesus
```

Requer `BRIDGE_PUBLIC_URL`, `BRIDGE_TOOL_BEARER`, `AGENT_ID` no `.env`. O tool aponta para `BRIDGE_PUBLIC_URL/elevenlabs/jesus`, manda `Authorization: Bearer <BRIDGE_TOOL_BEARER>`, e captura `reply` da resposta na variável `jesus_reply`. Salva `TOOL_ID` no `.env`.

**b) Habilitar overrides (CRÍTICO) e ver os webhooks:**

```bash
python3 central.py configurar-contexto
```

Faz `PATCH` no agente habilitando a **allow-list de overrides** (`prompt`, `first_message`, `language`). **Sem isso, o `conversation_config_override` enviado pelo `/init` é descartado em silêncio** — o Jesus atenderia genérico, sem persona nem histórico. O comando imprime os 2 webhooks a configurar:

```
• Conversation initiation webhook → https://central.seudominio.com/elevenlabs/init
• Post-call webhook               → https://central.seudominio.com/elevenlabs/postcall
```

**c) No painel da ElevenLabs (Agent → Security/Webhooks):**

| Webhook | URL | Guarde o secret em |
|---|---|---|
| Conversation initiation | `BRIDGE_PUBLIC_URL/elevenlabs/init` | `EL_INIT_WEBHOOK_SECRET` |
| Post-call | `BRIDGE_PUBLIC_URL/elevenlabs/postcall` | `EL_POSTCALL_WEBHOOK_SECRET` |

Cole os secrets no `.env` e reinicie o bridge:

```bash
pm2 restart bridge-jesus
```

---

## 5. Teste ponta-a-ponta

1. Pelo WhatsApp, **ligue** para o número (`WHATSAPP_NUMBER`).
2. O Jesus atende em voz pt-BR. Com histórico, a primeira fala é *"Oi! Aqui é o Jesus de novo. Em que posso ajudar hoje?"*; em primeiro contato, *"Oi! Aqui é o Jesus. Como posso ajudar?"*.
3. Pergunte algo que ele já saiba (do WhatsApp) → ele responde **com contexto**.
4. Peça algo que exija raciocínio/dados novos → ele aciona `consultar_jesus` (1 turno ao vivo) e responde.
5. Desligue. A transcrição é gravada em `OPENCLAW_WORKSPACE/memory/AAAA-MM-DD.md`.

Acompanhe em paralelo: `pm2 logs bridge-jesus`.

---

## 6. Validações críticas na 1ª ligação

| Validação | Como checar | Se falhar |
|---|---|---|
| **O `caller_id` chega?** | `pm2 logs bridge-jesus` durante a ligação. Se aparecer `init sem caller_id`, o número não veio pelo SIP. | Configure **`X-Caller-ID`** com o número do chamador no painel SIP do Wavoip. O bridge usa `caller_id` do corpo — **nunca** `call_sid` (vazio no SIP). |
| **Overrides aplicados?** | Faça um `GET` do agente e confira que `platform_settings.overrides.conversation_config_override` lista `prompt`, `first_message`, `language` como permitidos. | Rode `python3 central.py configurar-contexto`. Sem a allow-list, o prompt do `/init` é silenciosamente ignorado. |
| **Path real da sessão do Jesus** | O bridge procura `OPENCLAW_HOME/agents/<OPENCLAW_AGENT_ID>/sessions/sessions.json` e depois `<uuid>.jsonl`. Confirme que esse arquivo existe no VPS e que `OPENCLAW_AGENT_ID` está certo (provavelmente `jesus`). | As sessões são **UUID + `sessions.json`** — **não dá para fazer glob por número**. O bridge casa o número (só dígitos) + o canal dentro do `sessions.json` para achar o UUID. Se o layout do seu OpenClaw for outro, o histórico volta vazio. |
| **HMAC bate?** | Se `/init` ou `/postcall` retornarem `401 bad signature`, a verificação de assinatura está falhando. | Formato esperado: `ElevenLabs-Signature: t=<ts>,v0=<hex>`, payload `"<ts>.<corpo>"`, HMAC-SHA256 do secret (tolerância 30 min). **Confirme contra o SDK da ElevenLabs.** Para destravar só no teste: `EL_VERIFY_SIGNATURES=0` no `.env`, `pm2 restart bridge-jesus`, valide o fluxo, e **religue (`=1`) em produção**. |

> Faça o selftest (seção 4.2) **antes** da 1ª ligação real: ele valida persona + histórico sem depender da ElevenLabs e elimina metade dos problemas acima.

---

## 7. Troubleshooting

| Sintoma | Causa provável / correção |
|---|---|
| `has_auth_credentials != true` em `verificar` | Rode `python3 central.py configurar-sip` (o PATCH, não o create). |
| Liga, conecta e cai | `Caller_ID` do Wavoip ≠ `WHATSAPP_NUMBER`. Confira `sip.rtc.elevenlabs.io`, porta `5060`, **TCP**. |
| Número "já existe" | Registrado em outra conta ElevenLabs — remova de lá. |
| Atende genérico, sem persona | Overrides não habilitados → `python3 central.py configurar-contexto`. |
| Atende com persona mas sem histórico | `caller_id` não chegou **ou** `OPENCLAW_AGENT_ID`/path errado → `X-Caller-ID` no Wavoip; ajuste `OPENCLAW_AGENT_ID`; rode o selftest. |
| `401 bad signature` nos webhooks | Secret errado ou formato HMAC → reconfira `EL_INIT_WEBHOOK_SECRET`/`EL_POSTCALL_WEBHOOK_SECRET`; em último caso `EL_VERIFY_SIGNATURES=0` só para teste. |
| `consultar_jesus` retorna `401 unauthorized` | `BRIDGE_TOOL_BEARER` no `.env` ≠ Bearer do tool → recrie com `python3 central.py criar-tool-jesus`. |
| Tool responde "Deixa eu verificar isso e já te retorno" | `openclaw agent` falhou/expirou → `pm2 logs bridge-jesus`; confira `OPENCLAW_BIN`, `OPENCLAW_AGENT_ID` e o teto de ~25-30s do turno. |
| `binário não encontrado: openclaw` | `OPENCLAW_BIN` fora do `PATH` do pm2 → aponte o caminho absoluto em `OPENCLAW_BIN`. |
| Transcrição não aparece em `memory/` | Post-call webhook não configurado ou `type` ≠ `post_call_transcription` → confira o webhook no painel; veja permissão de escrita em `OPENCLAW_WORKSPACE/memory`. |
| Webhook não chega ao bridge | Reverse proxy / TLS → `curl https://.../health`; revise Caddy/nginx e `BRIDGE_PUBLIC_URL`. |
| Latência alta na voz | Use `eleven_flash_v2_5` (já é o default) em `TTS_MODEL`. |

### Nota de concorrência

**1 device Wavoip = 1 chamada simultânea.** Cada `WAVOIP_TOKEN` atende **uma** ligação por vez; chamadas concorrentes exigem devices/tokens (e números) adicionais. O `bridge.py` é multi-thread (`ThreadingHTTPServer`) e aguenta requisições paralelas, mas o limite real de chamadas simultâneas é imposto pelo Wavoip, não pelo bridge.

---

## Referência rápida de comandos

```bash
# Parte A — agente + SIP (ElevenLabs <-> Wavoip)
python3 central.py listar-vozes
python3 central.py setup            # criar-agente + criar-numero + configurar-sip + verificar
python3 central.py verificar

# Parte B — bridge de contexto (Jesus / OpenClaw)
python3 bridge.py selftest +55XXXXXXXXXXX
pm2 start ecosystem.bridge.cjs
python3 central.py criar-tool-jesus
python3 central.py configurar-contexto
pm2 restart bridge-jesus
```

Arquivos do projeto: `central.py` (CLI ElevenLabs/SIP), `bridge.py` (webhooks + acesso ao OpenClaw), `agente/prompt.md` (persona base do agente de voz), `ecosystem.bridge.cjs` (pm2), `.env` / `.env.example` (configuração).
