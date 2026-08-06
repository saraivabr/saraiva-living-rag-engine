import {
  generateBedrockSalesReply,
  type BedrockSalesReplyInput,
  type BedrockSalesResponderOptions,
  type SalesReplyValidationIssue,
} from './bedrockSalesResponder.js';
import {
  generateMotorSalesReply,
  type MotorSalesResponderOptions,
} from './motorSalesResponder.js';

export type ConversationalSalesSource = 'motor' | 'bedrock' | 'fallback';

export interface ConversationalSalesReplyResult {
  reply: string;
  source: ConversationalSalesSource;
  fallbackReason?: string;
  validationIssue?: SalesReplyValidationIssue;
}

export type ConversationalSalesGenerator = (
  input: BedrockSalesReplyInput,
  options?: ConversationalSalesResponderOptions,
) => Promise<ConversationalSalesReplyResult>;

export interface ConversationalSalesResponderOptions {
  provider?: 'motor' | 'bedrock';
  enabled?: boolean;
  temperature?: number;
  maxChars?: number;
  motor?: MotorSalesResponderOptions;
  bedrock?: BedrockSalesResponderOptions;
  generateMotor?: typeof generateMotorSalesReply;
  generateBedrock?: typeof generateBedrockSalesReply;
}

export async function generateConversationalSalesReply(
  input: BedrockSalesReplyInput,
  options: ConversationalSalesResponderOptions = {},
): Promise<ConversationalSalesReplyResult> {
  const provider = options.provider || providerFromEnvironment();
  const sharedOptions = {
    enabled: options.enabled ?? true,
    temperature: options.temperature,
    maxChars: options.maxChars,
  };

  if (provider === 'motor') {
    try {
      const motor = await (options.generateMotor || generateMotorSalesReply)(input, {
        ...sharedOptions,
        ...options.motor,
      });
      if (motor.source === 'motor') return motor;
    } catch (error) {
      console.warn('Adapter Motor falhou antes de responder; seguindo contingencia', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  return (options.generateBedrock || generateBedrockSalesReply)(input, {
    ...sharedOptions,
    ...options.bedrock,
  });
}

function providerFromEnvironment(): 'motor' | 'bedrock' {
  return process.env.INSTAGRAM_CONVERSATIONAL_PROVIDER?.trim().toLowerCase() === 'motor'
    ? 'motor'
    : 'bedrock';
}
