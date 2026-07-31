#!/usr/bin/env python3
"""
Central de Voz — Wavoip → ElevenLabs Agents (SIP nativo, inbound).

CLI sem dependências externas (só stdlib). Lê config do .env ao lado deste arquivo.

Comandos:
  listar-vozes      Lista vozes da sua conta ElevenLabs (para achar o voice_id pt-BR)
  criar-agente      Cria o agente no ElevenLabs a partir de agente/prompt.md
  criar-numero      Registra o número como SIP trunk no ElevenLabs
  configurar-sip    PATCH com agente + credenciais SIP (passo OBRIGATÓRIO)
  criar-tool-jesus  Cria o server tool consultar_jesus e anexa ao agente (híbrido 🅐)
  configurar-contexto  Habilita overrides + mostra webhooks (init/post-call) p/ o bridge
  verificar         Mostra o estado do número/SIP (confirma has_auth_credentials)
  setup             Roda criar-agente + criar-numero + configurar-sip em sequência

Uso: python3 central.py <comando>
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://api.elevenlabs.io"
WAVOIP_TERMINATION = "sipv2.wavoip.com"
HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
PROMPT_PATH = os.path.join(HERE, "agente", "prompt.md")


# ---------- .env ----------
def carregar_env():
    cfg = {}
    if not os.path.exists(ENV_PATH):
        erro(f".env não encontrado em {ENV_PATH}")
    with open(ENV_PATH, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, _, valor = linha.partition("=")
            cfg[chave.strip()] = valor.strip()
    return cfg


def salvar_env(chave, valor):
    """Atualiza (ou adiciona) uma variável no .env, preservando o resto."""
    linhas = []
    achou = False
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            linhas = f.readlines()
    for i, linha in enumerate(linhas):
        if linha.strip().startswith(f"{chave}="):
            linhas[i] = f"{chave}={valor}\n"
            achou = True
            break
    if not achou:
        linhas.append(f"{chave}={valor}\n")
    tmp = ENV_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.writelines(linhas)
    os.replace(tmp, ENV_PATH)  # atômico no mesmo filesystem


def exigir(cfg, *chaves):
    faltando = [c for c in chaves if cfg.get(c) is None or cfg.get(c) == ""]
    if faltando:
        erro("Preencha no .env: " + ", ".join(faltando))


# ---------- helpers ----------
def erro(msg):
    print(f"\n❌ {msg}\n", file=sys.stderr)
    sys.exit(1)


def ok(msg):
    print(f"✅ {msg}")


def api(metodo, caminho, api_key, body=None):
    url = BASE + caminho
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=metodo)
    req.add_header("xi-api-key", api_key)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            corpo = resp.read().decode("utf-8")
            return json.loads(corpo) if corpo else {}
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode("utf-8", "replace")
        erro(f"{metodo} {caminho} → HTTP {e.code}\n{detalhe}")
    except urllib.error.URLError as e:
        erro(f"Falha de rede em {metodo} {caminho}: {e.reason}")


# ---------- comandos ----------
def cmd_listar_vozes(cfg):
    exigir(cfg, "ELEVENLABS_API_KEY")
    dados = api("GET", "/v1/voices", cfg["ELEVENLABS_API_KEY"])
    print("\nVOZES NA SUA CONTA (use o ID em ELEVENLABS_VOICE_ID):\n")
    for v in dados.get("voices", []):
        labels = v.get("labels", {}) or {}
        idioma = labels.get("language", labels.get("accent", ""))
        print(f"  {v.get('voice_id')}  |  {v.get('name')}  {('('+idioma+')') if idioma else ''}")
    print("\n(Dica: prefira uma voz multilíngue/pt-BR.)\n")


def cmd_criar_agente(cfg):
    exigir(cfg, "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID")
    if not os.path.exists(PROMPT_PATH):
        erro(f"prompt não encontrado em {PROMPT_PATH}")
    with open(PROMPT_PATH, encoding="utf-8") as f:
        prompt = f.read().strip()
    body = {
        "name": cfg.get("AGENT_NAME", "Central de Voz"),
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": prompt,
                    "llm": cfg.get("AGENT_LLM", "gemini-2.0-flash"),
                    "temperature": 0.5,
                },
                "first_message": "Olá! Aqui é a central de atendimento. Com quem eu falo?",
                "language": "pt",
            },
            "tts": {
                "model_id": cfg.get("TTS_MODEL", "eleven_flash_v2_5"),
                "voice_id": cfg["ELEVENLABS_VOICE_ID"],
            },
        },
        "tags": ["wavoip", "central-voz"],
    }
    res = api("POST", "/v1/convai/agents/create", cfg["ELEVENLABS_API_KEY"], body)
    agent_id = res.get("agent_id")
    if not agent_id:
        erro(f"Resposta sem agent_id: {res}")
    salvar_env("AGENT_ID", agent_id)
    ok(f"Agente criado: {agent_id} (salvo em AGENT_ID)")


def _achar_numero(cfg):
    """Procura um phone number já registrado com o WHATSAPP_NUMBER. Retorna id ou None."""
    res = api("GET", "/v1/convai/phone-numbers", cfg["ELEVENLABS_API_KEY"])
    lista = res if isinstance(res, list) else (res.get("phone_numbers") or [])
    for pn in lista:
        if pn.get("phone_number") == cfg["WHATSAPP_NUMBER"]:
            return pn.get("phone_number_id") or pn.get("id")
    return None


def cmd_criar_numero(cfg):
    exigir(cfg, "ELEVENLABS_API_KEY", "WHATSAPP_NUMBER")
    if not cfg["WHATSAPP_NUMBER"].startswith("+"):
        erro("WHATSAPP_NUMBER precisa estar em E.164 começando com + (ex.: +5516999999999)")
    existente = _achar_numero(cfg)
    if existente:
        salvar_env("PHONE_NUMBER_ID", existente)
        ok(f"Número já registrado, reusando: {existente} (vou só reconfigurar via PATCH)")
        return
    body = {
        "phone_number": cfg["WHATSAPP_NUMBER"],
        "label": "whatsapp-wavoip",
        "provider": "sip_trunk",
        "termination_uri": WAVOIP_TERMINATION,
    }
    res = api("POST", "/v1/convai/phone-numbers/create", cfg["ELEVENLABS_API_KEY"], body)
    pid = res.get("phone_number_id")
    if not pid:
        erro(f"Resposta sem phone_number_id: {res}")
    salvar_env("PHONE_NUMBER_ID", pid)
    ok(f"Número registrado: {pid} (salvo em PHONE_NUMBER_ID)")


def cmd_configurar_sip(cfg):
    exigir(cfg, "ELEVENLABS_API_KEY", "AGENT_ID", "PHONE_NUMBER_ID")
    # Credenciais SIP do Wavoip (Financeiro → Credenciais SIP). Fallback: token do device.
    user = cfg.get("WAVOIP_SIP_USER") or cfg.get("WAVOIP_TOKEN")
    pwd = cfg.get("WAVOIP_SIP_PASSWORD") or cfg.get("WAVOIP_TOKEN")
    if not user or not pwd:
        erro("Defina WAVOIP_SIP_USER e WAVOIP_SIP_PASSWORD (ou WAVOIP_TOKEN) no .env")
    body = {
        "agent_id": cfg["AGENT_ID"],
        "inbound_trunk_config": {
            "allowed_addresses": ["0.0.0.0/0"],
            "media_encryption": "allowed",
            "credentials": {"username": user, "password": pwd},
            "remote_domains": [WAVOIP_TERMINATION],
        },
        "outbound_trunk_config": {
            "address": WAVOIP_TERMINATION,
            "transport": "tcp",
            "media_encryption": "allowed",
            "credentials": {"username": user, "password": pwd},
        },
    }
    caminho = f"/v1/convai/phone-numbers/{cfg['PHONE_NUMBER_ID']}"
    api("PATCH", caminho, cfg["ELEVENLABS_API_KEY"], body)
    ok("SIP configurado (agente + credenciais Wavoip). Rode `verificar` para confirmar.")


def cmd_verificar(cfg):
    exigir(cfg, "ELEVENLABS_API_KEY", "PHONE_NUMBER_ID")
    caminho = f"/v1/convai/phone-numbers/{cfg['PHONE_NUMBER_ID']}"
    d = api("GET", caminho, cfg["ELEVENLABS_API_KEY"])
    inbound = d.get("inbound_trunk", {}) or {}
    outbound = d.get("outbound_trunk", {}) or {}
    agente = d.get("assigned_agent", {}) or {}
    print("\n--- ESTADO DO NÚMERO ---")
    print(f"Número:          {d.get('phone_number')}")
    print(f"Agente:          {agente.get('agent_name', 'NENHUM ⚠️')}")
    print(f"Inbound creds:   {inbound.get('has_auth_credentials')}")
    print(f"Outbound addr:   {outbound.get('address', 'não configurado')}")
    print(f"Outbound creds:  {outbound.get('has_auth_credentials')}")
    print("------------------------\n")
    if inbound.get("has_auth_credentials"):
        ok("Credenciais inbound OK. Agora configure o painel SIP do Wavoip (ver README).")
    else:
        print("⚠️  has_auth_credentials != true → rode `configurar-sip` (PATCH).")


def cmd_setup(cfg):
    print("\n▶ 1/3 criar-agente");   cmd_criar_agente(carregar_env())
    print("\n▶ 2/3 criar-numero");   cmd_criar_numero(carregar_env())
    print("\n▶ 3/3 configurar-sip"); cmd_configurar_sip(carregar_env())
    print("\n▶ Verificação:");       cmd_verificar(carregar_env())


def cmd_criar_tool_jesus(cfg):
    """Cria o server tool consultar_jesus (híbrido 🅐) e anexa ao agente."""
    exigir(cfg, "ELEVENLABS_API_KEY", "BRIDGE_PUBLIC_URL", "BRIDGE_TOOL_BEARER", "AGENT_ID")
    url = cfg["BRIDGE_PUBLIC_URL"].rstrip("/") + "/elevenlabs/jesus"
    body = {
        "tool_config": {
            "type": "webhook",
            "name": "consultar_jesus",
            "description": ("Quando o caller pedir algo que exige consultar dados ou raciocinar "
                            "fora do contexto já carregado, roda 1 turno do Jesus e devolve 'reply'. "
                            "Fale de volta exatamente o conteúdo de 'reply'."),
            "response_timeout_secs": 30,
            "api_schema": {
                "url": url,
                "method": "POST",
                "request_headers": {"Authorization": f"Bearer {cfg['BRIDGE_TOOL_BEARER']}"},
                "request_body_schema": {
                    "type": "object",
                    "required": ["caller_id", "user_message"],
                    "properties": {
                        "caller_id": {"type": "string", "dynamic_variable": "system__caller_id"},
                        "user_message": {"type": "string",
                                         "description": "A última fala do caller, transcrita."},
                    },
                },
            },
        }
    }
    res = api("POST", "/v1/convai/tools", cfg["ELEVENLABS_API_KEY"], body)
    tool_id = res.get("id") or res.get("tool_id") or (res.get("tool", {}) or {}).get("id")
    if not tool_id:
        erro(f"Resposta sem tool id: {res}")
    salvar_env("TOOL_ID", tool_id)
    ok(f"Tool consultar_jesus criada: {tool_id}")
    # anexa ao agente PRESERVANDO tools já existentes (PATCH substitui o array inteiro)
    atual = api("GET", f"/v1/convai/agents/{cfg['AGENT_ID']}", cfg["ELEVENLABS_API_KEY"])
    prompt = (((atual.get("conversation_config") or {}).get("agent") or {}).get("prompt") or {})
    existentes = prompt.get("tool_ids") or []
    novos = list(dict.fromkeys([*existentes, tool_id]))
    attach = {"conversation_config": {"agent": {"prompt": {"tool_ids": novos}}}}
    api("PATCH", f"/v1/convai/agents/{cfg['AGENT_ID']}", cfg["ELEVENLABS_API_KEY"], attach)
    ok(f"Tool anexada ao agente (tool_ids: {len(novos)}).")


def _anexar_tool(cfg, tool_id):
    """Anexa um tool_id ao agente preservando os existentes (PATCH troca o array)."""
    atual = api("GET", f"/v1/convai/agents/{cfg['AGENT_ID']}", cfg["ELEVENLABS_API_KEY"])
    prompt = (((atual.get("conversation_config") or {}).get("agent") or {}).get("prompt") or {})
    novos = list(dict.fromkeys([*(prompt.get("tool_ids") or []), tool_id]))
    attach = {"conversation_config": {"agent": {"prompt": {"tool_ids": novos}}}}
    api("PATCH", f"/v1/convai/agents/{cfg['AGENT_ID']}", cfg["ELEVENLABS_API_KEY"], attach)
    ok(f"Tool anexada (tool_ids: {len(novos)}).")


def cmd_criar_tool_enviar(cfg):
    """Cria o server tool enviar_no_whatsapp (ação durante a ligação) e anexa ao agente."""
    exigir(cfg, "ELEVENLABS_API_KEY", "BRIDGE_PUBLIC_URL", "BRIDGE_TOOL_BEARER", "AGENT_ID")
    url = cfg["BRIDGE_PUBLIC_URL"].rstrip("/") + "/elevenlabs/enviar"
    body = {
        "tool_config": {
            "type": "webhook",
            "name": "enviar_no_whatsapp",
            "description": ("Use SEMPRE que o cliente pedir para RECEBER algo no WhatsApp durante a "
                            "ligação (ex.: 'me manda um relatório disso', 'envia no meu zap', "
                            "'manda o resumo'). Gera e envia no WhatsApp do cliente. Depois de chamar, "
                            "diga ao cliente que já está enviando no WhatsApp dele."),
            "response_timeout_secs": 20,
            "api_schema": {
                "url": url,
                "method": "POST",
                "request_headers": {"Authorization": f"Bearer {cfg['BRIDGE_TOOL_BEARER']}"},
                "request_body_schema": {
                    "type": "object",
                    "required": ["caller_id", "pedido"],
                    "properties": {
                        "caller_id": {"type": "string", "dynamic_variable": "system__caller_id"},
                        "pedido": {"type": "string",
                                   "description": "O que o cliente pediu para receber no WhatsApp, em detalhe."},
                    },
                },
            },
        }
    }
    res = api("POST", "/v1/convai/tools", cfg["ELEVENLABS_API_KEY"], body)
    tool_id = res.get("id") or res.get("tool_id") or (res.get("tool", {}) or {}).get("id")
    if not tool_id:
        erro(f"Resposta sem tool id: {res}")
    salvar_env("TOOL_ENVIAR_ID", tool_id)
    ok(f"Tool enviar_no_whatsapp criada: {tool_id}")
    _anexar_tool(cfg, tool_id)


def cmd_configurar_contexto(cfg):
    """Habilita overrides (CRÍTICO) e mostra os webhooks a apontar pro bridge."""
    exigir(cfg, "ELEVENLABS_API_KEY", "AGENT_ID", "BRIDGE_PUBLIC_URL")
    # Allow-list de overrides: sem isto o prompt/first_message do /init é descartado em silêncio.
    body = {
        "platform_settings": {
            "overrides": {
                "conversation_config_override": {
                    "agent": {"prompt": {"prompt": True}, "first_message": True, "language": True}
                }
            }
        }
    }
    api("PATCH", f"/v1/convai/agents/{cfg['AGENT_ID']}", cfg["ELEVENLABS_API_KEY"], body)
    ok("Overrides habilitados (prompt + first_message + language).")
    base = cfg["BRIDGE_PUBLIC_URL"].rstrip("/")
    print("\n⚠️  No painel ElevenLabs (Security/Webhooks do agente), aponte:")
    print(f"   • Conversation initiation webhook → {base}/elevenlabs/init")
    print("       (guarde o secret em EL_INIT_WEBHOOK_SECRET)")
    print(f"   • Post-call webhook              → {base}/elevenlabs/postcall")
    print("       (guarde o secret em EL_POSTCALL_WEBHOOK_SECRET)")
    print("   Confirme com: python3 central.py verificar  e um GET do agente.\n")


COMANDOS = {
    "listar-vozes": cmd_listar_vozes,
    "criar-agente": cmd_criar_agente,
    "criar-numero": cmd_criar_numero,
    "configurar-sip": cmd_configurar_sip,
    "criar-tool-jesus": cmd_criar_tool_jesus,
    "criar-tool-enviar": cmd_criar_tool_enviar,
    "configurar-contexto": cmd_configurar_contexto,
    "verificar": cmd_verificar,
    "setup": cmd_setup,
}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in COMANDOS:
        print(__doc__)
        sys.exit(0 if len(sys.argv) == 1 else 1)
    COMANDOS[sys.argv[1]](carregar_env())


if __name__ == "__main__":
    main()
