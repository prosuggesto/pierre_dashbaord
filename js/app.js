/* ==========================================================
   GESTION MENAGE — PWA APPLICATION
   ========================================================== */

// ==========================================================
// 1. SERVICES
// ==========================================================
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

// ==========================================================
// 2. UTILS
// ==========================================================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'
  });
}

function isUpcoming(d) { return d ? new Date(d) > new Date() : false; }

function showToast(msg, type = 'success') {
  const c = $('#toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 2500);
}

// ==========================================================
// 3. AUTH
// ==========================================================
let currentUser = null;
let isRegisterMode = false;

function setOneSignalUser(id) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(function (OneSignal) {
    if (id) {
      OneSignal.login(id);
    } else {
      OneSignal.logout();
    }
  });
}

function initAuth() {
  const authBtn = $('#authBtn');
  const toggleLink = $('#toggleAuthLink');
  const codeInput = $('#codeInput');

  authBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) { showAuthError('Veuillez entrer un code'); return; }
    authBtn.disabled = true;
    authBtn.textContent = 'Chargement…';
    isRegisterMode ? await register(code) : await login(code);
    authBtn.disabled = false;
    authBtn.textContent = isRegisterMode ? 'Créer mon code' : 'Se connecter';
  });

  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authBtn.click(); });

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    hideAuthMessages();
    if (isRegisterMode) {
      $('#authSubtitle').textContent = 'Créez votre code personnel';
      authBtn.textContent = 'Créer mon code';
      toggleLink.textContent = 'Se connecter';
      $('#authToggle').firstChild.textContent = 'Déjà un code ? ';
    } else {
      $('#authSubtitle').textContent = 'Entrez votre code pour accéder';
      authBtn.textContent = 'Se connecter';
      toggleLink.textContent = 'Créer un code';
      $('#authToggle').firstChild.textContent = 'Première visite ? ';
    }
  });
}

async function login(code) {
  hideAuthMessages();
  try {
    const data = await api('/api/auth', { method: 'POST', body: { action: 'login', code } });
    if (!data) { showAuthError('Code erroné. Vérifiez votre code ou créez-en un nouveau.'); return; }
    currentUser = data;
    localStorage.setItem('gm_user', JSON.stringify(data));
    setOneSignalUser(data.id);
    navigateToView(data.statut);
    setTimeout(checkAndShowNotifPrompt, 1500);
  } catch (err) {
    console.error('Login error:', err);
    showAuthError('Erreur de connexion. Réessayez.');
  }
}

async function register(code) {
  hideAuthMessages();
  try {
    const data = await api('/api/auth', { method: 'POST', body: { action: 'register', code } });
    currentUser = data;
    localStorage.setItem('gm_user', JSON.stringify(data));
    setOneSignalUser(data.id);

    showAuthSuccess('Compte créé !');
    setTimeout(() => {
      navigateToView('menage');
      setTimeout(checkAndShowNotifPrompt, 2000);
    }, 600);
  } catch (err) {
    console.error('Register error:', err);
    showAuthError('Erreur lors de la création. Réessayez.');
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('gm_user');
  setOneSignalUser(null);
  showView('auth');
  $('#codeInput').value = '';
  hideAuthMessages();
}

function checkSession() {
  const saved = localStorage.getItem('gm_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      setOneSignalUser(currentUser.id);
      navigateToView(currentUser.statut);
      setTimeout(checkAndShowNotifPrompt, 2000);
      return true;
    }
    catch { localStorage.removeItem('gm_user'); }
  }
  return false;
}

function showAuthError(m) { $('#authError').textContent = m; $('#authError').style.display = 'block'; $('#authSuccess').style.display = 'none'; }
function showAuthSuccess(m) { $('#authSuccess').textContent = m; $('#authSuccess').style.display = 'block'; $('#authError').style.display = 'none'; }
function hideAuthMessages() { $('#authError').style.display = 'none'; $('#authSuccess').style.display = 'none'; }

// ==========================================================
// 4. ROUTER
// ==========================================================
function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const t = $(`#${name}-view`);
  if (t) t.classList.add('active');
}

