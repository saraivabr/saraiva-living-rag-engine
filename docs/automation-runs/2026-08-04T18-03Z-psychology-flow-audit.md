# Auditoria psicológica e operacional — Reel de sites / Biblioteca Secreta

## Escopo e método

- Fluxo observado: comentário `SARAIVA` no Reel `18130447453725127` → primeira DM → escolha de intenção → verificação de follow → prompt gratuito → card da Biblioteca → landing → checkout → acesso protegido.
- Produção verificada em 2026-08-04 entre 17:30 e 18:38 UTC.
- Avaliação baseada em comportamento e arquitetura do fluxo, sem diagnóstico psicológico de pessoas.
- Não houve compra real nem criação de cobrança Pix durante a auditoria.

## Resultado

- Nota de coerência psicológica e comercial: **9,1/10**.
- Continuidade da promessa: **aprovada**. O Reel promete o prompt, a DM entrega o prompt e só depois apresenta a Biblioteca.
- Carga cognitiva: **aprovada com ressalva**. Após o follow são exatamente duas mensagens: um único texto com o prompt e um card com o único link. A escolha de intenção e a verificação de follow adicionam fricção, mas são decisões explícitas do produto.
- Confiança: **aprovada** depois da correção. A landing agora exibe quatro cartões separados — Sites, CRMs, Sistemas e Automações — coerentes com as 24 peças reais do catálogo.
- Persuasão ética: **aprovada**. Não há urgência falsa, escassez inventada, prova social fabricada ou garantia de resultado.
- Autonomia: **aprovada**. A oferta informa preço único de R$ 19,90, ausência de assinatura e responsabilidade de adaptação/revisão.

## Leitura por princípio

| Princípio | Estado | Evidência |
| --- | --- | --- |
| Reciprocidade | parcial | O prompt é entregue antes da oferta, mas somente após a confirmação de follow. |
| Compromisso e consistência | passou | Comentário, escolha de intenção e follow mantêm a pessoa no mesmo objetivo declarado. |
| Autoridade | passou | Oferta específica, 24 prompts, seis por categoria, demonstração e limites explícitos. |
| Prova social | não verificável | Nenhuma prova foi inventada; não há amostra publicada que sustente depoimentos ou números. |
| Escassez | passou | Não há contagem regressiva, “últimas vagas” ou urgência falsa. |
| Unidade | parcial | “Quem acompanha meu trabalho” reforça pertencimento, mas o gate pode soar transacional. |
| Fluência cognitiva | passou | Uma promessa, dois caminhos, duas mensagens finais e um único destino comercial. |
| Integridade ética | passou | Sem garantia de vendas/desempenho; fatos ausentes devem ser validados. |

## Sequência observada

1. Resposta pública: `O prompt completo do vídeo está no seu Direct 👀`.
2. Primeira DM: pergunta onde o prompt será usado, com `MINHA EMPRESA` e `VENDER SITES`.
3. Sem follow confirmado: pedido direto para seguir `@saraiva.ai` e botão `JÁ SEGUI`.
4. Follow confirmado: prompt específico da intenção em uma mensagem.
5. Segunda e última mensagem: card `Biblioteca Secreta — 24 prompts`, com um único botão `VER A BIBLIOTECA`.
6. Landing: R$ 19,90, pagamento único, quatro categorias e ausência de promessas de resultado.

## Correções desta rodada

- A landing prometia quatro categorias, mas agrupava `CRMs & Sistemas` em um único cartão. O catálogo contém quatro categorias reais; a página foi corrigida para quatro cartões independentes.
- Foi adicionado um teste de regressão que exige os quatro títulos separados e rejeita o agrupamento anterior.
- O evento real `library_opened` foi incluído na allowlist tipada da telemetria e ganhou teste específico.
- Um timeout de transporte ocorreu depois que o Zernio já havia aceitado uma private reply. A entrega foi confirmada diretamente no histórico do Zernio, com texto e botões corretos, e reconciliada no DynamoDB para impedir repetição.
- A resposta pública ausente foi enviada uma única vez, observada no Zernio e persistida como efeito concluído.

## Publicação e prova técnica

- Cloudflare Worker anterior/rollback: `091b5aa3-4885-4b03-bbd9-eb947cbaf2c4`.
- Cloudflare Worker em produção: `8b25120d-9abc-46e2-91ae-b334a3f8d943`, 100% do tráfego.
- Canário e produção retornaram HTTP 200.
- Domínio público mostrou quatro cartões separados e nenhuma ocorrência de `CRMs & Sistemas`, `Gerador de Prompts`, urgência falsa ou preço antigo.
- Rotas públicas verificadas: `/quero-o-prompt`, `/prompt-do-video`, `/checkout` e `/biblioteca` sem credencial.
- Biblioteca sem credencial mostrou `LINK NÃO RECONHECIDO` e não expôs o catálogo protegido.
- Testes do storefront: **62/62 aprovados**; build e typecheck aprovados; lint sem erros e com quatro avisos preexistentes fora do escopo.
- Revisão TypeScript independente: sem achados bloqueantes, altos ou médios.
- Lambda Zernio: versão 33 publicada; rollback 32.
- Janela móvel de três horas ao final da observação: 352 invocações, 0 erros Lambda e 0 throttles.
- O warning de timeout foi um sucesso incerto já reconciliado, não uma ausência de DM.
- A repetição concluiu o comando de comentário às 18:14 UTC, sem duplicar a DM nem a resposta pública.
- Fila principal ao final: 0 visíveis, 0 em processamento e 0 atrasadas. A DLQ manteve somente 1 evento antigo, sem relação com esta jornada.
- Zernio confirmou exatamente 1 DM de entrada e exatamente 1 resposta pública para o comentário auditado.
- Nos 30 minutos finais: 0 novos `instagram_automation_command_failed`, 0 `zernio_comment_delivery_failed` e 0 `zernio_flow_message_failed`.

## Limites e próximo aprendizado

- A auditoria comprova coerência, entrega, segurança de estado e saúde técnica; não comprova aumento de conversão.
- O checkout foi renderizado e validado por contrato, mas nenhuma cobrança Pix real foi criada.
- O principal refinamento futuro é reduzir a sensação transacional do gate de follow sem retirar a exigência pedida pelo produto.
- A prioridade operacional seguinte é automatizar a reconciliação de private replies quando o Zernio aceita a mensagem, mas a resposta HTTP chega depois do timeout.
