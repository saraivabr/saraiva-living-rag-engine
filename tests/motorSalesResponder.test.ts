import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateMotorSalesReply,
  type MotorFetch,
} from '../src/ai/motorSalesResponder.js';
import { generateConversationalSalesReply } from '../src/ai/conversationalSalesResponder.js';

const input = {
  message: 'Tenho uma clínica e quero adaptar o prompt para captar pacientes.',
  promise: {
    label: 'Assistente de adaptação do prompt',
    trustedContext: 'Ajude a adaptar o prompt ao negócio informado. Não ofereça links ou preços.',
  },
  state: { stage: 'offering_product' },
  summary: 'pessoa: quero adaptar para minha clínica',
  fallbackReply: 'Qual serviço da clínica você quer destacar primeiro?',
};

function motorResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Motor envia contrato OpenAI-compatible sem expor o segredo no payload', async () => {
  let observedUrl = '';
  let observedInit: RequestInit | undefined;
  const fetch: MotorFetch = async (url, init) => {
    observedUrl = String(url);
    observedInit = init;
    return motorResponse('{"reply":"Entendi o contexto da clínica. Qual serviço você quer destacar primeiro?"}');
  };

  const result = await generateMotorSalesReply(input, {
    enabled: true,
    apiKey: 'test-secret-value',
    baseUrl: 'https://motor.example/v1/',
    model: 'cx/gpt-5.6-terra',
    fetch,
  });

  assert.equal(result.source, 'motor');
  assert.equal(observedUrl, 'https://motor.example/v1/chat/completions');
  assert.equal((observedInit?.headers as Record<string, string>).Authorization, 'Bearer test-secret-value');
  assert.equal((observedInit?.headers as Record<string, string>).Accept, 'application/json');
  assert.equal((observedInit?.headers as Record<string, string>)['User-Agent'], 'SaraivaAI-Instagram/1.0');
  const body = JSON.parse(String(observedInit?.body)) as Record<string, unknown>;
  assert.equal(body.model, 'cx/gpt-5.6-terra');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.doesNotMatch(String(observedInit?.body), /test-secret-value/);
});

test('Motor rejeita JSON fora do schema estrito', async () => {
  const result = await generateMotorSalesReply(input, {
    enabled: true,
    apiKey: 'test-key',
    fetch: async () => motorResponse('{"reply":"Tudo certo?","extra":true}'),
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackReason, 'invalid_json');
  assert.equal(result.reply, input.fallbackReply);
});

test('Motor aplica a validação compartilhada e bloqueia oferta inventada', async () => {
  const result = await generateMotorSalesReply(input, {
    enabled: true,
    apiKey: 'test-key',
    fetch: async () => motorResponse('{"reply":"Tenho uma oferta de R$ 97 para você. Quer comprar?"}'),
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackReason, 'unsafe_output');
  assert.equal(result.validationIssue, 'invented_price');
});

test('Motor trata timeout sem vazar credencial', async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const result = await generateMotorSalesReply(input, {
      enabled: true,
      apiKey: 'never-log-this-key',
      timeoutMs: 10,
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    });

    assert.equal(result.source, 'fallback');
    assert.equal(result.fallbackReason, 'timeout');
    assert.doesNotMatch(JSON.stringify(warnings), /never-log-this-key/);
  } finally {
    console.warn = originalWarn;
  }
});

test('Motor aplica o timeout também quando o servidor envia headers e trava o corpo', async () => {
  const startedAt = Date.now();
  const result = await generateMotorSalesReply(input, {
    enabled: true,
    apiKey: 'test-key',
    timeoutMs: 500,
    fetch: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"choices":['));
      },
    }), { status: 200 }),
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackReason, 'timeout');
  assert.ok(Date.now() - startedAt < 1_500);
});

test('responder conversacional usa Motor quando ele responde com segurança', async () => {
  const result = await generateConversationalSalesReply(input, {
    provider: 'motor',
    generateMotor: async () => ({
      reply: 'Entendi a clínica. Qual serviço você quer destacar primeiro?',
      source: 'motor',
    }),
    generateBedrock: async () => {
      throw new Error('Bedrock não deveria ser chamado');
    },
  });

  assert.equal(result.source, 'motor');
});

test('responder conversacional cai do Motor para o Bedrock', async () => {
  const result = await generateConversationalSalesReply(input, {
    provider: 'motor',
    generateMotor: async () => ({
      reply: input.fallbackReply,
      source: 'fallback',
      fallbackReason: 'motor_error',
    }),
    generateBedrock: async () => ({
      reply: 'Vamos adaptar ao seu cenário. Qual é o serviço principal da clínica?',
      source: 'bedrock',
    }),
  });

  assert.equal(result.source, 'bedrock');
});

test('responder conversacional mantém a contingência quando o adapter Motor lança erro inesperado', async () => {
  const result = await generateConversationalSalesReply(input, {
    provider: 'motor',
    generateMotor: async () => {
      throw new Error('unexpected adapter failure');
    },
    generateBedrock: async () => ({
      reply: 'Vamos seguir com segurança. Qual serviço você quer destacar?',
      source: 'bedrock',
    }),
  });

  assert.equal(result.source, 'bedrock');
});

test('responder conversacional preserva fallback determinístico se ambos falharem', async () => {
  const result = await generateConversationalSalesReply(input, {
    provider: 'motor',
    generateMotor: async () => ({
      reply: input.fallbackReply,
      source: 'fallback',
      fallbackReason: 'motor_error',
    }),
    generateBedrock: async () => ({
      reply: input.fallbackReply,
      source: 'fallback',
      fallbackReason: 'bedrock_error',
    }),
  });

  assert.equal(result.source, 'fallback');
  assert.equal(result.reply, input.fallbackReply);
  assert.equal(result.fallbackReason, 'bedrock_error');
});