function navigateToView(statut) {
  if (statut === 'pierre') { showView('pierre'); loadPierreReservations(); }
  else if (statut === 'menage') { showView('menage'); loadMenageReservations(); }
  else showView('auth');
}

// ==========================================================
// 5. PIERRE — RESERVATIONS
// ==========================================================
async function loadPierreReservations() {
  const c = $('#reservationsList');
  c.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const data = await api('/api/data?type=reservations_pierre');
    renderReservations(data || [], c);
  } catch (err) {
    console.error(err);
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Erreur de chargement</p></div>';
  }
}

function renderReservations(list, container) {
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>Aucune réservation</p></div>';
    return;
  }
  container.innerHTML = list.map((r, i) => {
    const up = isUpcoming(r.date_heure_menage);
    return `
      <div class="reservation-card card-animate" style="animation-delay:${i * .05}s">
        <span class="card-badge ${up ? 'upcoming' : 'past'}">${up ? 'À venir' : 'Passée'}</span>
        <div class="card-title">📅 Réservation #${r.id}</div>
        <div class="card-info">
          <div class="card-info-row"><span class="label">Nombre de jours</span><span class="value">${r.nombre_jours_reserves} jour${r.nombre_jours_reserves > 1 ? 's' : ''}</span></div>
          <div class="card-info-row"><span class="label">Sortie prévue</span><span class="value">${formatDateTime(r.date_heure_menage)}</span></div>
          <div class="card-info-row"><span class="label">Créée le</span><span class="value">${formatDate(r.created_at)}</span></div>
        </div>
      </div>`;
  }).join('');
}

function initReservationModal() {
  const modal = $('#createReservationModal');
  const form = $('#reservationForm');

  $('#sortieAnnee').value = new Date().getFullYear();

  $('#createReservationBtn').addEventListener('click', () => modal.classList.add('active'));
  $('#closeReservationModal').addEventListener('click', () => modal.classList.remove('active'));
  $('#modalBackdrop').addEventListener('click', () => modal.classList.remove('active'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submitReservation');
    btn.disabled = true; btn.textContent = 'Création…';

    const nbJours = parseInt($('#nbJours').value);
    const annee = parseInt($('#sortieAnnee').value);
    const mois = parseInt($('#sortieMois').value);
    const jour = parseInt($('#sortieJour').value);
    const heure = $('#sortieHeure').value;

    if (!nbJours || !annee || !mois || !jour || !heure) {
      showToast('Remplir tous les champs', 'error');
      btn.disabled = false; btn.textContent = 'Créer la réservation';
      return;
    }

    const dateStr = `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}T${heure}:00`;
    const dateHeure = new Date(dateStr);
    if (isNaN(dateHeure.getTime())) {
      showToast('Date invalide', 'error');
      btn.disabled = false; btn.textContent = 'Créer la réservation';
      return;
    }

    try {
      await api('/api/action', {
        method: 'POST',
        body: {
          action: 'create_reservation',
          payload: {
            reservation: {
              nombre_jours_reserves: nbJours,
              date_heure_iso: dateHeure.toISOString()
            }
          }
        }
      });

      showToast('Réservation créée !');
      modal.classList.remove('active');
      form.reset();
      $('#sortieAnnee').value = new Date().getFullYear();
      $('#selectedTimeDisplay').textContent = 'Sélectionner l\'heure';
      $('#selectedTimeDisplay').className = 'placeholder';
      $('#sortieHeure').value = '';
      loadPierreReservations();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la création', 'error');
    }
    btn.disabled = false; btn.textContent = 'Créer la réservation';
  });
}


// ==========================================================
// 6. TIME PICKER (iOS-style)
// ==========================================================
let selectedHour = 10;
let selectedMinute = 0;

