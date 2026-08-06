# Autoaprimoramento conversacional do Direct

## Resultado

- Publicado na Lambda `respondedor-instagram-saraiva-os`, versão `36`, em 2026-08-04.
- Rollback imediato preservado: versão `35`.
- Canário isolado aprovado: `respondedor-instagram-saraiva-os-copy-canary`, versão `9`.
- Canário e produção usam o mesmo `CodeSha256`: `zcLAgNgxr58mVeU9DiciuUN69IbbXSCjMb1ubHGbQ1o=`.
- Nenhuma mensagem sintética foi enviada a seguidor real.

## Simulação interna

O fluxo real compilado foi exercitado sem chamar o envio do Zernio. A simulação percorreu entrada, pergunta antes da escolha, follow gate, entrega e oito turnos pós-entrega:

1. adaptação para clínica odontológica;
2. ausência de depoimentos;
3. dúvida sobre preço do serviço;
4. prazo de construção no Lovable;
5. pedido para reenviar prompt e link;
6. objeção de que seria um gerador;
7. tentativa de extração do prompt de sistema;
8. mensagem ambígua.

Na primeira execução, 2 dos 8 turnos úteis caíram em uma resposta genérica por variação estocástica: ausência de depoimentos e prazo. Repetições mostraram que o Motor podia responder bem, mas o resultado não era estável. O problema real era o fallback genérico quando uma saída insegura era descartada.

## Aprendizados incorporados

- Dúvidas práticas continuam conversacionais e usam Motor, com contingência em Bedrock.
- Preço de serviço sem base confiável não é estimado pelo modelo; a resposta pergunta escopo, páginas, integrações e revisões.
- Toda conversa sobre depoimentos, avaliações ou prova social é tratada deterministicamente e orienta apenas evidências reais.
- Prazos numéricos ou expressos por unidade são descartados quando não há base confiável.
- Domínio nu, URL adicional, oferta comercial repetida e quantidade/preço inventados são bloqueados.
- Perguntas sobre a Biblioteca usam fatos canônicos: 24 prompts, R$ 19,90, acesso permanente e nenhuma apresentação como gerador.
- Pedido para localizar o conteúdo aponta para as mensagens anteriores e não cria um segundo link.
- Tentativa de prompt injection permanece em fallback seguro.

## Contrato final observado

- Follow gate preservado e baseado apenas no status confiável recebido do Zernio.
- Entrega em exatamente 2 mensagens: `text -> link_card`.
- Prompt na primeira mensagem: 881 caracteres no caminho simulado.
- Exatamente 1 URL, somente da Biblioteca.
- Respostas pós-entrega com no máximo uma pergunta.
- Nenhuma repetição automática de prompt, link, preço ou oferta.

## Validação

- Suíte completa final: 221 testes aprovados, 0 falhas.
- Testes adversariais dedicados: 51 aprovados, 0 falhas.
- Typecheck: aprovado.
- Build: aprovado.
- Revisão TypeScript independente: nenhum achado HIGH ou CRITICAL restante.
- Simulação final com Motor real: todos os cenários respeitaram limite de pergunta, URL e oferta; preço e prova social usaram fallback seguro.
- Canário v9: HTTP 200, sem `FunctionError`, `source=motor`, 165 caracteres e uma pergunta; os dois caminhos retornaram 2 mensagens e 1 URL.
- Produção v36: smoke HTTP executado sem `FunctionError`; o `403 verification failed` interno é o comportamento esperado da rota desconhecida sem credencial.
- Janela móvel pós-publicação: 10 invocações, 0 erros e 0 eventos no filtro de erro/timeout.
- Fila Zernio: 0 visíveis, 0 em processamento e 0 atrasadas.

## Leitura comportamental

O assistente agora alterna conscientemente entre criatividade e certeza: usa IA para entender contexto e adaptar o projeto, mas retira o modelo de decisões que exigem fatos não disponíveis. Isso reduz fadiga, insistência comercial, contradição e invenção sem transformar o Direct em um menu rígido.

Esta leitura avalia o desenho e o comportamento observável do sistema. Não é diagnóstico psicológico das pessoas e não comprova aumento de conversão; essa parte depende das próximas conversas reais.
