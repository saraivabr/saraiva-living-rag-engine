import { PROSPECTING_FLOW_MEDIA_ID } from '../campaignTrigger.js';

export interface InstagramAutomationCommandV1 {
  version: '1';
  commandId: string;
  correlationId: string;
  campaignId: 'sexyflow-saraiva-v1';
  action: 'start_from_comment' | 'advance_from_interaction';
  source: 'instagram.comment.received' | 'instagram.quick_reply.received' | 'instagram.postback.received';
  person: { instagramScopedId?: string; username?: string };
  comment?: { id: string; mediaId: string; text: string };
  interaction?: { id: string; payload: string; text?: string };
  occurredAt: string;
}

export interface InstagramAutomationOutcomeV1 {
  version: '1';
  commandId: string;
  correlationId: string;
  campaignId: 'sexyflow-saraiva-v1';
  action: string;
  metaMessageId?: string;
  stage:
    | 'awaiting_request'
    | 'awaiting_intent'
    | 'awaiting_name'
    | 'awaiting_path'
    | 'awaiting_goal'
    | 'awaiting_ready_goal'
    | 'awaiting_business'
    | 'awaiting_build_level'
    | 'awaiting_build_goal'
    | 'enriching_profile'
    | 'generating_audio'
    | 'offering_example'
    | 'example_opened'
    | 'offering_community'
    | 'completed'
    | 'technical_paused';
  status: 'completed' | 'ignored' | 'retrying' | 'technical_paused';
  safeError?: string;
  reasonCode: string;
  metrics: Record<string, number>;
  occurredAt: string;
}

export function parseInstagramAutomationCommand(raw: string): InstagramAutomationCommandV1 {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error('instagram_automation_command_invalid');
  const value = parsed as Partial<InstagramAutomationCommandV1>;
  if (
    value.version !== '1'
    || value.campaignId !== 'sexyflow-saraiva-v1'
    || !isNonEmptyString(value.commandId)
    || !value.commandId.startsWith('instagram-automation:')
    || !isNonEmptyString(value.correlationId)
    || !isNonEmptyString(value.occurredAt)
    || !Number.isFinite(Date.parse(value.occurredAt))
    || !isRecord(value.person)
  ) {
    throw new Error('instagram_automation_command_invalid');
  }
  if (value.action === 'start_from_comment') {
    if (
      value.source !== 'instagram.comment.received'
      || !isRecord(value.comment)
      || !isNonEmptyString(value.comment.id)
      || value.comment.mediaId !== PROSPECTING_FLOW_MEDIA_ID
      || !isNonEmptyString(value.comment.text)
      || !/\bSARAIVA\b/i.test(value.comment.text)
    ) {
      throw new Error('instagram_automation_campaign_mismatch');
    }
  } else if (value.action === 'advance_from_interaction') {
    if (
      !['instagram.quick_reply.received', 'instagram.postback.received'].includes(value.source || '')
      || !isNonEmptyString(value.person.instagramScopedId)
      || !isRecord(value.interaction)
      || !isNonEmptyString(value.interaction.id)
      || !isNonEmptyString(value.interaction.payload)
      || !value.interaction.payload.startsWith('FLOW:SARAIVA:')
    ) {
      throw new Error('instagram_automation_interaction_invalid');
    }
  } else {
    throw new Error('instagram_automation_action_invalid');
  }
  return value as InstagramAutomationCommandV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
