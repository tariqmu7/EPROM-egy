// `crypto.randomUUID` only exists in a secure context (https or localhost). The
// app is served over plain HTTP on the company VM's IP, so it is undefined there
// and calling it throws. Fall back to a non-cryptographic id — every caller uses
// these as local record ids, never as secrets.
export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
