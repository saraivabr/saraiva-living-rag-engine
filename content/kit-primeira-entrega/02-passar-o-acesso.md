# Passar o acesso ao cliente

Este capítulo existe por causa de uma pergunta:

> "como eu passo o site para o cliente ter acesso como dono?"

A resposta honesta começa por desmontar a pergunta.

## "Ser dono" não é uma coisa só

Um site tem quatro ativos separados. O cliente pode ser dono de uns e não de outros — e é aí que mora a confusão, e é aí que mora a briga.

| Ativo | O que é | Se ficar com você |
|---|---|---|
| **Domínio** | O endereço. `padariadobairro.com.br` | Você tem o cliente pelo pescoço |
| **Conteúdo** | Textos, fotos, logo, dados do negócio | Já era dele desde sempre |
| **A conta onde o site mora** | ChatGPT, Vercel, seja onde for | Ele depende de você para existir |
| **O controle de edição** | Quem consegue mudar as coisas | Ele depende de você para mudar |

Quando o cliente diz "quero ser dono", quase sempre ele quer dizer **duas coisas**: que o endereço é dele, e que ele não fica na mão de ninguém se um dia vocês se desentenderem.

Não é sobre saber editar. É sobre não ser refém.

## A regra de ouro

**O domínio vai no CPF ou CNPJ do cliente. Sempre. Sem exceção.**

Registre em nome dele, com o e-mail dele, com o login dele. Você pode fazer o cadastro sentado ao lado, mas a titularidade é dele.

Por quê:

- É o único ativo que, se você segurar, transforma a relação em sequestro. Site perdido se refaz. Domínio perdido leva junto o Google, os cartões impressos, a fachada e o WhatsApp que aponta pra lá.
- Custa **R$ 40 por ano** no Registro.br. É barato demais para valer a pena brigar.
- É o que faz você dormir tranquilo. Se ele quiser sair, ele sai. E é exatamente por isso que ele fica.

**O que nunca fazer:** registrar o domínio no seu CPF, cobrar do cliente por ele, e dizer que é dele. Isso é mentira e um dia aparece.

## A restrição que ninguém te contou

Se o seu site está no **ChatGPT Sites**, você precisa saber disto antes de prometer qualquer coisa:

A documentação oficial do ChatGPT Sites **não documenta**:

- ❌ Transferir a propriedade de um site para outra conta
- ❌ Exportar ou baixar o código do site

Não é que seja proibido. É que **não existe procedimento publicado**. Você não pode prometer ao cliente uma coisa que a plataforma não diz que faz.

Isso te deixa com três rotas. Escolha antes de vender, não depois.

---

## Rota 1 — O site nasce na conta do cliente

**A mais limpa. Resolve o problema em vez de administrá-lo.**

Em vez de criar o site na sua conta e tentar passar depois, você cria **já na conta dele**.

Como:

1. Marque uma chamada de vídeo ou vá presencialmente. Uma hora resolve.
2. O cliente cria a conta ChatGPT dele, com o e-mail dele. Ou usa a que já tem.
3. Vocês confirmam que o Sites aparece na conta dele *(a disponibilidade depende de plano e região — confirme na tela antes de seguir)*.
4. Você roda o prompt ali, com ele do lado.
5. O site nasce dono.
6. O domínio é registrado no nome dele, no mesmo encontro.

**O que você vende aqui:** o seu trabalho e o seu conhecimento. Não a hospedagem, não o acesso. Você não segura nada, e não precisa segurar.

**A vantagem que ninguém enxerga de primeira:** a reunião de criação vira parte do serviço. O cliente vê o site nascer. Isso vale mais que o site.

**A desvantagem honesta:** você precisa da presença dele, e possivelmente do plano pago dele. Custa uma reunião a mais.

---

## Rota 2 — Domínio dele, site na sua conta

**Funciona, é honesta — mas só se estiver escrita.**

O site mora na sua conta. O domínio é dele e aponta pra lá.

O cliente é dono do endereço e do conteúdo. Você opera a máquina. É um arranjo legítimo — é o que muita agência faz — **desde que ele saiba**.

O que precisa estar explícito, por escrito, antes de começar:

- O site está hospedado numa conta que é sua.
- Para mudar qualquer coisa, ele fala com você.
- Se a relação acabar, o que acontece: o domínio é dele e vai junto, e você entrega os textos, as imagens e os dados. O site em si pode não ser transferível — **diga isso na largada**.
- A hospedagem depende da sua conta continuar ativa.

Isso está redigido em `materiais/contrato-manutencao.md`.

**Quando esta rota é a certa:** cliente que não quer nem ver a tela, que só quer o site no ar e alguém de confiança tomando conta. Existe muito cliente assim, e ele paga mensalidade com prazer.

**Quando ela é errada:** quando você não conta. Aí não é um arranjo, é uma armadilha.

---

## Rota 3 — Sair do ChatGPT Sites

**A que dá transferência de verdade, e a que dá mais trabalho.**

Se o que você tem é o código (destino B do capítulo 0), o problema não existe: código se entrega.

1. Você entrega os arquivos do projeto.
2. A hospedagem é criada na conta do cliente.
3. O domínio é dele.
4. Ele é dono de tudo, de fato e de direito.

**O custo real:** exige que você saiba mexer com repositório e deploy. É a rota que pede mais habilidade técnica. Se você não domina isso hoje, não venda como se dominasse — as rotas 1 e 2 resolvem o caso do cliente sem essa exigência.

---

## Como escolher

| Sua situação | Rota |
|---|---|
| Cliente disponível para uma reunião de uma hora | **1** |
| Cliente que não quer envolvimento e vai pagar mensalidade | **2** — com contrato |
| Você tem o código e sabe fazer deploy | **3** |
| Cliente desconfiado, ou trabalho grande | **1 ou 3** — propriedade real, sem depender de confiança |

## O aviso do beta

O ChatGPT Sites está em beta. A documentação avisa que os limites de uso mudam por plano durante o beta e que a disponibilidade depende de plano, região e workspace.

Você está colocando o negócio de outra pessoa em cima de um produto em beta.

Isso não quer dizer que não deva. Quer dizer que precisa **falar**. A frase pronta está em `materiais/o-que-falar.md`. Um cliente avisado que aceita o risco é um cliente. Um cliente não avisado que descobre sozinho é um processo.

E é mais um motivo para a regra de ouro: **com o domínio no nome dele, se a plataforma mudar as regras amanhã, o site se refaz em outro lugar e o endereço continua o mesmo.** O cliente não perde nada que não se recupere.

## Resumo em cinco linhas

1. Domínio no nome do cliente, sempre, R$ 40/ano.
2. No ChatGPT Sites, transferir propriedade não é documentado — não prometa.
3. A saída mais limpa é o site nascer na conta dele.
4. Se ficar na sua conta, escreva isso no contrato antes de começar.
5. Diga que é beta.
