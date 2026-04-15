
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobId, nextQty } = req.body;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgqndkfkuitafuzawuxl.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncW5ka2ZrdWl0YWZ1emF3dXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzQ4OTIsImV4cCI6MjA2MzUxMDg5Mn0.Yixc4Pw9w3NDtxx5WTuU1YAtbN5gh60a6WQzGKKOFjY';

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ 
        statut_job: 'notifié', 
        quantite_job_active: nextQty 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Supabase error', details: errorText });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
