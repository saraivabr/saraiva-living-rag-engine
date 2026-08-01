import { DynamoDBClient, QueryCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';

export interface AuditAggregateResult {
  total: number;
  withPaidAt: number;
  withDeliveredAt: number;
  withTransactionId: number;
  withCustomerEmail: number;
  withSenderId: number;
  withCorrelationId: number;
  withValue1990: number;
  withOtherValues: number;
  duplicateTransactionIds: number;
  duplicateCorrelationIds: number;
  insufficientIdentity: number;
  earliestPurchaseDate: string | null;
  latestPurchaseDate: string | null;
  valuesBreakdown: Record<number, number>;
}

export function maskString(input?: string): string {
  if (!input) return '[AUSENTE]';
  const trimmed = input.trim();
  if (trimmed.length <= 4) return '***';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

export function maskEmail(email?: string): string {
  if (!email) return '[AUSENTE]';
  const parts = email.split('@');
  if (parts.length !== 2) return maskString(email);
  const [user, domain] = parts;
  const maskedUser = user.length <= 2 ? '***' : `${user.slice(0, 2)}***`;
  return `${maskedUser}@${domain}`;
}

export function aggregateWooviRecords(rawItems: Array<Record<string, unknown>>): AuditAggregateResult {
  const result: AuditAggregateResult = {
    total: 0,
    withPaidAt: 0,
    withDeliveredAt: 0,
    withTransactionId: 0,
    withCustomerEmail: 0,
    withSenderId: 0,
    withCorrelationId: 0,
    withValue1990: 0,
    withOtherValues: 0,
    duplicateTransactionIds: 0,
    duplicateCorrelationIds: 0,
    insufficientIdentity: 0,
    earliestPurchaseDate: null,
    latestPurchaseDate: null,
    valuesBreakdown: {},
  };

  const transactionIds = new Set<string>();
  const correlationIds = new Set<string>();
  const seenTx = new Set<string>();
  const seenCorr = new Set<string>();

  for (const record of rawItems) {
    result.total++;

    const paidAt = typeof record.paidAt === 'string' ? record.paidAt : null;
    const deliveredAt = typeof record.deliveredAt === 'string' ? record.deliveredAt : null;
    const transactionId = typeof record.transactionId === 'string' ? record.transactionId : null;
    const customerEmail = typeof record.customerEmail === 'string' ? record.customerEmail : null;
    const senderId = typeof record.senderId === 'string' ? record.senderId : null;
    const correlationId = typeof record.correlationId === 'string' ? record.correlationId : null;
    const value = typeof record.value === 'number' ? record.value : null;

    if (paidAt) {
      result.withPaidAt++;
      if (!result.earliestPurchaseDate || paidAt < result.earliestPurchaseDate) {
        result.earliestPurchaseDate = paidAt;
      }
      if (!result.latestPurchaseDate || paidAt > result.latestPurchaseDate) {
        result.latestPurchaseDate = paidAt;
      }
    }
    if (deliveredAt) result.withDeliveredAt++;

    if (transactionId) {
      result.withTransactionId++;
      if (seenTx.has(transactionId)) {
        result.duplicateTransactionIds++;
      } else {
        seenTx.add(transactionId);
      }
    }

    if (correlationId) {
      result.withCorrelationId++;
      if (seenCorr.has(correlationId)) {
        result.duplicateCorrelationIds++;
      } else {
        seenCorr.add(correlationId);
      }
    }

    if (customerEmail) result.withCustomerEmail++;
    if (senderId) result.withSenderId++;

    if (!senderId && !customerEmail && !correlationId) {
      result.insufficientIdentity++;
    }

    if (value !== null) {
      result.valuesBreakdown[value] = (result.valuesBreakdown[value] || 0) + 1;
      if (value === 1990) {
        result.withValue1990++;
      } else {
        result.withOtherValues++;
      }
    }
  }

  return result;
}

export async function runQueryAudit(): Promise<AuditAggregateResult> {
  const tableName = process.env.DYNAMODB_TABLE || 'respondedor-instagram-state';
  const storeAccount = process.env.STORE_ACCOUNT_NAME || 'saraiva-os';
  const pk = `${storeAccount}#website-guide-payments`;

  const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const rawItems: Array<Record<string, unknown>> = [];

  let exclusiveStartKey: Record<string, AttributeValue> | undefined;

  do {
    const command: QueryCommand = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: pk },
      },
      ExclusiveStartKey: exclusiveStartKey,
    });

    const response = await client.send(command);
    for (const item of response.Items || []) {
      const raw = item.data?.S;
      if (raw) {
        try {
          rawItems.push(JSON.parse(raw));
        } catch {}
      }
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return aggregateWooviRecords(rawItems);
}
