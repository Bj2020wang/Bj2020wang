/** 与云函数 newworld 中 dbAuthUidFromEmail 算法一致（SHA-256 十六进制前 32 位） */
export async function dbAuthUidFromEmail(email: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const buf = new TextEncoder().encode(norm);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
