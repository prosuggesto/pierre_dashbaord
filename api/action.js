
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload } = req.body;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgqndkfkuitafuzawuxl.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncW5ka2ZrdWl0YWZ1emF3dXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzQ4OTIsImV4cCI6MjA2MzUxMDg5Mn0.Yixc4Pw9w3NDtxx5WTuU1YAtbN5gh60a6WQzGKKOFjY';

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    let url = '';
    let method = 'POST';

    if (action === 'create_reservation') {
      url = `${SUPABASE_URL}/rest/v1/reservation`;
      const resResp = await fetch(url, { method, headers, body: JSON.stringify(payload.reservation) });
      const resData = await resResp.json();
      
      // Create jobs for cleaners
      const userResp = await fetch(`${SUPABASE_URL}/rest/v1/users?statut=eq.menage&select=id`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
      const users = await userResp.json();
      
      if (users && users.length) {
        const jobs = [];
        const names = ['j-2', 'j-1', 'h-5', 'h-1'];
        users.forEach(u => {
          names.forEach(n => {
            jobs.push({ id_cleaner: u.id, job_name: n, statut_job: 'en_attente', quantite_job_active: 0 });
          });
        });
        await fetch(`${SUPABASE_URL}/rest/v1/jobs`, { method: 'POST', headers, body: JSON.stringify(jobs) });
      }
      return res.status(200).json(resData[0] || resData);
    }

    if (action === 'upsert_prorata') {
      const { id, ...upsertData } = payload;
      if (id) {
        url = `${SUPABASE_URL}/rest/v1/prorata_charges?id=eq.${id}`;
        method = 'PATCH';
      } else {
        url = `${SUPABASE_URL}/rest/v1/prorata_charges`;
        method = 'POST';
      }
      const resp = await fetch(url, { method, headers, body: JSON.stringify(upsertData) });
      const data = await resp.json();
      return res.status(200).json(data[0] || data);
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
