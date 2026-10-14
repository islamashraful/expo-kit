/** True if `candidate` is a higher version than `current`, e.g. "1.10" > "1.9.3". */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((part) => parseInt(part, 10) || 0);
  const b = current.split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