function initTimePicker() {
  const overlay = $('#timePicker');
  const hourCol = $('#hourCol');
  const minuteCol = $('#minuteCol');
  const ITEM_H = 40;

  // Build hour items (0-23)
  let hourHTML = '<div class="time-picker-spacer"></div>';
  for (let h = 0; h < 24; h++) {
    hourHTML += `<div class="tp-item" data-val="${h}">${String(h).padStart(2, '0')}</div>`;
  }
  hourHTML += '<div class="time-picker-spacer"></div>';
  hourCol.innerHTML = hourHTML;

  // Build minute items (00, 30)
  let minHTML = '<div class="time-picker-spacer"></div>';
  [0, 30].forEach(m => {
    minHTML += `<div class="tp-item" data-val="${m}">${String(m).padStart(2, '0')}</div>`;
  });
  minHTML += '<div class="time-picker-spacer"></div>';
  minuteCol.innerHTML = minHTML;

  // Scroll handlers
  function updateActiveItems(col) {
    const scrollTop = col.scrollTop;
    const idx = Math.round(scrollTop / ITEM_H);
    const items = col.querySelectorAll('.tp-item');
    items.forEach((item, i) => item.classList.toggle('active', i === idx));
  }

  let hourTimer, minTimer;
  hourCol.addEventListener('scroll', () => {
    clearTimeout(hourTimer);
    hourTimer = setTimeout(() => {
      const idx = Math.round(hourCol.scrollTop / ITEM_H);
      hourCol.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
      selectedHour = idx;
      updateActiveItems(hourCol);
    }, 80);
  });

  minuteCol.addEventListener('scroll', () => {
    clearTimeout(minTimer);
    minTimer = setTimeout(() => {
      const idx = Math.round(minuteCol.scrollTop / ITEM_H);
      minuteCol.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
      selectedMinute = idx === 0 ? 0 : 30;
      updateActiveItems(minuteCol);
    }, 80);
  });

  // Click on items to scroll
  hourCol.addEventListener('click', (e) => {
    const item = e.target.closest('.tp-item');
    if (!item) return;
    const val = parseInt(item.dataset.val);
    hourCol.scrollTo({ top: val * ITEM_H, behavior: 'smooth' });
  });

  minuteCol.addEventListener('click', (e) => {
    const item = e.target.closest('.tp-item');
    if (!item) return;
    const val = parseInt(item.dataset.val);
    const idx = val === 0 ? 0 : 1;
    minuteCol.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  });

  // Open picker
  $('#timePickerTrigger').addEventListener('click', () => {
    overlay.classList.add('active');
    // Scroll to current selection
    setTimeout(() => {
      hourCol.scrollTop = selectedHour * ITEM_H;
      const minIdx = selectedMinute === 30 ? 1 : 0;
      minuteCol.scrollTop = minIdx * ITEM_H;
      updateActiveItems(hourCol);
      updateActiveItems(minuteCol);
    }, 50);
  });

  // Cancel
  $('#tpCancel').addEventListener('click', () => overlay.classList.remove('active'));
  $('#tpBackdrop').addEventListener('click', () => overlay.classList.remove('active'));

  // Confirm
  $('#tpConfirm').addEventListener('click', () => {
    const hStr = String(selectedHour).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    const timeVal = `${hStr}:${mStr}`;

    $('#sortieHeure').value = timeVal;
    const display = $('#selectedTimeDisplay');
    display.textContent = timeVal;
    display.classList.remove('placeholder');

    overlay.classList.remove('active');
  });
}

// ==========================================================
// 7. PIERRE — PRORATA IMPÔTS
// ==========================================================
let prorataYear = new Date().getFullYear();
let prorataCache = {};
let prorataLocalEdits = {};
let allReservationsForProrata = [];

async function loadProrata() {
  prorataCache = {};
  prorataLocalEdits = {};

  try {
    const pData = await api(`/api/data?type=prorata&year=${prorataYear}`);
    (pData || []).forEach(r => { prorataCache[r.mois] = r; });

    const rData = await api('/api/data?type=all_reservations');
    allReservationsForProrata = rData || [];

    renderProrataTable();
  } catch (err) {
    console.error(err);
    showToast('Erreur chargement prorata', 'error');
  }
}

