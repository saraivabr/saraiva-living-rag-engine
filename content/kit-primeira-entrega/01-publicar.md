# Publicar

Colocar o site num endereço real.

> **Leia `02-passar-o-acesso.md` antes de comprar domínio.** Em cujo nome o domínio é registrado é uma decisão irreversível na prática, e ela se toma agora, não depois.

## Antes de publicar: os cinco bloqueios

Não publique nada com um destes em aberto. Todos são erros que o cliente vê.

**1. Os campos `[PREENCHER]`**
O prompt gera 10 campos marcados. Busque por `PREENCHER` no site inteiro. Se sobrar um, ele vai estar no ar, visível.

**2. Os placeholders de rastreamento**
O prompt manda preparar o site para Google Analytics 4, Tag Manager, Search Console e Business Profile — **com placeholders no lugar dos IDs**. Eles não funcionam sozinhos. Ou você cria as contas e coloca os IDs reais, ou você tira os trechos. Placeholder no ar não mede nada e pode quebrar página.

**3. Conteúdo inventado**
O prompt proíbe inventar depoimento, nota, número de clientes e certificação. Confira mesmo assim. Se sobrou um depoimento fictício e o cliente publica, o problema é dele e a culpa é sua.

**4. Os links e botões**
Abra o site no celular. Clique em cada botão de WhatsApp, cada telefone, cada link do menu, e envie o formulário uma vez. O prompt manda testar; ninguém testa.

**5. Política de privacidade**
Se o site tem formulário, ele coleta dado pessoal. A página de política de privacidade precisa existir e ser verdadeira sobre o que você faz com o dado.

## Publicar no ChatGPT Sites

Se o seu destino é o A (ver `00-onde-voce-esta.md`).

Segundo a documentação oficial:

1. Abra **Sites** no app do ChatGPT, ou vá direto em `chatgpt.com/sites`.
2. Quando estiver pronto: *"choose who can visit it and share the resulting link"* — você escolhe quem pode visitar e compartilha o link.
3. O endereço padrão fica no formato `nome-do-site.openai.chatgpt.site`.

**Níveis de acesso disponíveis:** o site pode ficar restrito ao dono e admins do workspace, ou aberto para qualquer pessoa na internet.

**Para tirar do ar sem apagar:** *"open its sharing settings and restrict access to yourself or selected people"* — abra as configurações de compartilhamento e restrinja o acesso. O site continua existindo e editável.

**Para editar depois:** volte em Sites e reabra o projeto.

> ⚠️ **Limites de uso:** a documentação diz que existem limites por plano durante o beta, e que o próprio ChatGPT avisa quando você se aproxima de um. Ela **não publica os números**. Descubra o seu limite antes de vender o quinto site, não depois.

> ⚠️ **Disponibilidade:** *"Availability can depend on your plan, region, and workspace settings."* Sites pode não estar disponível para o seu plano ou país. Confirme que funciona na sua conta antes de prometer prazo a um cliente.

## Endereço próprio: o domínio

`nome-do-site.openai.chatgpt.site` funciona, mas não é um endereço que um negócio local coloca em cartão, fachada ou Google. Para isso é preciso domínio próprio.

### O que a documentação garante

> *"Where custom domains are available, you can connect an apex domain or subdomain that you already own. Sites doesn't register domains for you, so you must be able to change the domain's DNS records."*

Três coisas nessa frase:

1. **"Where available"** — pode não estar liberado para você. Verifique antes de vender.
2. **"that you already own"** — o domínio precisa ser comprado à parte. O Sites não vende domínio.
3. **"you must be able to change the DNS records"** — quem controla o DNS precisa ser você ou o cliente. Se um terceiro (a sobrinha que fez o site antigo, uma agência anterior) controla, resolva isso antes.

### Como conectar

1. Registre o domínio (abaixo).
2. Nas configurações do site, adicione o domínio.
3. *"Copy the DNS records and values Sites provides, then add them through your domain provider."* — copie os registros DNS que o Sites mostra e cadastre-os no painel de quem registrou o domínio.
4. Espere a propagação e confirme o status na tela do Sites.

### Onde registrar e quanto custa

**Registro.br** — o registrador oficial dos domínios `.br`.

- **`.com.br`: R$ 40 por ano.** Mesmo valor no registro e na renovação.
- Há desconto para quem paga vários anos de uma vez.
- Privacidade de WHOIS inclusa para pessoa física — seu nome e telefone não ficam públicos.

Esse é o custo real. Não existe versão gratuita de domínio próprio. Se você vai cobrar do cliente, esse valor entra na conta — veja `04-cobrar.md`.

> **Decisão crítica:** o domínio vai ser registrado no CPF/CNPJ de quem? Não responda agora. Leia `02-passar-o-acesso.md`. A resposta errada aqui é o erro mais caro de reverter deste Kit inteiro.

## Publicar um projeto de código

Se o seu destino é o B — você tem arquivos e um `package.json`.

O site não está hospedado em lugar nenhum. Ele roda só na sua máquina até você subir em algum serviço.

O caminho: escolher um serviço de hospedagem, conectar o repositório, publicar, e apontar o domínio para lá. Os nomes mais comuns para projeto Next.js são **Vercel**, **Netlify** e **Cloudflare Pages**.

> ⚠️ **Não vou te dar o preço deles aqui.** Planos gratuitos de hospedagem mudam de regra com frequência, e um número desatualizado neste arquivo viraria uma promessa quebrada na frente do seu cliente. Abra a página de preços do serviço escolhido **no dia** em que for fechar o trabalho, e confirme: o que o plano gratuito cobre, o que acontece se o site passar do limite de acessos, e se domínio próprio está incluso.

A vantagem do destino B: você tem o código. Ele é entregável, copiável e transferível — o que resolve por completo o problema do próximo capítulo.

## Checklist final

- [ ] Nenhum `[PREENCHER]` sobrando
- [ ] IDs de rastreamento reais, ou trechos removidos
- [ ] Nenhum depoimento ou número inventado
- [ ] Testado no celular: botões, WhatsApp, telefone, formulário
- [ ] Política de privacidade existe e é verdadeira
- [ ] Domínio registrado **no nome certo** (capítulo 2)
- [ ] Site acessível pelo endereço final
