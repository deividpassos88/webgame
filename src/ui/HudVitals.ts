export function resourcePercent(current: number, maximum: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (current / maximum) * 100)));
}

export function formatResourcePercent(current: number, maximum: number): string {
  return `${resourcePercent(current, maximum)}%`;
}
