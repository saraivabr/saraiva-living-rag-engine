# Lacunas — o que precisa ser verificado antes de distribuir

Arquivo interno. Não faz parte do Kit.

Nada neste Kit foi inventado para preencher buraco. Onde faltou verificação, o texto declara a incerteza ou manda o leitor conferir no dia. Este arquivo lista o que ficou em aberto, para ser testado na tela antes da distribuição.

## Bloqueadores — testar antes de publicar o Kit

**1. O passo a passo real de publicação no ChatGPT Sites**
A documentação oficial não descreve os cliques. Ela diz apenas: *"Open Sites in the ChatGPT desktop app"*, *"go directly to chatgpt.com/sites"* e *"When it's ready, choose who can visit it and share the resulting link"*.
→ **Ação:** publicar um site de teste de ponta a ponta e transcrever a sequência real de telas.
→ Afeta: `01-publicar.md`

**2. Sites está disponível no plano gratuito?**
A doc diz apenas: *"Availability can depend on your plan, region, and workspace settings."* Não encontrei confirmação de qual plano libera o Sites.
→ **Impacto direto:** a Rota 1 (site nasce na conta do cliente) depende disso. Se exigir plano pago, o cliente precisa assinar — e isso muda a proposta e a conta do capítulo 4.
→ **Ação:** verificar numa conta gratuita real.
→ Afeta: `02-passar-o-acesso.md`, `04-cobrar.md`, `materiais/proposta.md`

**3. Domínio próprio está liberado no Brasil?**
A doc condiciona: *"Where custom domains are available"*. Não confirmei disponibilidade na região.
→ **Impacto:** se não estiver disponível, o capítulo 1 inteiro cai para a Rota 3 (sair do Sites), que exige mais habilidade técnica.
→ **Ação:** tentar conectar um `.com.br` real.
→ Afeta: `01-publicar.md`, `02-passar-o-acesso.md`

**4. Os limites de uso do beta**
A doc diz que existem limites por plano e que o ChatGPT avisa ao se aproximar — **mas não publica os números**.
→ **Impacto:** quem vender vários sites pode bater num teto desconhecido no meio de um trabalho pago.
→ **Ação:** descobrir o número, ou orientar o leitor a descobrir antes do segundo cliente.
→ Afeta: `01-publicar.md`

## Confirmado — não precisa reverificar

- **Domínio `.com.br`: R$ 40/ano no Registro.br**, mesmo valor no registro e na renovação, WHOIS privado incluso para pessoa física.
- **URL padrão do Sites:** formato `nome.openai.chatgpt.site`.
- **Transferência de propriedade de site entre contas: não consta** na documentação oficial.
- **Exportar/baixar o código do site: não consta** na documentação oficial.
- **Sites está em beta**, com limites por plano durante o beta.
- **Níveis de compartilhamento:** dono e admins do workspace, ou qualquer pessoa na internet. Dá para restringir sem apagar.
- **O prompt gratuito não ensina a publicar:** 3 menções a "publicar", todas como condição; zero menções a domínio, hospedagem, acesso, dono, cobrar, contrato ou manutenção.

## Sobre a base de evidência

Registrado em `_fonte-citacoes.md`. Resumo:

| Tema | Citações escritas à mão | Pessoas |
|---|---|---|
| Publicar / colocar no ar | 0 | 0 |
| Entregar ao cliente / acesso / dono | 1 | 1 |
| Cobrar / preço / contrato | 4 (nenhuma sobre cobrar do próprio cliente) | 4 |
| Manutenção | 1 | 1 |

As 4 citações de "cobrar" são falsos positivos temáticos — tratam da cobrança do WhatsApp, de ceticismo com o custo do método, e de "pegue meu dinheiro". **Nenhuma pessoa escreveu sobre quanto cobrar de um cliente.** Isso está declarado dentro do próprio `04-cobrar.md`.

**Por que a base é fina:** o funil nunca pergunta o que trava depois da entrega do prompt. A pessoa manda a palavra-chave, aperta um botão, recebe o prompt e leva a oferta. A ausência de dados sobre a etapa 2 é artefato do instrumento, não prova de ausência da dor.

**Sinal quantitativo que existe:** 54 pessoas apertaram `VENDER SITES` contra 17 em `CRIAR MEU SITE`. Intenção de vender para terceiros é 3x maior que a de fazer o próprio site. É clique, não palavra — não autoriza afirmar *o que* trava essas pessoas.

## Recomendação de método

Duas coisas engordariam a base a custo baixo:

1. **Uma pergunta aberta no fluxo**, depois da entrega do prompt: *"e depois que o site fica pronto, o que trava?"* — e ler o que aparece. Hoje o funil não deixa ninguém responder isso.
2. **Capturar o texto dos comentários dos posts.** A tabela guarda apenas `commentId`; o texto escrito à mão existe no Instagram e não está no banco. Há corpus real fora de alcance hoje.

## Privacidade

A pessoa que originou este Kit é um indivíduo privado. O `@` e a conversa integral estão apenas em `_fonte-citacoes.md`, arquivo interno. Nos materiais que circulam, ele aparece sem identificação: *"um seguidor escreveu às 2h47 da manhã"*. Não publicar o `@` em material distribuído.
