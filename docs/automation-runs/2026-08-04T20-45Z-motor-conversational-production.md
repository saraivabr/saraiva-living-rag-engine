# Motor conversacional no Instagram — produção

## Resultado

- Publicado na Lambda `respondedor-instagram-saraiva-os`, versão `35`, em 2026-08-04.
- Rollback preservado: versão `34`.
- Canário isolado aprovado: `respondedor-instagram-saraiva-os-copy-canary`, versão `8`.
- Canário e produção usam o mesmo `CodeSha256`: `Y1YbuR6lv9dEHI691zVkCtwk4A6Lyoj0cw7w8EHE0NM=`.
- Provider principal: Motor OpenAI-compatible em `https://motor.empresa.ia.br/v1`, modelo `cx/gpt-5.6-terra`.
- Contingência: Motor → Bedrock → resposta determinística segura.

## Segurança e operação

- A credencial do Motor fica no AWS Secrets Manager em `respondedor-instagram/production/motor`; ela não foi adicionada às variáveis da Lambda nem aos logs.
- A role da Lambda recebeu apenas `secretsmanager:GetSecretValue` para o ARN desse segredo.
- O cliente exige HTTPS, JSON estrito, resposta em PT-BR, no máximo uma pergunta e validação contra link, preço, promessa, placeholder e vazamento de instruções inventados.
- Timeout de 8 segundos cobre conexão e leitura do corpo; a resposta HTTP é limitada a 100 KB antes do parse.
- Em `ZERNIO_SEXYFLOW_MODE=live`, as mídias desse fluxo pertencem exclusivamente ao Zernio. O handler Graph não disputa comentário ou Direct dessas sessões.
- A entrega persiste separadamente o ID da mensagem do prompt e o ID do card. Se o texto do prompt receber `message.failed`, o checkpoint é invalidado e a sessão entra em pausa técnica.

## Contrato preservado

1. A conversa aceita texto livre e botões de apoio.
2. O follow é verificado somente pelo status confiável recebido do Zernio; status ausente nunca é inferido.
3. Após follow confirmado, saem exatamente duas mensagens: prompt na própria DM e card com o único link da Biblioteca.
4. A Biblioteca não é apresentada como gerador de prompts.
5. Depois da entrega, o assistente responde de forma curta, contextual e com no máximo uma pergunta útil.
6. Prompt, link, preço e oferta não são repetidos automaticamente.

## Validação

- Suíte completa final: 211 testes aprovados, 0 falhas.
- Typecheck: aprovado.
- Build: aprovado.
- Revisão TypeScript independente: aprovada sem achados HIGH ou CRITICAL após correções.
- Canário v7: fluxo estrutural aprovado, mas o Motor retornou HTTP 403 a partir da AWS; não houve promoção.
- Diagnóstico: a mesma credencial e o mesmo contrato retornaram HTTP 200 fora da Lambda. Foram adicionados `Accept: application/json` e identificação HTTP explícita, sem expor a chave.
- Canário v8: HTTP 200, sem `FunctionError`; `source=motor`, 167 caracteres, uma pergunta; dois caminhos com duas mensagens e uma URL cada.
- Produção v35: smoke HTTP executado sem `FunctionError`; a resposta 403 observada foi o comportamento esperado da rota de verificação sem token.
- Observação móvel final: 11 invocações e 0 erros na métrica AWS Lambda dos últimos 10 minutos.
- Fila Zernio após a publicação: 0 visíveis, 0 em processamento e 0 atrasadas.
- Logs pós-publicação: nenhum erro, timeout ou `motor_error` no filtro observado.

## Leitura comportamental do fluxo

- Fluência: a pessoa pode responder como fala, sem depender de botão.
- Carga cognitiva: a entrega continua curta e previsível em duas mensagens.
- Reciprocidade: o conteúdo gratuito é entregue antes da Biblioteca.
- Autonomia: dúvida, negação e ambiguidade não são convertidas em aceite.
- Persuasão ética: sem urgência falsa, escassez inventada, garantia de resultado ou repetição comercial automática.
- Continuidade: após a entrega, o sistema se comporta como assistente de adaptação dentro do Direct.

Esta leitura avalia o desenho e o comportamento observável do sistema. Não é diagnóstico psicológico das pessoas e não comprova aumento de conversão.

## Limite da prova

Nenhuma mensagem sintética foi enviada a um seguidor real. O Motor foi exercitado no canário isolado com o mesmo pacote e configuração da produção; a eficácia comercial depende das próximas conversas reais.
