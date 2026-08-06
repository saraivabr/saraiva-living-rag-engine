# Assistente conversacional no Instagram — Reel de sites

## Resultado

- Publicado em produção na Lambda `respondedor-instagram-saraiva-os`, versão 34, em 2026-08-04 19:38 UTC.
- Rollback preservado: versão 33.
- Canário isolado aprovado: `respondedor-instagram-saraiva-os-copy-canary`, versão 6.
- Canário e produção usam o mesmo `CodeSha256`: `8VkHhjCgkpmhE5bbZvLi0E+Wi6Nxjqts1y+CWaGI/wc=`.

## Comportamento publicado

1. A primeira DM pergunta de forma natural se o prompt será usado na própria empresa ou em sites para clientes.
2. Texto livre virou o caminho principal. Frases como `Isso é para minha empresa`, `É para um cliente` e `Trabalho com sites para clientes` são compreendidas sem clique.
3. Botões `MINHA EMPRESA` e `VENDER SITES` continuam como apoio.
4. Negação, indecisão ou duas intenções na mesma frase não entregam um caminho por suposição; o assistente esclarece e preserva o estado.
5. O follow gate continua obrigatório e status desconhecido não é interpretado como `not_following`.
6. Depois do follow confirmado, a entrega continua exatamente em duas mensagens: prompt em texto e um card com o único link da Biblioteca.
7. Após a entrega, perguntas práticas recebem ajuda contextual para adaptar o prompt. O sistema não repete automaticamente o prompt, o link, o preço ou a oferta.
8. Se a pessoa perguntar onde está o conteúdo, o assistente aponta para as mensagens anteriores sem gerar uma segunda URL.

## Leitura comportamental do fluxo

- Fluência cognitiva: melhorou. A pessoa pode responder como fala normalmente, sem precisar interpretar o significado dos botões.
- Sensção de assistência: melhorou. Dúvidas interrompem o roteiro sem destruir a sessão, e o assistente retoma a pergunta necessária.
- Autonomia: preservada. Negação, dúvida e ambiguidade nunca são convertidas silenciosamente em aceite.
- Reciprocidade: preservada. O prompt continua antes da Biblioteca.
- Carga após a entrega: reduzida. A pessoa recebe duas mensagens e a conversa posterior é curta, com no máximo uma pergunta útil por turno.
- Persuasão ética: preservada. Oferta precoce, repetição comercial, `Gerador de Prompts`, URL inventada, preço inventado e CTA fora de hora são bloqueados por código.

Esta leitura avalia o desenho e o comportamento observável do sistema; não é diagnóstico psicológico das pessoas e não comprova aumento de conversão.

## Validação

- Suíte completa: 199 testes aprovados, 0 falhas.
- Typecheck: aprovado.
- Build: aprovado.
- Revisão TypeScript independente: aprovada sem achados CRITICAL ou HIGH.
- Casos adicionais validados: negação direta e indireta, incerteza, dupla intenção, resposta longa, oferta comercial precoce/repetida e perguntas técnicas contendo `quanto`, `valor`, `plano` e `checkout`.
- Runtime do modelo: Bedrock produziu resposta contextual em uma execução; timeout e saída insegura também foram exercitados e caíram no fallback conversacional seguro.
- Canário v6: HTTP 200, sem `FunctionError`, dois caminhos, duas mensagens por caminho, `text -> link_card` e uma URL por jornada.
- Produção v34: invocação HTTP 200, sem `FunctionError`.
- Fila Zernio: 0 visíveis, 0 em processamento e 0 atrasadas.
- Logs pós-publicação: nenhum evento correspondente a erro, falha ou timeout no filtro observado.

## Limite da prova

Nenhuma mensagem sintética foi enviada a um seguidor real nesta rodada. A prova cobre código, modelo, canário, Lambda publicada, fila e logs; a eficácia comercial deve ser medida nas próximas conversas reais.