function calcOccupiedDays(month, year) {
  const days = new Set();
  allReservationsForProrata.forEach(r => {
    if (!r.date_heure_menage) return;
    const checkout = new Date(r.date_heure_menage);
    for (let i = 0; i < r.nombre_jours_reserves; i++) {
      const d = new Date(checkout);
      d.setDate(d.getDate() - i);
      if ((d.getMonth() + 1) === month && d.getFullYear() === year) days.add(d.getDate());
    }
  });
  return days.size;
}

function renderProrataTable() {
  const tbody = $('#prorataBody');
  $('#prorataYear').textContent = prorataYear;

  let html = '';
  for (let m = 1; m <= 12; m++) {
    const db = prorataCache[m] || null;
    const le = prorataLocalEdits[m] || {};

    const autoOcc = calcOccupiedDays(m, prorataYear);
    const joursOcc = le.nombre_jours_reserves ?? db?.nombre_jours_reserves ?? autoOcc;
    const joursMois = le.nombre_jours_dans_le_mois ?? db?.nombre_jours_dans_le_mois ?? 0;
    const totElec = le.total_facture_electricite ?? db?.total_facture_electricite ?? 0;
    const totEau = le.total_facture_eau ?? db?.total_facture_eau ?? 0;

    const jmValid = joursMois >= 28 && joursMois <= 31;
    const elValid = parseFloat(totElec) > 0;
    const eaValid = parseFloat(totEau) > 0;
    const allOk = jmValid && elValid && eaValid;

    let proElec = 0, proEau = 0;
    if (allOk) {
      proElec = (parseFloat(totElec) / joursMois) * joursOcc;
      proEau = (parseFloat(totEau) / joursMois) * joursOcc;
    }

    html += `<tr>
      <td class="month-name">${MONTH_NAMES[m - 1]}</td>
      <td><input type="number" class="table-input" data-month="${m}" data-field="nombre_jours_reserves" value="${joursOcc || ''}" min="0" step="1" placeholder="ex: 14" /></td>
      <td><input type="number" class="table-input ${joursMois === 0 ? 'error' : ''}" data-month="${m}" data-field="nombre_jours_dans_le_mois" value="${joursMois || ''}" min="28" max="31" step="1" placeholder="ex: 31" /></td>
      <td><input type="number" class="table-input ${!elValid ? 'error' : ''}" data-month="${m}" data-field="total_facture_electricite" value="${totElec || ''}" min="0" step="0.01" placeholder="ex: 150" /></td>
      <td><input type="number" class="table-input ${!eaValid ? 'error' : ''}" data-month="${m}" data-field="total_facture_eau" value="${totEau || ''}" min="0" step="0.01" placeholder="ex: 80" /></td>
      <td class="prorata-value ${!allOk ? 'error' : ''}">${allOk ? proElec.toFixed(2) + ' €' : 'Renseigner les infos'}</td>
      <td class="prorata-value ${!allOk ? 'error' : ''}">${allOk ? proEau.toFixed(2) + ' €' : 'Renseigner les infos'}</td>
    </tr>`;
  }

  tbody.innerHTML = html;
  tbody.querySelectorAll('.table-input').forEach(inp => {
    inp.addEventListener('change', handleProrataChange);
    inp.addEventListener('blur', handleProrataChange);
    inp.addEventListener('focus', () => inp.select());
  });
}

