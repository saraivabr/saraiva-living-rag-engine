export function isTargetWebhookEntry(
  objectType: unknown,
  entryId: unknown,
  targetIds: readonly string[],
): boolean {
  if (objectType !== 'instagram') return false;
  if (typeof entryId !== 'string' || !entryId.trim()) return false;
  const normalizedTargets = new Set(targetIds.map((id) => id.trim()).filter(Boolean));
  return normalizedTargets.has(entryId.trim());
}
