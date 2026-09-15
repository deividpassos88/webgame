export function resolveDevAdminAccess(
  value: unknown,
  development = false
): boolean {
  if (value !== undefined) return value === 'true';
  return development;
}
