const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SAVE_ATTEMPTS = Math.max(1, Number(process.env.SUPABASE_SAVE_ATTEMPTS || 3));
const REQUEST_TIMEOUT_MS = Math.max(1500, Number(process.env.SUPABASE_TIMEOUT_MS || 6500));
const writeQueues = new Map();

function enabled() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function headers() {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json"
  };
}

function tableFor(key) {
  return `simot_${String(key).replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readRecord(url) {
  const response = await fetchWithTimeout(url, { headers: headers() });
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return rows[0] || null;
}

export async function loadState(key, fallback) {
  if (!enabled()) return structuredClone(fallback);
  const isolatedUrl = `${SUPABASE_URL}/rest/v1/${tableFor(key)}?id=eq.state&select=value,updated_at`;
  const legacyUrl = `${SUPABASE_URL}/rest/v1/simot_state?key=eq.${encodeURIComponent(key)}&select=value,updated_at`;
  const [isolated, legacy] = await Promise.allSettled([readRecord(isolatedUrl), readRecord(legacyUrl)]);
  const candidates = [isolated, legacy]
    .filter((result) => result.status === "fulfilled" && result.value?.value !== undefined)
    .map((result) => result.value)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  if (candidates.length) return structuredClone(candidates[0].value);
  const errors = [isolated, legacy]
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message)
    .filter(Boolean)
    .join(" | ");
  if (errors) console.warn(`Supabase load fallback for ${key}: ${errors}`);
  return structuredClone(fallback);
}

export function saveState(key, value) {
  if (!enabled()) return Promise.resolve({ persisted: false, reason: "cloud-disabled" });
  const snapshot = structuredClone(value);
  const previous = writeQueues.get(key) || Promise.resolve();
  const task = previous
    .catch(() => null)
    .then(() => persistSnapshot(key, snapshot));
  writeQueues.set(key, task);
  const cleanup = () => {
    if (writeQueues.get(key) === task) writeQueues.delete(key);
  };
  task.then(cleanup, cleanup);
  return task;
}

async function persistSnapshot(key, value) {
  const updatedAt = new Date().toISOString();
  let isolatedError;
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
    try {
      await saveIsolatedState(key, value, updatedAt);
      return { persisted: true, store: tableFor(key), updatedAt };
    } catch (error) {
      isolatedError = error;
      if (attempt < SAVE_ATTEMPTS) await wait(200 * attempt);
    }
  }

  try {
    await saveLegacyState(key, value, updatedAt);
    console.warn(`Supabase isolated save failed for ${key}; legacy backup updated: ${isolatedError?.message}`);
    return { persisted: true, store: "simot_state", updatedAt, degraded: true };
  } catch (legacyError) {
    const message = `No se pudo persistir ${key}: ${isolatedError?.message} | ${legacyError.message}`;
    console.error(message);
    throw new Error(message);
  }
}

async function saveIsolatedState(key, value, updatedAt) {
  const url = `${SUPABASE_URL}/rest/v1/${tableFor(key)}?on_conflict=id`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "state", value, updated_at: updatedAt })
  });
  if (!response.ok) throw new Error(await response.text());
}

async function saveLegacyState(key, value, updatedAt) {
  const url = `${SUPABASE_URL}/rest/v1/simot_state?on_conflict=key`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, value, updated_at: updatedAt })
  });
  if (!response.ok) throw new Error(await response.text());
}
