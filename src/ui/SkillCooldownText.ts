/** Compact Portuguese cooldown text shared by the lobby, HUD, and accessible labels. */
export function formatSkillCooldown(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (safeSeconds >= 60) {
    const wholeSeconds = Math.ceil(safeSeconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = wholeSeconds % 60;
    return remainder === 0
      ? `${minutes} min`
      : `${minutes} min ${String(remainder).padStart(2, '0')} s`;
  }
  return `${safeSeconds.toFixed(1)}s`;
}