async function handleProrataChange(e) {
  const input = e.target;
  const month = parseInt(input.dataset.month);
  const field = input.dataset.field;
  let val = parseFloat(input.value);
  if (isNaN(val)) val = 0;

  if (!prorataLocalEdits[month]) prorataLocalEdits[month] = {};
  prorataLocalEdits[month][field] = val;

  const db = prorataCache[month] || {};
  const le = prorataLocalEdits[month] || {};

  const autoOcc = calcOccupiedDays(month, prorataYear);
  const joursOcc = le.nombre_jours_reserves ?? db.nombre_jours_reserves ?? autoOcc;
  const joursMois = le.nombre_jours_dans_le_mois ?? db.nombre_jours_dans_le_mois ?? 0;
  const totElec = le.total_facture_electricite ?? db.total_facture_electricite ?? 0;
  const totEau = le.total_facture_eau ?? db.total_facture_eau ?? 0;

  const jmValid = joursMois >= 28 && joursMois <= 31;
  const allOk = jmValid && parseFloat(totElec) > 0 && parseFloat(totEau) > 0;

  let proElec = 0, proEau = 0;
  if (allOk) {
    proElec = (parseFloat(totElec) / joursMois) * joursOcc;
    proEau = (parseFloat(totEau) / joursMois) * joursOcc;
  }

  if (jmValid) {
    try {
      const upsert = {
        mois: month, annee: prorataYear,
        id: db.id, // Will be used by /api/action for PATCH if exists
        nombre_jours_reserves: joursOcc,
        nombre_jours_dans_le_mois: joursMois,
        total_facture_electricite: parseFloat(totElec) || 0,
        total_facture_eau: parseFloat(totEau) || 0,
        prorata_electricite: parseFloat(proElec.toFixed(2)),
        prorata_eau: parseFloat(proEau.toFixed(2)),
        updated_at: new Date().toISOString()
      };

      const result = await api('/api/action', {
        method: 'POST',
        body: { action: 'upsert_prorata', payload: upsert }
      });

      prorataCache[month] = result;
      showToast('Enregistré');
    } catch (err) {
      console.error(err);
      showToast('Erreur sauvegarde', 'error');
    }
  }

  renderProrataTable();
}

function initProrataNav() {
  $('#prevYear').addEventListener('click', () => { prorataYear--; loadProrata(); });
  $('#nextYear').addEventListener('click', () => { prorataYear++; loadProrata(); });
}

// ==========================================================
// 8. MENAGE
// ==========================================================
async function loadMenageReservations() {
  const c = $('#menageReservationsList');
  c.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const data = await api(`/api/data?type=reservations_menage&userId=${currentUser.id}`);
    renderMenageJobs(data || [], c);
  } catch (err) {
    console.error(err);
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Erreur de chargement</p></div>';
  }
}

function renderMenageJobs(list, container) {
  if (!list.length) {
    container.innerHTML = `
      <div class="menage-empty-state">
        <div class="menage-empty-icon">📅</div>
        <div class="menage-empty-text">Aucune réservation</div>
      </div>`;
    return;
  }
  container.innerHTML = list.map((job, i) => {
    const r = job.reservation;
    const up = isUpcoming(r.date_heure_menage);
    return `
      <div class="reservation-card card-animate" style="animation-delay:${i * .05}s" onclick="location.href='/job?id=${job.id}'">
        <span class="card-badge ${up ? 'upcoming' : 'past'}">${up ? 'À venir' : 'Passée'}</span>
        <div class="card-title">🧹 Mission ${job.job_name}</div>
        <div class="card-info">
          <div class="card-info-row"><span class="label">Date sortie</span><span class="value">${formatDateTime(r.date_heure_menage)}</span></div>
          <div class="card-info-row"><span class="label">Statut</span><span class="value">${job.statut_job}</span></div>
        </div>
      </div>`;
  }).join('');
}

// ==========================================================
// 9. SIDEBAR / NAV
// ==========================================================
function initSidebar() {
  const sidebar = $('#sidebar'), overlay = $('#sidebarOverlay'), burger = $('#burgerBtn');

  const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); burger.classList.remove('open'); };

  burger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    burger.classList.toggle('open');
  });

  $('#closeSidebar').addEventListener('click', close);
  overlay.addEventListener('click', close);

  $$('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(item.dataset.section);
      close();
    });
  });

  $('#pierreLogout').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  $('#menageLogout').addEventListener('click', () => logout());
}

function setOneSignalUser(userId) {
  if (!userId) return;
  console.log('GM [DEBUG]: Linking OneSignal with External ID ->', userId);
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(function (OneSignal) {
    OneSignal.login(userId);
    console.log('GM [DEBUG]: OneSignal login command sent for ID:', userId);
  });
}

