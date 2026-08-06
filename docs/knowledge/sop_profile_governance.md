# Documento de Direção 3: Manual de Governança & Otimização da Grade do Instagram

> **"Seu perfil no Instagram é sua landing page de alta conversão. Manter mídias sem engajamento polui a percepção de autoridade e prejudica a entrega do algoritmo."**

---

## 🧹 1. Política de Limpeza Semanal de Mídias (SOP de Faxina)

Toda segunda-feira, a saúde das postagens recentes deve ser auditada para manter apenas o conteúdo de alto desempenho:

| Critério de Auditoria | Período de Avaliação | Ação Obrigatória |
| :--- | :---: | :--- |
| **Postagens de Feed com 0 Comentários e < 5 Curtidas** | 7 dias após a publicação | **Excluir via Meta API ou Manualmente** (Limpeza de Feed). |
| **Reels com < 300 Visualizações e 0 Gatilhos** | 14 dias após a publicação | **Arquivar/Remover** para não diluir o alcance da conta. |
| **Reels Práticos de IA (> 100 comentários)** | Permanente | **Manter e atualizar automação atrelada**. |

---

## 📌 2. Regra de Ouro dos Pins de Destaque (Grade do Perfil)

A grade do perfil (`@saraiva.ai`) deve sempre manter **exatamente 3 Pins fixados no topo**:

```
[ PIN 1: Reel Sites ChatGPT ]     [ PIN 2: Reel Prospecção ]     [ PIN 3: Reel Voz/Ligações IA ]
(1.7k comentários / 37k views)    (129 comentários / 3.4k views) (1.8k comentários / 7.4k views)
```

---

## ⚙️ 3. Regras de Ativação do Respondedor por Mídia

1. **Reels Autorizados:** Apenas mídias cadastradas explicitamente em `campaignTrigger.ts` com a palavra-chave de campanha ativada acionam o respondedor de Direct.
2. **Postagens de Feed Gerais:** Ficam isentas de disparos automáticos de botão para evitar consumo desnecessário de cotas de API.
