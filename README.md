# 🧠 Saraiva AI Second Brain Engine & Living RAG

> **Motor Open-Core de Segundo Cérebro de Validação Contínua & RAG Vivo Semântico**  
> Desenvolvido para operações de vendas automatizadas no Instagram, WhatsApp e IA Conversacional.

---

## ⚡ Recursos do Motor (Features)

1. **🧠 Segundo Cérebro de Validação Contínua (`src/secondBrain/`):**
   - Repositório DynamoDB para persistência de hipóteses A/B e conhecimentos validados.
   - Motor de cálculo de CTR de conversão com promoção automática de aprendizados com significância estatística.
   - Gerador de relatórios executivos em Markdown (`exportSecondBrainMarkdownReport`).

2. **🌐 Banco de Dados Semântico & Vector Store (`src/ai/semanticVectorStore.ts`):**
   - Embeddings usando Amazon Titan Text Embeddings (`amazon.titan-embed-text-v1`).
   - Busca por similaridade de cosseno (`cosineSimilarity`) para recuperar chunks de conhecimento mais relevantes.

3. **🧬 RAG Vivo em Tempo Real (`src/ai/livingRagEngine.ts`):**
   - Injeção dinâmica de conhecimentos semânticos + hipóteses ativas no prompt da IA.
   - Integração com Amazon Bedrock (Claude 3.5 Sonnet / Claude 4.6).

---

## 🚀 Como Instalar e Rodar

```bash
# 1. Instalar dependências
npm install

# 2. Executar suíte de testes unitários
npm test

# 3. Compilar projeto TypeScript
npm run build
```

---

## 🔬 Como Usar o Motor em Sua Aplicação

```typescript
import { registerHypothesis, calculateHypothesisCTR } from './src/secondBrain/hypothesisEngine.js';
import { buildLivingRagContext } from './src/ai/livingRagEngine.js';

// 1. Cadastrar uma nova hipótese de copy no Segundo Cérebro
await registerHypothesis(
  'HYP-001',
  'Teste de Provocação no Direct',
  'Testa se tom mais direto aumenta cliques de WhatsApp',
  'private_reply',
  'Copy A (Padrão)',
  'Copy B (Provocativa)'
);

// 2. Consultar o RAG Vivo com base na mensagem do cliente
const ragContext = await buildLivingRagContext('Como funciona o Laboratório de Agentes?');
console.log(ragContext.promptAugmentation);
```

---

## 📜 Licença
Distribuído sob a licença **MIT**. Sinta-se livre para adaptar e utilizar em suas próprias operações de IA.
