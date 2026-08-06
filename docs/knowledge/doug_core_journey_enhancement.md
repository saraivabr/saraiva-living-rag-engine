# Plano de Aprimoramento da Jornada do Usuário (Doug Deep Core)

> **"O método é simples porque a execução tem que ser brutal."**  
> *Integração do Doug Deep Core v20250520 na Arquitetura do Instagram SaraivaOS*

---

## 📍 1. Diagnóstico da Jornada Atual (Visão Brutal)

Atualmente, o fluxo do Reel de Sites com ChatGPT (`DbUd5FKRVxf` / `18130447453725127`) entrega um caminho funcional:
1. **Comentário:** Usuário digita `SARAIVA`.
2. **Private Reply:** `"Vi seu comentário 👀 Vou te mostrar como criar um site..."` + Botão `"CRIAR MEU SITE"`.
3. **Áudio Saraiva (ElevenLabs):** Explica o `@Sites` e termina com `"Faz sentido pra você?"`.
4. **Card de Fechamento:** Card interativo levando ao grupo do WhatsApp.

### 🔴 As 3 Falhas da Jornada Atual (Sob a ótica do Doug Deep Core):

| Pilar Doug Core | Diagnóstico Brutal | O que está faltando |
| :--- | :--- | :--- |
| **P1 • NARRATIVA** | **Tensão Psicológica Insuficiente** | A DM inicial é meramente informativa (`"Vou te mostrar como..."`). Não instala dor nem expõe a mediocridade de continuar criando sites da forma antiga. |
| **P2 • PRESENÇA** | **Abordagem Anêmica** | O áudio atual explica o produto (`"No WhatsApp eu vou te mostrar..."`), mas não força o momento de ruptura. Falta a Dissecação Neural antes do convite. |
| **P3 • MONETIZAÇÃO** | **Transição Passiva no WhatsApp** | Ao chegar no grupo do WhatsApp, o lead não está "tensionado" o suficiente para agir. Ele consome o conteúdo e vira "passivo". |

---

## ⚡ 2. Reformulação Proposta da Jornada (Engenharia de Tensão)

### 🎯 Fase 1: Private Reply (Instalação da Primeira Linha)
Substituir a mensagem morna por uma **Primeira Linha de Domínio Psicológico**:

- **Antes:** *"Vi seu comentário 👀 Vou te mostrar como criar um site profissional com o ChatGPT, mesmo sem saber programar."*
- **Depois (Doug Core):** *"Você comentou SARAIVA porque sabe que seu site atual (ou a falta dele) é um RALO de oportunidades. Clica abaixo pra ver o método exato de virar esse jogo em minutos."*
- **Botão:** `VER O MÉRITO` / `CRIAR MEU SITE`

---

### 🎙️ Fase 2: Script do Áudio Saraiva (Dissecação Neural + Convite Brutal)

- **Antes:**
  > *"Olha só, criar um site com o ChatGPT ficou muito mais simples. No WhatsApp eu vou te mostrar como abrir o @Sites, usar o prompt-base e revisar cada parte antes de publicar. Assim você não fica preso num resultado genérico e consegue deixar o site realmente profissional. Faz sentido pra você?"*

- **Depois (Com Dissecação Neural Doug Core):**
  > *"{Nome}, a maioria das pessoas passa semanas apanhando do WordPress ou pagando mil reais pra ter um site genérico que não converte ninguém. O que eu vou te mostrar no WhatsApp não é 'diquinha de ChatGPT' — é o prompt-base e a estrutura exata do @Sites pra você colocar um site profissional rodando hoje. Entra no botão aqui embaixo e pega o mapa antes que você perca mais um cliente pro seu concorrente. Faz sentido pra você?"*

---

### 📌 Fase 3: Card de Entrega (Oferta Tensionada)

- **Título do Card:** `Estrutura Pronta do @Sites`
- **Subtítulo:** `O prompt-base e o passo a passo exato para publicar seu site profissional hoje.`
- **Botão de Ação:** `ENTRAR NO GRUPO` (Levando à comunidade com a expectativa correta).

---

## 🛠️ 3. Próximos Passos de Implementação

1. **Atualizar `buildSaraivaAudioScript` em [`src/instagram/personalizedOffer.ts`](file:///Users/saraiva/_Projetos/respondedorinstagram/src/instagram/personalizedOffer.ts#L195-L210):**
   - Incorporar o roteiro de Dissecação Neural Doug Core para potencializar a taxa de clique no botão do Card.
2. **Submeter à Suíte de Testes Automatizados:**
   - Rodar `npx tsx --test tests/zernioSexyFlowV1.test.ts` para garantir que a frase final obrigatória `"Faz sentido pra você?"` e o limite de 20 caracteres nos botões permanecem 100% seguros.
3. **Publicação em Produção:**
   - Atualizar a AWS Lambda e comprovar no diário de execuções.
