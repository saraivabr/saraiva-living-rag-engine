import type { ZernioLifecycleInboundV1 } from '../zernio/webhook.js';

export interface AutomationJournalEntry {
  eventId: string;
  event: ZernioLifecycleInboundV1['event'];
  accountId: string;
  conversationId?: string;
  messageId?: string;
  occurredAt: string;
}

export class ZernioAutomationJournal {
  private static entries: AutomationJournalEntry[] = [];

  static recordEvent(entry: AutomationJournalEntry): void {
    this.entries.push(entry);
  }

  static getEntries(): AutomationJournalEntry[] {
    return [...this.entries];
  }

  static clear(): void {
    this.entries = [];
  }
}
