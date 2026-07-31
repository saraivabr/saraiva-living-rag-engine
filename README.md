# 🧠 Saraiva AI Living RAG & Second Brain Engine (Open-Core)

> **Motor universal e autônomo para qualquer negócio construir seu próprio Segundo Cérebro de Validação Contínua & RAG Vivo Semântico no Instagram, WhatsApp e Web.**

---

## 🚀 O que este Motor faz para o seu Negócio?

O **Saraiva AI Living RAG Engine** transforma a atendimento e as vendas de qualquer empresa em um **sistema inteligente que aprende sozinho todos os dias**:

1. **🌐 Banco de Dados Semântico (Vetorização por Embeddings):** Converte seu catálogo de produtos, serviços, FAQs e PDFs em vetores matemáticos para entender a intenção do cliente sem depender de palavras-chave fixas.
2. **🧠 Segundo Cérebro de Validação A/B:** Testa variações de abordagens de vendas no Direct/WhatsApp, calcula o Click-Through-Rate (CTR) real e promove automaticamente a melhor copy para a memória permanente da IA.
3. **🧬 RAG Vivo em Tempo Real:** Conecta a base semântica e os aprendizados validados ao modelo de IA (Amazon Bedrock / OpenAI / Anthropic) para responder clientes com 100% de alinhamento ao seu negócio.

---

## 🛠️ Passo a Passo para Instalar no SEU Negócio (Setup em 5 Minutos)

### 1. Clonar o Repositório e Instalar Dependências
```bash
git clone https://github.com/saraivabr/saraiva-living-rag-engine.git
cd saraiva-living-rag-engine
npm install
```

### 2. Configurar as Variáveis de Ambiente (`.env`)
Crie um arquivo `.env` na raiz do projeto preenchendo suas credenciais da AWS / DynamoDB:

```env
BEDROCK_SALES_REGION=us-east-1
DYNAMODB_TABLE=sua-tabela-state
BEDROCK_SALES_INFERENCE_PROFILE_ID=us.anthropic.claude-sonnet-4-6
```

---

## 💻 Como Alimentar os Dados do SEU Negócio (Exemplo Prático)

```typescript
import { defaultKnowledgeStore } from './src/ai/semanticVectorStore.js';
import { registerHypothesis } from './src/secondBrain/hypothesisEngine.js';
import { buildLivingRagContext } from './src/ai/livingRagEngine.js';

// 1. Cadastrar os Conhecimentos do seu Negócio no Banco Semântico
await defaultKnowledgeStore.addChunk(
  'PROD-001',
  'servicos',
  'Nosso serviço de consultoria B2B entrega um diagnóstico completo de vendas com IA em 7 dias úteis.',
  { preco: 'R$ 2.500', contato: 'WhatsApp' }
);

// 2. Cadastrar um Teste A/B de Copy no Segundo Cérebro
await registerHypothesis(
  'HYP-MEU-NEGOCIO-01',
  'Teste de Abordagem Direta vs Consultiva',
  'Testa se chamar o cliente pelo nome no Direct aumenta agendamentos',
  'private_reply',
  'Olá, vi seu interesse no nosso serviço...',
  'Oi [Nome]! Vi que você quer acelerar suas vendas este mês...'
);

// 3. Consultar o RAG Vivo na hora de responder um cliente
const ragContext = await buildLivingRagContext('Quanto custa a consultoria e quanto tempo demora?');
console.log('Prompt Augmentation gerado para a IA:\n', ragContext.promptAugmentation);
```

---

## 🧪 Executar Testes Unitários

Para garantir que o motor está funcionando perfeitamente no seu ambiente:

```bash
npm test
```

---

## 📜 Licença
Distribuído sob a licença **MIT** — Livre para uso comercial, modificação e implementação em qualquer empresa ou projeto.
