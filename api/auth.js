
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, code } = req.body;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgqndkfkuitafuzawuxl.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncW5ka2ZrdWl0YWZ1emF3dXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzQ4OTIsImV4cCI6MjA2MzUxMDg5Mn0.Yixc4Pw9w3NDtxx5WTuU1YAtbN5gh60a6WQzGKKOFjY';

  try {
    if (action === 'login') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/users?code=eq.${code}&select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      return res.status(200).json(data[0] || null);
    } 

    if (action === 'register') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ code, statut: 'menage' })
      });
      const data = await response.json();
      const newUser = data[0] || data;

      // Rattrapage: créer les jobs pour toutes les réservations futures
      if (newUser && newUser.id) {
        const resResp = await fetch(`${SUPABASE_URL}/rest/v1/reservation?date_heure_menage=gt.${new Date().toISOString()}&select=id`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const futureRes = await resResp.json();
        
        if (futureRes && futureRes.length) {
          const names = ['j-2', 'j-1', 'h-5', 'h-1'];
          const jobs = [];
          futureRes.forEach(() => {
            names.forEach(n => {
              jobs.push({ id_cleaner: newUser.id, job_name: n, statut_job: 'en_attente', quantite_job_active: 0 });
            });
          });
          await fetch(`${SUPABASE_URL}/rest/v1/jobs`, { 
            method: 'POST', 
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }, 
            body: JSON.stringify(jobs) 
          });
        }
      }
      return res.status(200).json(newUser);
    }

    if (action === 'update_notif') {
      const { userId, status } = req.body;
      const response = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notif_active: status })
      });
      return res.status(200).json({ success: true });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
