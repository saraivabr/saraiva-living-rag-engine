import { requestZernioApi } from '../zernio/client.js';

export interface ZernioContactData {
  contactId?: string;
  name?: string;
  channel?: string;
  intent?: string;
  goal?: string;
  requestedContent?: string;
  deliveredContent?: string;
  stage?: string;
  followStatus?: string;
  lastInteractionAt?: string;
  ctaSent?: string;
  linkOpened?: string;
  optOut?: boolean;
  tags?: string[];
}

export class ZernioContactService {
  /**
   * Sincroniza informações de contato com o CRM do Zernio sem duplicar registros.
   */
  static async syncContact(
    apiKey: string,
    accountId: string,
    contactData: ZernioContactData,
    fetchImpl?: typeof fetch,
  ): Promise<{ contactId?: string }> {
    if (!apiKey || !accountId) return {};

    const payload = {
      accountId,
      name: contactData.name,
      channel: contactData.channel || 'instagram',
      attributes: {
        intent: contactData.intent,
        goal: contactData.goal,
        requestedContent: contactData.requestedContent,
        deliveredContent: contactData.deliveredContent,
        stage: contactData.stage,
        followStatus: contactData.followStatus,
        lastInteractionAt: contactData.lastInteractionAt,
        ctaSent: contactData.ctaSent,
        linkOpened: contactData.linkOpened,
        optOut: contactData.optOut,
      },
      tags: contactData.tags || [],
    };

    try {
      const endpoint = contactData.contactId
        ? `/contacts/${encodeURIComponent(contactData.contactId)}`
        : '/contacts';

      const response = await requestZernioApi<{ success?: boolean; data?: { id?: string } }>({
        apiKey,
        url: `https://zernio.com/api/v1${endpoint}`,
        method: contactData.contactId ? 'PUT' : 'POST',
        body: payload,
        fetchImpl,
      });

      return { contactId: response.data?.id || contactData.contactId };
    } catch (error) {
      console.warn('Falha na sincronização do CRM Zernio:', error);
      return { contactId: contactData.contactId };
    }
  }
}
