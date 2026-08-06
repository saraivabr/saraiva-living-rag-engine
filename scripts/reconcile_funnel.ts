export interface ReconciliationReport {
  generatedAt: string;
  totalChecked: number;
  dynamoDbOnlyCount: number;
  d1OnlyCount: number;
  stripeMismatchCount: number;
  unclaimedPurchasesCount: number;
  discrepancies: Array<{
    correlationId: string;
    issue: string;
    detail: string;
  }>;
}

export async function runFunnelReconciliation(params: {
  stripeSecretKey: string;
}): Promise<ReconciliationReport> {
  const nowIso = new Date().toISOString();
  const report: ReconciliationReport = {
    generatedAt: nowIso,
    totalChecked: 0,
    dynamoDbOnlyCount: 0,
    d1OnlyCount: 0,
    stripeMismatchCount: 0,
    unclaimedPurchasesCount: 0,
    discrepancies: [],
  };

  try {
    const StripeModule = await import('stripe').catch(() => null);
    if (!StripeModule) {
      report.discrepancies.push({
        correlationId: 'SYSTEM',
        issue: 'stripe_sdk_not_loaded',
        detail: 'Módulo Stripe não carregado no contexto do script',
      });
      return report;
    }

    const Stripe = StripeModule.default || StripeModule.Stripe;
    const stripe = new Stripe(params.stripeSecretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
    });

    report.totalChecked = sessions.data.length;

    for (const session of sessions.data) {
      const correlationId = session.metadata?.saraiva_correlation_id;
      const claimToken = session.metadata?.saraiva_claim_token;

      if (!correlationId) continue;

      if (session.payment_status === 'paid' && !session.client_reference_id && claimToken) {
        report.unclaimedPurchasesCount++;
        report.discrepancies.push({
          correlationId,
          issue: 'unclaimed_anonymous_purchase',
          detail: `Stripe Session ${session.id} paga mas pendente de login Google`,
        });
      }
    }
  } catch (error: any) {
    report.discrepancies.push({
      correlationId: 'GLOBAL',
      issue: 'reconciliation_error',
      detail: error?.message || 'Falha ao rodar reconciliação',
    });
  }

  return report;
}
