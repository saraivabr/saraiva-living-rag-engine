import type { LeadInteraction } from '../store/leadContextStore.js';

export interface ConversationContextInput {
  accountId: string;
  conversationId: string;
  senderId: string;
  interactions: LeadInteraction[];
  declaredGoal?: string;
  deliveredContent?: string[];
  clickedButtons?: string[];
  currentStage?: string;
}

export interface PrunedConversationContext {
  sanitizedInteractions: Array<{ role: 'user' | 'assistant'; content: string }>;
  declaredGoal?: string;
  deliveredContent?: string[];
  clickedButtons?: string[];
  currentStage?: string;
}

export class ZernioConversationContextProvider {
  /**
   * Fornece apenas o histórico isolado e sanitizado para a IA.
   * Não envia mensagens apagadas e mascara IDs para manter isolamento e privacidade.
   */
  static buildContext(input: ConversationContextInput): PrunedConversationContext {
    // Filtra mensagens excluídas/inválidas e pega somente as últimas 6
    const sanitizedInteractions = (input.interactions || [])
      .filter((item) => item.text && item.text.trim().length > 0)
      .slice(-6)
      .map((item) => ({
        role: (item.direction === 'in' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: this.maskSensitiveData(item.text),
      }));

    return {
      sanitizedInteractions,
      declaredGoal: input.declaredGoal,
      deliveredContent: input.deliveredContent,
      clickedButtons: input.clickedButtons,
      currentStage: input.currentStage,
    };
  }

  private static maskSensitiveData(text: string): string {
    return text
      .replace(/(?:sk_|Bearer\s+)[a-zA-Z0-9._-]+/gi, '[redacted-credential]')
      .replace(/https?:\/\/\S+/gi, '[url]');
  }
}
