import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWooviRecords, maskEmail, maskString } from '../scripts/auditWooviLegacyPayments.js';

describe('Auditoria de Registros Legados do Woovi (Fixtures)', () => {
  it('mascara emails e identificadores com segurança', () => {
    assert.equal(maskEmail('usuario@gmail.com'), 'us***@gmail.com');
    assert.equal(maskEmail('ab@dominio.com'), '***@dominio.com');
    assert.equal(maskString('123456789'), '12***89');
    assert.equal(maskString('12'), '***');
    assert.equal(maskEmail(undefined), '[AUSENTE]');
  });

  it('agrega corretamente registros legados válidos e duplicados', () => {
    const mockRecords = [
      {
        correlationId: 'corr-001',
        transactionId: 'tx-100',
        senderId: 'user-001',
        customerEmail: 'cliente1@gmail.com',
        value: 1990,
        paidAt: '2026-07-01T10:00:00Z',
        deliveredAt: '2026-07-01T10:01:00Z',
      },
      {
        correlationId: 'corr-002',
        transactionId: 'tx-101',
        senderId: 'user-002',
        customerEmail: 'cliente2@gmail.com',
        value: 1990,
        paidAt: '2026-07-15T10:00:00Z',
        deliveredAt: '2026-07-15T10:01:00Z',
      },
      {
        correlationId: 'corr-002', // duplicado
        transactionId: 'tx-101', // duplicado
        senderId: 'user-002',
        customerEmail: 'cliente2@gmail.com',
        value: 1990,
        paidAt: '2026-07-15T10:05:00Z',
      },
      {
        correlationId: 'corr-003',
        value: 4990, // outro valor
      },
    ];

    const result = aggregateWooviRecords(mockRecords);

    assert.equal(result.total, 4);
    assert.equal(result.withPaidAt, 3);
    assert.equal(result.withDeliveredAt, 2);
    assert.equal(result.withTransactionId, 3);
    assert.equal(result.duplicateTransactionIds, 1);
    assert.equal(result.duplicateCorrelationIds, 1);
    assert.equal(result.withValue1990, 3);
    assert.equal(result.withOtherValues, 1);
    assert.equal(result.valuesBreakdown[1990], 3);
    assert.equal(result.valuesBreakdown[4990], 1);
    assert.equal(result.earliestPurchaseDate, '2026-07-01T10:00:00Z');
    assert.equal(result.latestPurchaseDate, '2026-07-15T10:05:00Z');
    assert.equal(result.insufficientIdentity, 0);
  });
});
