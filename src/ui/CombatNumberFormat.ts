export function formatHealingAmount(amount: number): string {
  const normalized = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return `+${normalized.toFixed(1).replace('.', ',')} HP`;
}
