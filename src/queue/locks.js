const chains = new Map();

// Serialize deploy work per website in this process.
export async function withSiteLock(siteId, fn) {
  const key = String(siteId);
  const prev = chains.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  chains.set(key, prev.then(() => gate));
  await prev;
  try { return await fn(); }
  finally { release(); }
}
