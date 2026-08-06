# Plano de Arquitetura: Segundo Cérebro de Validação Contínua & Memória Ativa de IA

> **"Um Segundo Cérebro para automação não é apenas um histórico de dados: é um motor ativo que registra cada interação, calcula métricas diárias, valida ou descarta hipóteses de conversão e evolui os prompts e áudios de forma autônoma."**

---

## 🎯 Visão Geral & Objetivo

Criar o **Saraiva AI Second Brain (Segundo Cérebro de Validação Contínua)** integrado à infraestrutura existente do Instagram/Zernio na AWS Lambda e DynamoDB.

O sistema atuará como uma **memória viva e contínua** que:
1. **Registra cada experimento/hipótese:** Armazena variações de copies no Direct, novos scripts de áudio, botões de CTA e abordagens conversacionais.
2. **Coleta métricas ativas por lead:** Grava retenção no Direct, cliques no card do WhatsApp, tempo até a resposta e abandonos.
3. **Mapeia aprendizados diariamente:** Consolida padrões vencedores vs. falhos e atualiza as memórias e regras do sistema ativamente.
4. **Exporta o Relatório Diário de Hipóteses:** Relatório diário autônomo enviado via webhook/notificação para acompanhamento de crescimento.

---

## 📐 Arquitetura do Segundo Cérebro (Second Brain Framework)

```mermaid
flowchart TD
    subgraph Entrada de Dados (Direct & Reels)
        A["Interações dos Leads (Direct / Comentários)"] --> B["SQS Queue & Lambda Consumer"]
    end

    subgraph Segundo Cérebro (Memória & Aprendizado)
        B --> C["Hypothesis & Experiment Tracker (Mapeador de Hipóteses)"]
        C --> D["DynamoDB State Store (Tabela de Aprendizados e Memória Ativa)"]
        D --> E["Insights Engine (Calculadora de Taxa de Sucesso & Retenção)"]
    end

    subgraph Saída & Otimização Autônoma
        E --> F["Refinador Dinâmico de Copy / Áudio (Bedrock & ElevenLabs)"]
        E --> G["Relatório Diário de Aprendizado & Hipóteses Validadas"]
    end
```

---

## 📋 Componentes a Criar e Modificar

### 1. `src/secondBrain/secondBrainStore.ts` `[NEW]`
- Gerenciador de armazenamento no DynamoDB para:
  - **`pk: saraiva-os#experiments`**: Registro das hipóteses testadas (ex: *"Private reply curta com provocação de dor vs. oferta direta"*).
  - **`pk: saraiva-os#daily-insights`**: Métricas diárias consolidadas de conversão no WhatsApp.
  - **`pk: saraiva-os#knowledge-base`**: Conhecimentos validados acumulados (regras de copy que funcionaram com >80% de precisão).

### 2. `src/secondBrain/hypothesisEngine.ts` `[NEW]`
- Motor de formulação e validação de hipóteses:
  - Permite definir hipóteses de teste A/B para abordagens no Direct e Scripts de Áudio.
  - Mede automaticamente o CTR (Click-Through-Rate) do botão do WhatsApp para validar se a hipótese foi **APROVADA** ou **REJEITADA**.

### 3. `src/secondBrain/insightsReporter.ts` `[NEW]`
- Gerador de relatórios e diário de bordo do Segundo Cérebro:
  - Função invocável via Lambda que compila as estatísticas do dia, exibe quais cópias estão vencendo e gera um resumo executivo para você.

### 4. `src/instagram/automationFlow.ts` `[MODIFY]`
- Integrar a gravação de métricas do Segundo Cérebro em cada transição de etapa do lead (`flow_started`, `request_confirmed`, `community_cta_sent`, `whatsapp_opened`).

---

## 🧪 Estrutura de Dados do Segundo Cérebro

```typescript
export interface SecondBrainHypothesis {
  id: string; // Ex: 'HYP-2026-07-DIRECT-AUDIO-V3'
  title: string; // 'Dissecação Neural no Áudio Saraiva aumenta clique no WhatsApp'
  description: string;
  variableTested: 'private_reply' | 'audio_script' | 'cta_button';
  variantA: string;
  variantB?: string;
  metrics: {
    exposures: number;
    clicks: number;
    conversionRate: number;
  };
  status: 'TESTING' | 'VALIDATED' | 'REJECTED';
  startedAt: string;
  concludedAt?: string;
}
```

---

## 🛠️ Plano de Implementação em 4 Passos

1. **Passo 1 (Criar o Motor do Segundo Cérebro):** Criar `secondBrainStore.ts` e `hypothesisEngine.ts` para persistir experimentos e aprendizados no DynamoDB.
2. **Passo 2 (Conectar ao Fluxo Real):** Instrumentar `automationFlow.ts` para registrar eventos de exposição e conversão em tempo real.
3. **Passo 3 (Adicionar comando de exportação de aprendizados):** Adicionar a action `exportSecondBrainReport` no handler da Lambda.
4. **Passo 4 (Testes & Deploy):** Escrever testes unitários em `tests/secondBrain.test.ts`, compilar o pacote `lambda.zip` e publicar na AWS.

---

## ⚡ Plano de Verificação

### Testes Automatizados:
- Executar `npx tsx --test tests/secondBrain.test.ts` para garantir que o registro de hipóteses, cálculo de CTR e atualização de status funcionam perfeitamente sem falhas.

### Verificação em Produção:
- Invocar a Lambda com `{"action": "exportSecondBrainReport"}` e validar a geração do relatório em formato markdown com as métricas diárias acumuladas.
