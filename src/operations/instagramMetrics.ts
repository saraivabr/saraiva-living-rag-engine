export type InstagramMetricName =
  | 'content_requested'
  | 'follow_check_following'
  | 'follow_check_not_following'
  | 'follow_check_unknown'
  | 'follow_confirmed'
  | 'content_delivered'
  | 'content_delivery_failed'
  | 'conversation_started'
  | 'message_delivered'
  | 'message_read'
  | 'followup_sent'
  | 'followup_cancelled'
  | 'story_entry'
  | 'ice_breaker_entry'
  | 'community_cta_sent'
  | 'whatsapp_community_opened';

export class InstagramMetricsCollector {
  private static counts: Record<string, number> = {};

  static increment(metric: InstagramMetricName, value = 1): void {
    this.counts[metric] = (this.counts[metric] || 0) + value;
  }

  static getMetrics(): Record<string, number> {
    return { ...this.counts };
  }

  static reset(): void {
    this.counts = {};
  }
}
