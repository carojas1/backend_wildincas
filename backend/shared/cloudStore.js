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

export async function loadState(key, fallback) {
  if (!enabled()) return structuredClone(fallback);
  try {
    const url = `${SUPABASE_URL}/rest/v1/simot_state?key=eq.${encodeURIComponent(key)}&select=value`;
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return structuredClone(rows[0]?.value ?? fallback);
  } catch (error) {
    console.warn(`Supabase load fallback for ${key}: ${error.message}`);
    return structuredClone(fallback);
  }
}

export async function saveState(key, value) {
  if (!enabled()) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/simot_state?on_conflict=key`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    console.warn(`Supabase save failed for ${key}: ${error.message}`);
  }
}
