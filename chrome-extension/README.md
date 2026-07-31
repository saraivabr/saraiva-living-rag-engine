# Cliente Pronto — Extensão Chrome

Acesso beta Manifest V3 que conecta o Cliente Pronto ao WhatsApp Web já autenticado.

## O que funciona

- painel lateral no Chrome;
- leitura do link da aba atual quando ela é um perfil do Google Maps;
- validação do código de acesso gratuito ou pago;
- uma prospecção no teste ou dez no pacote pago;
- geração ou recuperação do dossiê pelo backend existente;
- diagnóstico, três abordagens, oferta, proposta, contrato, prompt e checklist;
- mensagem editável;
- envio assistido pelo WhatsApp Web após confirmação explícita;
- intenção de envio com expiração e proteção contra duplicidade;
- funil e follow-up salvos localmente.

## Instalação local

1. Execute `npm test`.
2. Execute `npm run package`.
3. Abra `chrome://extensions`.
4. Ative o **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação**.
6. Selecione a pasta `chrome-extension/output/cliente-pronto`.
7. Fixe a extensão e clique no ícone para abrir o painel lateral.

## Uso

1. Abra um negócio específico no Google Maps.
2. Abra o Cliente Pronto.
3. Informe o código de acesso exibido após o cadastro ou pagamento.
4. Gere ou recupere o dossiê.
5. Escolha e revise uma abordagem.
6. Confirme o telefone e a autorização de contato.
7. Clique em **Enviar pelo WhatsApp Web**.

O WhatsApp Web precisa estar conectado no mesmo perfil do Chrome. O protótipo registra “envio acionado”; isso não equivale a confirmação de entrega ou leitura.

## Segurança

- sem acesso a cookies;
- sem leitura do histórico de conversas;
- sem JavaScript remoto;
- permissões limitadas ao backend e ao WhatsApp Web;
- nenhum token de Apify ou Woovi dentro da extensão;
- nenhum envio sem clique e confirmação.

## Limite atual

O teste gratuito libera uma empresa. O pacote pago libera até dez empresas. Repetir
a mesma empresa recupera o resultado mais recente sem consumir outra prospecção.