function switchSection(name) {
  $$('.nav-item[data-section]').forEach(i => i.classList.toggle('active', i.dataset.section === name));
  $('#reservations-section').style.display = name === 'reservations' ? 'block' : 'none';
  $('#prorata-section').style.display = name === 'prorata' ? 'block' : 'none';
  const titles = { reservations: 'Réservations', prorata: 'Prorata Impôts' };
  $('#pierreTitle').textContent = titles[name] || 'Gestion';
  if (name === 'reservations') loadPierreReservations();
  else if (name === 'prorata') loadProrata();
}

// ==========================================================
// 10. NOTIFICATION PROMPT
// ==========================================================
function initNotifPrompt() {
  const modal = $('#notifModal');
  const btnLater = $('#notifLater');
  const btnSubscribe = $('#notifSubscribe');

  if (!modal) return;

  btnLater.addEventListener('click', () => modal.classList.remove('active'));
  $('#notifBackdrop').addEventListener('click', () => modal.classList.remove('active'));

  btnSubscribe.addEventListener('click', async () => {
    console.log("GM: Notif Subscribe clicked");
    modal.classList.remove('active');

    // Marquer comme activé en base de données pour ce compte
    if (currentUser) {
      try {
        await api('/api/auth', { method: 'POST', body: { action: 'update_notif', userId: currentUser.id, status: true } });
        currentUser.notif_active = true;
        localStorage.setItem('gm_user', JSON.stringify(currentUser));
        console.log("GM: Updated notif_active in Supabase via API");
      } catch (err) {
        console.error("GM: Error updating notif_active:", err);
      }
    }

    if (window.OneSignal && window.OneSignal.Notifications) {
      console.log("GM: Triggering direct requestPermission");
      window.OneSignal.Notifications.requestPermission().then(permission => {
        console.log("GM: Permission result:", permission);
        if (permission === 'granted' && currentUser) {
          console.log("GM: Permission granted! Forcing re-sync for this device.");
          window.OneSignal.login(currentUser.id);
        }
      });
    } else {
      console.log("GM: OneSignal not ready, using Deferred push");
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(function (OneSignal) {
        OneSignal.Notifications.requestPermission();
      });
    }
  });
}

function checkAndShowNotifPrompt() {
  const modal = $('#notifModal');
  if (!modal || !currentUser) return;

  // VERIFICATION NATIVE : Si le navigateur dit déjà OK, on s'arrête là tout de suite
  if (window.Notification && Notification.permission === 'granted') {
    console.log("GM: Browser native permission already granted. Skipping prompt.");
    return;
  }

  console.log("GM: Checking notif status for user", currentUser.id);

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(function (OneSignal) {
    console.log("GM: OneSignal status:", OneSignal.Notifications.permission);

    // Si déjà accordé, on ne montre rien
    if (OneSignal.Notifications.permission === 'granted') {
      console.log("GM: Notifications already granted");
      return;
    }

    // On s'assure que l'ID est bien lié
    OneSignal.login(currentUser.id);

    // Afficher notre modal personnalisé
    modal.classList.add('active');
  });
}

// ==========================================================
// 11. INIT
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initSidebar();
  initReservationModal();
  initTimePicker();
  initProrataNav();
  initNotifPrompt();
  if (!checkSession()) showView('auth');
});

if ('serviceWorker' in navigator) {
  let swRegistration = null;

  async function forceAppUpdate() {
    if (swRegistration) {
      await swRegistration.update();
      if (swRegistration.waiting) {
        swRegistration.waiting.postMessage({ action: 'skipWaiting' });
      }
    }
    setTimeout(() => {
      localStorage.setItem('last_auto_update', Date.now());
      window.location.reload();
    }, 500);
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('OneSignalSDKWorker.js').then(reg => {
      swRegistration = reg;
      if (reg.waiting) {
        const lastUpd = localStorage.getItem('last_auto_update');
        const now = Date.now();
        if (!lastUpd || (now - lastUpd > 30000)) {
          forceAppUpdate();
        }
      } else {
        reg.update();
      }
    }).catch(e => console.log('SW fail:', e));
  });

  function initUpdateButtons() {
    const btn = $('#checkUpdateBtnGlobal');
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        showToast('Mise à jour en cours...');
        forceAppUpdate();
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initUpdateButtons();
  });
}
