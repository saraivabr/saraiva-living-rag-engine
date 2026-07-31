# Privacidade — Cliente Pronto

Versão beta: 0.1.0

## Finalidade

A extensão transforma um negócio escolhido pelo usuário em um dossiê comercial e, após confirmação explícita, aciona o envio de uma mensagem revisada pelo WhatsApp Web já autenticado.

## Dados processados

- código do pedido informado pelo usuário;
- link ou nome do negócio escolhido;
- cidade ou região;
- dados públicos devolvidos pelo motor Cliente Pronto;
- telefone e texto que o usuário confirmou para envio;
- etapa e data de follow-up salvas localmente.

## Armazenamento

- código do pedido, preferências e funil ficam no armazenamento local da extensão;
- a intenção de envio fica na memória de sessão do Chrome e expira em dois minutos;
- o histórico local de envio guarda somente os quatro últimos dígitos do telefone;
- segredos de Apify e Woovi permanecem no servidor.

## WhatsApp Web

A extensão injeta seu adaptador em `web.whatsapp.com` somente depois que o usuário solicita um envio e apenas na aba criada para essa intenção. Ela não:

- lê ou exporta a lista de conversas;
- coleta cookies;
- copia QR Code ou sessão;
- armazena mensagens recebidas;
- executa disparos em lote sem confirmação.

Para abrir a conversa com o texto preenchido, telefone e mensagem são enviados ao WhatsApp Web nos parâmetros da URL. O Chrome pode manter essa navegação no histórico conforme as configurações do navegador.

## Controle do usuário

O usuário pode remover todos os dados locais ao desinstalar a extensão ou limpar os dados da extensão no Chrome. Esta versão beta é distribuída por instalação direta e não foi publicada na Chrome Web Store.

## Contato

Para dúvidas ou solicitações: fellipesaraivabarbosa@gmail.com
