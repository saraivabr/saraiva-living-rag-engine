import {
  safeFallback,
  type SalesReplyInput,
  type SalesReplyValidationIssue,
} from './salesResponderShared.js';
import {
  generateMotorSalesReply,
  type MotorSalesResponderOptions,
} from './motorSalesResponder.js';

export type ConversationalSalesSource = 'motor' | 'fallback';

export interface ConversationalSalesReplyResult {
  reply: string;
  source: ConversationalSalesSource;
  fallbackReason?: string;
  validationIssue?: SalesReplyValidationIssue;
}

export type ConversationalSalesGenerator = (
  input: SalesReplyInput,
  options?: ConversationalSalesResponderOptions,
) => Promise<ConversationalSalesReplyResult>;

export interface ConversationalSalesResponderOptions {
  enabled?: boolean;
  temperature?: number;
  maxChars?: number;
  motor?: MotorSalesResponderOptions;
  generateMotor?: typeof generateMotorSalesReply;
}

/**
 * Motor e o unico provedor conversacional. Qualquer falha, saida insegura ou
 * indisponibilidade cai no texto deterministico que o chamador ja trouxe.
 */
export async function generateConversationalSalesReply(
  input: SalesReplyInput,
  options: ConversationalSalesResponderOptions = {},
): Promise<ConversationalSalesReplyResult> {
  try {
    const motor = await (options.generateMotor || generateMotorSalesReply)(input, {
      enabled: options.enabled ?? true,
      temperature: options.temperature,
      maxChars: options.maxChars,
      ...options.motor,
    });
    if (motor.source === 'motor') return motor;
    return {
      reply: safeFallback(motor.reply),
      source: 'fallback',
      fallbackReason: motor.fallbackReason,
      ...(motor.validationIssue ? { validationIssue: motor.validationIssue } : {}),
    };
  } catch (error) {
    console.warn('Adapter Motor falhou antes de responder; seguindo contingencia', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return {
      reply: safeFallback(input.fallbackReply),
      source: 'fallback',
      fallbackReason: 'motor_error',
    };
  }
}
