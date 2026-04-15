/* ==========================================================
   JOB VALIDATION — GESTION MENAGE
   ========================================================== */

// 1. SERVICES
async function api(path, options = {}) {
  const resp = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || data.error || 'API Error');
  return data;
}

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

  if (!jobId) {
    showError("ID de mission manquant.");
    $('#validateBtn').disabled = true;
    return;
  }

  // Optionally fetch job details if needed for status check
  try {
    const data = await api(`/api/data?type=job_details&jobId=${jobId}`);
    if (data) {
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
    const current = await api(`/api/data?type=job_details&jobId=${jobId}`);
    const nextQty = (current.quantite_job_active || 0) + 1;

    // 2. Perform Update via secure API
    await api('/api/validate', {
      method: 'POST',
      body: { jobId, nextQty }
    });

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
