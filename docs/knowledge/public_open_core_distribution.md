# 🌐 Saraiva AI Living RAG Engine: Agora Aberto & Universal!

> **"Transformamos a arquitetura do seu projeto em um modelo Open-Core Público no GitHub, permitindo que qualquer empresa, aluno ou desenvolvedor instale e crie seu próprio Segundo Cérebro de IA em 5 minutos."**

---

## 🔗 Link Público do Repositório (Livre Acesso)

- **URL no GitHub:** [https://github.com/saraivabr/saraiva-living-rag-engine](https://github.com/saraivabr/saraiva-living-rag-engine)
- **Status de Visibilidade:** 🟢 **PUBLIC** (Aberto a todos sem restrição).
- **Licença:** MIT (Permite uso comercial, cópia, venda e modificação livre).

---

## 🛠️ Como Qualquer Negócio Pode Usar (Passo a Passo)

### 1. Clonar o Repositório
```bash
git clone https://github.com/saraivabr/saraiva-living-rag-engine.git
cd saraiva-living-rag-engine
npm install
```

### 2. Cadastrar os Dados do Próprio Negócio (Exemplo no `README.md`)
Qualquer usuário pode adicionar seus produtos, PDFs, ofertas e regras de negócios utilizando o motor vetorial:

```typescript
import { defaultKnowledgeStore } from './src/ai/semanticVectorStore.js';

await defaultKnowledgeStore.addChunk(
  'PROD-001',
  'meu-servico',
  'Descrição do serviço da minha empresa com preços e prazos.',
  { whatsapp: '5511999999999' }
);
```

### 3. Rodar a Inteligência de Atendimento com RAG Vivo
O sistema automaticamente lê os dados semânticos do negócio e personaliza as respostas da IA com 100% de precisão!
