# Zernio Studio — Painel de Gestão (Estilo ManyChat)

Montei uma aplicação web dedicada para gestão visual das suas automações do Instagram + Zernio no estilo **ManyChat**.

![Preview do Zernio Studio](/Users/saraiva/.gemini/antigravity-cli/brain/17047839-9274-440c-835d-dc9edda84cac/preview.jpg)

---

## ⚡ Funcionalidades do Zernio Studio

1. **Visual Flow Builder (Canvas Interativo):**
   - Visualização em nós interativos conectando **Triggers de Entrada** → **Gate de Follow** → **Entrega de Conteúdo / Áudio**.
   - Ramos visuais claros para os três estados de follow: `following`, `not_following` e `unknown`.

2. **Gestão de Triggers & Entradas:**
   - Visualização dos gatilhos ativos: Comentários nos Posts/Reels, Resposta ao Story e Ice Breakers (`QUERO UMA ESTRUTURA`, `QUERO APRENDER`).
   - Painel explicativo sobre a **restrição de API do Instagram** (sem DMs automáticas para novos seguidores arbitrários).

3. **Configuração de Follow Gate:**
   - Ajuste direto das mensagens e botões (ex: botão `JÁ SEGUI` com payload `FLOW:SARAIVA:FOLLOW_CONFIRMED`).
   - Tratamento de status indisponível (`unknown`) sem falso negativo.

4. **Catálogo Determinístico de Conteúdos:**
   - Lista visual de conteúdos autorizados (`PROMPT`, `MAPA`, `AULA`, `AUTOMAÇÃO`, `PROSPECÇÃO` e `COMUNIDADE`).

5. **Métricas & Live Journal:**
   - Monitoramento do funil em tempo real (Conteúdos Solicitados, Follows Confirmados, Entregas Concluídas e Cliques no WhatsApp).
   - Live Feed do `Zernio Automation Journal`.

---

## 📂 Arquivos Criados na Aplicação Web

- **Página Principal do Studio:** [`site/zernio-studio.html`](file:///Users/saraiva/_Projetos/respondedorinstagram/site/zernio-studio.html)
- **Estilos CSS ManyChat (Dark Mode):** Adicionados ao [`site/styles.css`](file:///Users/saraiva/_Projetos/respondedorinstagram/site/styles.css)

Você pode visualizar e abrir o arquivo `site/zernio-studio.html` diretamente no seu navegador para explorar e gerenciar a interface!
