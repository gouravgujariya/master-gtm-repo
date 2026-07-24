// Vercel serverless function — read-only Supabase access, password-gated.
// Env vars (set in Vercel, never in the browser): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_PASSWORD
export default async function handler(req, res) {
  const key = req.headers["x-dashboard-key"] || "";
  if (!process.env.DASHBOARD_PASSWORD || key !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !skey) return res.status(500).json({ error: "Supabase not configured on the server" });

  const H = { apikey: skey, Authorization: `Bearer ${skey}` };
  const q = async (path) => (await fetch(`${url}/rest/v1/${path}`, { headers: H })).json();
  const type = req.query.type;
  const client = encodeURIComponent(req.query.client || "");

  try {
    if (type === "clients") {
      const [c, k] = await Promise.all([q("contacts?select=client"), q("companies?select=client")]);
      const set = new Set([...(Array.isArray(c) ? c : []).map((r) => r.client), ...(Array.isArray(k) ? k : []).map((r) => r.client)].filter(Boolean));
      return res.json([...set].sort());
    }
    if (type === "contacts")
      return res.json(await q(`contacts?select=email,first_name,last_name,company_name,title,email_status,sendable,find_source,list_source&client=eq.${client}&order=created_at.desc&limit=500`));
    if (type === "companies")
      return res.json(await q(`companies?select=company_name,domain,industry,company_size,location,list_source&client=eq.${client}&order=created_at.desc&limit=500`));
    return res.status(400).json({ error: "bad type" });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
