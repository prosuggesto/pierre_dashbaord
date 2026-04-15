
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { type, userId, jobId } = req.query;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgqndkfkuitafuzawuxl.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncW5ka2ZrdWl0YWZ1emF3dXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzQ4OTIsImV4cCI6MjA2MzUxMDg5Mn0.Yixc4Pw9w3NDtxx5WTuU1YAtbN5gh60a6WQzGKKOFjY';

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Accept': 'application/json'
  };

  try {
    let url = '';
    
    if (type === 'reservations_pierre') {
      url = `${SUPABASE_URL}/rest/v1/reservation?select=*&order=date_heure_menage.desc`;
    } 
    else if (type === 'reservations_menage' && userId) {
      url = `${SUPABASE_URL}/rest/v1/jobs?id_cleaner=eq.${userId}&select=*,reservation(*)`;
    }
    else if (type === 'job_details' && jobId) {
      url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&select=*,reservation(*)`;
    }
    else if (type === 'prorata' && req.query.year) {
      url = `${SUPABASE_URL}/rest/v1/prorata_charges?annee=eq.${req.query.year}&select=*`;
    }
    else if (type === 'all_reservations') {
       url = `${SUPABASE_URL}/rest/v1/reservation?select=*`;
    }
    else {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }

    const response = await fetch(url, { headers });
    const data = await response.json();
    
    // For job_details, return single object
    if (type === 'job_details') {
      return res.status(200).json(data[0] || null);
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
