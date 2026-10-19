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

/** True if `candidate` has a higher major version than `current`, e.g. "3.0" > "2.9". */
export function isNewerMajor(candidate: string, current: string): boolean {
  const a = parseInt(candidate.split('.')[0], 10) || 0;
  const b = parseInt(current.split('.')[0], 10) || 0;
  return a > b;
}
