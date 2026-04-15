/* ==========================================================
   JOB VALIDATION — GESTION MENAGE
   ========================================================== */

// 1. SUPABASE CLIENT
const SUPABASE_URL = 'https://hgqndkfkuitafuzawuxl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhncW5ka2ZrdWl0YWZ1emF3dXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzQ4OTIsImV4cCI6MjA2MzUxMDg5Mn0.Yixc4Pw9w3NDtxx5WTuU1YAtbN5gh60a6WQzGKKOFjY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. UTILS
const $ = (s) => document.querySelector(s);

function showToast(msg, type='success') {
  const c = $('#toastContainer') || document.body;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 2500);
}

// 3. JOB LOGIC
let jobId = null;

async function initJob() {
  // Extract ID from URL (?id=... or path if handled by router)
  const urlParams = new URLSearchParams(window.location.search);
  jobId = urlParams.get('id');

  // fallback: if URL is /123 and vercel.json didn't append it to search, we might need to parse path
  if (!jobId) {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    if (pathParts.length > 0) jobId = pathParts[0];
  }

  if (!jobId || isNaN(parseInt(jobId))) {
    showError("ID de mission invalide ou manquant.");
    $('#validateBtn').disabled = true;
    return;
  }

  $('#dispId').textContent = `#${jobId}`;
  $('#jobDetails').style.display = 'block';

  // Optionally fetch job details to show what we are validating
  try {
    const { data, error } = await sb.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (data) {
      $('#jobTitle').textContent = `Mission : ${data.job_name || 'Ménage'}`;
      $('#dispType').textContent = data.job_name || 'Ménage';
      if (data.statut_job === 'notifié') {
         showSuccessState(); // Already validated
      }
    }
  } catch (err) {
    console.error("Error loading job:", err);
  }
}

async function validateJob() {
  const btn = $('#validateBtn');
  btn.disabled = true;
  btn.textContent = 'Validation en cours…';

  try {
    // 1. Get current data to increment correctly
    const { data: current, error: getErr } = await sb.from('jobs').select('quantite_job_active').eq('id', jobId).single();
    if (getErr) throw getErr;

    const nextQty = (current.quantite_job_active || 0) + 1;

    // 2. Perform Update
    const { error: updErr } = await sb.from('jobs')
      .update({ 
        statut_job: 'notifié',
        quantite_job_active: nextQty
      })
      .eq('id', jobId);

    if (updErr) throw updErr;

    showSuccessState();
  } catch (err) {
    console.error("Validation error:", err);
    showError("Erreur lors de la validation. Veuillez réessayer.");
    btn.disabled = false;
    btn.textContent = 'Valider ma prestation';
  }
}

function showSuccessState() {
  $('#mainView').classList.add('hidden');
  $('#successView').classList.add('active');
}

function showError(msg) {
  const err = $('#errorMessage');
  err.textContent = msg;
  err.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  initJob();
  $('#validateBtn').addEventListener('click', validateJob);
});
