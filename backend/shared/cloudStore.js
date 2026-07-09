const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

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

export async function loadState(key, fallback) {
  if (!enabled()) return structuredClone(fallback);
  try {
    const url = `${SUPABASE_URL}/rest/v1/${tableFor(key)}?id=eq.state&select=value`;
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    if (rows[0]?.value !== undefined) return structuredClone(rows[0].value);
    return loadLegacyState(key, fallback);
  } catch (error) {
    console.warn(`Supabase isolated table load fallback for ${key}: ${error.message}`);
    return loadLegacyState(key, fallback);
  }
}

export async function saveState(key, value) {
  if (!enabled()) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${tableFor(key)}?on_conflict=id`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: "state", value, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    console.warn(`Supabase isolated table save failed for ${key}: ${error.message}`);
    await saveLegacyState(key, value);
  }
}

async function loadLegacyState(key, fallback) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/simot_state?key=eq.${encodeURIComponent(key)}&select=value`;
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return structuredClone(rows[0]?.value ?? fallback);
  } catch (error) {
    console.warn(`Supabase legacy load fallback for ${key}: ${error.message}`);
    return structuredClone(fallback);
  }
}

async function saveLegacyState(key, value) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/simot_state?on_conflict=key`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    console.warn(`Supabase legacy save failed for ${key}: ${error.message}`);
  }
}
