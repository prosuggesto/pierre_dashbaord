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

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
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

// Global Cache & State
let reservationsCache = null;
let menageReservationsCache = null;
let prorataCacheYear = null;
let allReservationsCache = null;
let selectedProrataMonths = new Set();

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

  // Affichage instantané si en cache (localStorage ou session)
  const cached = reservationsCache || JSON.parse(localStorage.getItem('gm_cache_res_pierre') || 'null');
  if (cached) {
    reservationsCache = cached;
    renderReservations(cached, c);
  } else {
    c.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  }

  try {
    const data = await api('/api/data?type=reservations_pierre');
    // Mise à jour si différent
    if (JSON.stringify(data) !== JSON.stringify(reservationsCache)) {
      reservationsCache = data;
      localStorage.setItem('gm_cache_res_pierre', JSON.stringify(data));
      renderReservations(data || [], c, true);
    }
  } catch (err) {
    console.error(err);
    if (!reservationsCache) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Erreur de chargement</p></div>';
    }
  }
}

function getReservationCardHTML(r, silent = false) {
  const up = isUpcoming(r.date_heure_menage);
  const isOpt = r.is_optimistic;
  return `
    <div class="reservation-card ${r.is_new ? 'card-animate' : (silent ? '' : 'card-animate')} ${isOpt ? 'is-optimistic' : ''}" data-res-id="${r.id}" style="animation-delay:0s">
      <div style="position:absolute; top:14px; right:14px; display:flex; align-items:center; gap:8px;">
        ${!isOpt ? `<button class="btn-icon delete-res-btn" data-id="${r.id}" data-date="${r.date_heure_menage}" title="Supprimer" style="width:28px; height:28px; font-size:0.85rem; background:rgba(255,77,106,.1); color:var(--error); border:1px solid rgba(255,77,106,.3); padding:0; display:flex; align-items:center; justify-content:center; transition:all .2s; border-radius:var(--r-sm);">🗑</button>` : ''}
        <span class="card-badge ${up ? 'upcoming' : 'past'}" style="position:relative; top:auto; right:auto;">${up ? 'À venir' : 'Passée'}</span>
      </div>
      <div class="card-title" style="padding-right:110px;">📅 Réservation #${r.id}${isOpt ? ' (En cours…)' : ''}</div>
      <div class="card-info">
        <div class="card-info-row"><span class="label">Nombre de jours</span><span class="value">${r.nombre_jours_reserves} jour${r.nombre_jours_reserves > 1 ? 's' : ''}</span></div>
        <div class="card-info-row"><span class="label">Sortie prévue</span><span class="value">${formatDateTime(r.date_heure_menage)}</span></div>
        <div class="card-info-row"><span class="label">Créée le</span><span class="value">${formatDate(r.created_at)}</span></div>
      </div>
    </div>`;
}

function renderReservations(list, container, silent = false) {
  if (!list.length) {
    container.classList.add('is-empty');
    container.innerHTML = `
      <div class="app-empty-state">
        <div class="app-empty-icon">📅</div>
        <div class="app-empty-text">Aucune réservation</div>
      </div>`;
    return;
  }
  container.classList.remove('is-empty');
  container.innerHTML = list.map((r, i) => getReservationCardHTML(r, silent)).join('');
  attachDeleteEvents(container);
}

function attachDeleteEvents(container) {
  container.querySelectorAll('.delete-res-btn').forEach(btn => {
    // Supprimer l'ancien listener pour éviter les doublons au rafraîchissement
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = newBtn.dataset.id;
      const dateIso = newBtn.dataset.date;
      initReservationDeleteModal(id, dateIso);
    });
  });
}

function initReservationDeleteModal(id, dateIso) {
  const modal = document.querySelector('#deleteConfirmModal');
  const confirmBtn = document.querySelector('#deleteConfirmBtn');
  const cancelBtn = document.querySelector('#deleteCancel');
  
  const closeModal = () => modal.classList.remove('active');
  cancelBtn.onclick = closeModal;
  document.querySelector('#deleteBackdrop').onclick = closeModal;
  
  confirmBtn.onclick = async () => {
    confirmBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:auto;"></div>';
    confirmBtn.disabled = true;
    
    // --- SUPPRESSION CHIRURGICALE ---
    const card = document.querySelector(`.reservation-card[data-res-id="${id}"]`);
    if (card) card.remove();
    
    const resIdx = (reservationsCache || []).findIndex(r => r.id == id);
    if (resIdx !== -1) reservationsCache.splice(resIdx, 1);
    
    if (reservationsCache && reservationsCache.length === 0) {
      renderReservations([], $('#reservationsList'));
    }

    showToast('Suppression…');
    closeModal();

    try {
      await api('/api/action', {
        method: 'POST',
        body: { action: 'delete_reservation', payload: { id, date_heure_iso: dateIso } }
      });
      showToast('Réservation supprimée');
      allReservationsCache = null; 
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la suppression', 'error');
      loadPierreReservations(); // Rechargement complet en cas d'erreur
    }
  };
  
  confirmBtn.textContent = 'Confirmer';
  confirmBtn.disabled = false;
  modal.classList.add('active');
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

    // --- CRÉATION CHIRURGICALE (0 CLIGNOTEMENT) ---
    const tempId = Date.now();
    const optimisticRes = {
      id: tempId,
      nombre_jours_reserves: nbJours,
      date_heure_menage: dateHeure.toISOString(),
      created_at: new Date().toISOString(),
      is_optimistic: true,
      is_new: true
    };

    if (!reservationsCache) reservationsCache = [];
    reservationsCache.unshift(optimisticRes);
    
    // Insertion sans reset innerHTML
    const listContainer = $('#reservationsList');
    if (listContainer.classList.contains('is-empty')) {
      renderReservations(reservationsCache, listContainer);
    } else {
      listContainer.insertAdjacentHTML('afterbegin', getReservationCardHTML(optimisticRes));
      attachDeleteEvents(listContainer);
    }
    
    modal.classList.remove('active');
    form.reset();
    $('#sortieAnnee').value = new Date().getFullYear();
    $('#selectedTimeDisplay').textContent = 'Sélectionner l\'heure';
    $('#selectedTimeDisplay').className = 'placeholder';
    $('#sortieHeure').value = '';
    btn.disabled = false; btn.textContent = 'Créer la réservation';

    api('/api/action', {
      method: 'POST',
      body: {
        action: 'create_reservation',
        payload: {
          reservation: { nombre_jours_reserves: nbJours, date_heure_iso: dateHeure.toISOString() }
        }
      }
    }).then(realData => {
      const idx = reservationsCache.findIndex(r => r.id === tempId);
      if (idx !== -1) reservationsCache[idx] = realData;
      allReservationsCache = null;

      // Mise à jour chirurgicale de la carte
      const oldCard = document.querySelector(`.reservation-card[data-res-id="${tempId}"]`);
      if (oldCard) {
        realData.is_new = false;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = getReservationCardHTML(realData, true);
        const newCard = tempDiv.firstElementChild;
        oldCard.parentNode.replaceChild(newCard, oldCard);
        attachDeleteEvents(listContainer);
      }
      showToast('Réservation créée !');
    }).catch(err => {
      console.error(err);
      const idx = reservationsCache.findIndex(r => r.id === tempId);
      if (idx !== -1) reservationsCache.splice(idx, 1);
      const card = document.querySelector(`.reservation-card[data-res-id="${tempId}"]`);
      if (card) card.remove();
      showToast('Erreur création', 'error');
    });
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
  // Si déjà chargé pour cette année dans la session, on peut sauter l'API ou le faire en fond
  const tbody = $('#prorataBody');
  if (!tbody.innerHTML) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;"><div class="spinner" style="margin:auto;"></div></td></tr>';
  }

  try {
    // Parallélisation des appels
    const [pData, rData] = await Promise.all([
      api(`/api/data?type=prorata&year=${prorataYear}`),
      allReservationsCache ? Promise.resolve(allReservationsCache) : api('/api/data?type=all_reservations')
    ]);

    prorataCache = {};
    prorataLocalEdits = {};
    (pData || []).forEach(r => { prorataCache[r.mois] = r; });
    
    allReservationsCache = rData || [];
    allReservationsForProrata = allReservationsCache;

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
    const db = prorataCache[m] || {};
    const le = prorataLocalEdits[m] || {};

    const joursOcc = calcOccupiedDays(m, prorataYear);
    const joursMois = getDaysInMonth(m, prorataYear);
    const totElec = le.total_facture_electricite ?? db?.total_facture_electricite ?? 0;
    const totEau = le.total_facture_eau ?? db?.total_facture_eau ?? 0;

    const elValid = parseFloat(totElec) > 0;
    const eaValid = parseFloat(totEau) > 0;
    const allOk = elValid && eaValid;

    let proElec = 0, proEau = 0;
    if (allOk) {
      proElec = (parseFloat(totElec) / joursMois) * joursOcc;
      proEau = (parseFloat(totEau) / joursMois) * joursOcc;
    }

    const isSelected = selectedProrataMonths.has(m);

    html += `<tr class="${isSelected ? 'selected' : ''}" data-month="${m}">
      <td class="checkbox-cell">
        <input type="checkbox" class="custom-checkbox" data-month="${m}" ${isSelected ? 'checked' : ''} />
      </td>
      <td class="month-name">${MONTH_NAMES[m - 1]}</td>
      <td><input type="number" class="table-input" data-month="${m}" data-field="nombre_jours_reserves" value="${joursOcc || ''}" readonly title="Calculé automatiquement depuis vos réservations" /></td>
      <td><input type="number" class="table-input" data-month="${m}" data-field="nombre_jours_dans_le_mois" value="${joursMois}" readonly title="Géré automatiquement" /></td>
      <td><input type="number" class="table-input ${!elValid ? 'error' : ''}" data-month="${m}" data-field="total_facture_electricite" value="${totElec || ''}" min="0" step="0.01" placeholder="ex: 150" /></td>
      <td><input type="number" class="table-input ${!eaValid ? 'error' : ''}" data-month="${m}" data-field="total_facture_eau" value="${totEau || ''}" min="0" step="0.01" placeholder="ex: 80" /></td>
      <td class="prorata-value ${!allOk ? 'error' : ''}">${allOk ? proElec.toFixed(2) + ' €' : 'Renseigner les factures'}</td>
      <td class="prorata-value ${!allOk ? 'error' : ''}">${allOk ? proEau.toFixed(2) + ' €' : 'Renseigner les factures'}</td>
    </tr>`;
  }

  tbody.innerHTML = html;
  tbody.querySelectorAll('.table-input').forEach(inp => {
    inp.addEventListener('change', handleProrataChange);
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('click', (e) => e.stopPropagation()); // Éviter de cocher la ligne
  });

  tbody.querySelectorAll('.custom-checkbox').forEach(chk => {
    chk.addEventListener('change', () => {
      const m = parseInt(chk.dataset.month);
      if (chk.checked) selectedProrataMonths.add(m);
      else selectedProrataMonths.delete(m);
      
      const tr = chk.closest('tr');
      if (tr) tr.classList.toggle('selected', chk.checked);
      updateCleanupBtn();
    });
  });

  // Possibilité de cliquer sur la cellule de la checkbox
  tbody.querySelectorAll('.checkbox-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const chk = cell.querySelector('.custom-checkbox');
      if (chk) {
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event('change'));
      }
    });
  });
}

let prorataSaveTimers = {};
let prorataSaveInProgress = {};

function handleProrataChange(e) {
  const input = e.target;
  const month = parseInt(input.dataset.month);
  const field = input.dataset.field;
  let val = parseFloat(input.value);
  if (isNaN(val)) val = 0;

  if (!prorataLocalEdits[month]) prorataLocalEdits[month] = {};
  prorataLocalEdits[month][field] = val;

  // Capture current focus to restore it after render
  const activeInput = document.activeElement;
  let focusMonth, focusField;
  if (activeInput && activeInput.classList.contains('table-input')) {
    focusMonth = activeInput.dataset.month;
    focusField = activeInput.dataset.field;
  }

  renderProrataTable();

  // Restore focus if needed
  if (focusMonth && focusField) {
    const newInp = document.querySelector(`.table-input[data-month="${focusMonth}"][data-field="${focusField}"]`);
    if (newInp) newInp.focus();
  }

  clearTimeout(prorataSaveTimers[month]);
  prorataSaveTimers[month] = setTimeout(() => {
    executeProrataSave(month);
  }, 800);
}

async function executeProrataSave(month) {
  if (prorataSaveInProgress[month]) {
    clearTimeout(prorataSaveTimers[month]);
    prorataSaveTimers[month] = setTimeout(() => executeProrataSave(month), 500);
    return;
  }
  
  prorataSaveInProgress[month] = true;
  const db = prorataCache[month] || {};
  const le = prorataLocalEdits[month] || {};

  const joursOcc = calcOccupiedDays(month, prorataYear);
  const joursMois = getDaysInMonth(month, prorataYear);
  const totElec = le.total_facture_electricite ?? db.total_facture_electricite ?? 0;
  const totEau = le.total_facture_eau ?? db.total_facture_eau ?? 0;

  const allOk = parseFloat(totElec) > 0 && parseFloat(totEau) > 0;

  let proElec = 0, proEau = 0;
  if (allOk) {
    proElec = (parseFloat(totElec) / joursMois) * joursOcc;
    proEau = (parseFloat(totEau) / joursMois) * joursOcc;
  }
  try {
    const upsert = {
      mois: month, annee: prorataYear,
      id: db.id,
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
  prorataSaveInProgress[month] = false;
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

  const cached = menageReservationsCache || JSON.parse(localStorage.getItem('gm_cache_res_menage') || 'null');
  if (cached) {
    menageReservationsCache = cached;
    renderMenageJobs(cached, c);
  } else {
    c.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  }

  try {
    const data = await api(`/api/data?type=reservations_menage&userId=${currentUser.id}`);
    if (JSON.stringify(data) !== JSON.stringify(menageReservationsCache)) {
      menageReservationsCache = data;
      localStorage.setItem('gm_cache_res_menage', JSON.stringify(data));
      renderMenageJobs(data || [], c, true);
    }
  } catch (err) {
    console.error(err);
    if (!menageReservationsCache) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Erreur de chargement</p></div>';
    }
  }
}

function renderMenageJobs(list, container, silent = false) {
  if (!list.length) {
    container.classList.add('is-empty');
    container.innerHTML = `
      <div class="app-empty-state">
        <div class="app-empty-icon">📅</div>
        <div class="app-empty-text">Aucune réservation</div>
      </div>`;
    return;
  }
  container.classList.remove('is-empty');
  container.innerHTML = list.map((r, i) => {
    const up = isUpcoming(r.date_heure_menage);
    // On simule une "Mission" si ce n'est pas un objet Job complet
    const title = r.job_name ? `Mission ${r.job_name}` : `Mission Réservation #${r.id}`;
    const status = r.statut_job || 'À faire';

    return `
      <div class="reservation-card ${silent ? '' : 'card-animate'}" style="animation-delay:${i * .05}s" onclick="location.href='/job?id=${r.id}'">
        <span class="card-badge ${up ? 'upcoming' : 'past'}">${up ? 'À venir' : 'Passée'}</span>
        <div class="card-title">🧹 ${title}</div>
        <div class="card-info">
          <div class="card-info-row"><span class="label">Date sortie</span><span class="value">${r.date_heure_menage ? formatDateTime(r.date_heure_menage) : 'Non planifiée'}</span></div>
          <div class="card-info-row"><span class="label">Statut</span><span class="value">${status}</span></div>
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
  $('#simulateur-section').style.display = name === 'simulateur' ? 'block' : 'none';
  const titles = { reservations: 'Réservations', prorata: 'Prorata Impôts', simulateur: 'Simulateur Live' };
  $('#pierreTitle').textContent = titles[name] || 'Gestion';

  // Chargement paresseux & Cache
  if (name === 'reservations') {
    // Si déjà là, loadPierreReservations gérera le rafraîchissement silencieux
    loadPierreReservations();
  }
  else if (name === 'prorata') {
    loadProrata();
  }
  
  // Reset sélection si on change d'onglet
  selectedProrataMonths.clear();
  updateCleanupBtn();
}

function updateCleanupBtn() {
  const btn = $('#cleanupBtn');
  if (!btn) return;
  if (selectedProrataMonths.size > 0) {
    btn.style.display = 'block';
    btn.textContent = `🧹 Nettoyer (${selectedProrataMonths.size})`;
  } else {
    btn.style.display = 'none';
  }
}

function initCleanup() {
  const btn = $('#cleanupBtn');
  const modal = $('#cleanupConfirmModal');
  const confirmBtn = $('#cleanupConfirmBtn');
  const cancelBtn = $('#cleanupCancel');
  const backdrop = $('#cleanupBackdrop');

  if (!btn || !modal) return;

  btn.addEventListener('click', () => {
    const count = selectedProrataMonths.size;
    $('#cleanupDesc').textContent = `Voulez-vous vraiment supprimer les données pour les ${count} mois sélectionnés ?`;
    modal.classList.add('active');
  });

  const closeModal = () => modal.classList.remove('active');
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    const idsToDelete = [];
    selectedProrataMonths.forEach(m => {
      const db = prorataCache[m];
      if (db && db.id) idsToDelete.push(db.id);
    });

    if (!idsToDelete.length) {
      showToast('Aucune donnée en base pour ces mois', 'error');
      selectedProrataMonths.clear();
      renderProrataTable();
      updateCleanupBtn();
      closeModal();
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Nettoyage…';

    try {
      // --- SUPPRESSION CHIRURGICALE (PRORATA) ---
      const selectedRows = document.querySelectorAll('.prorata-table tbody tr.selected');
      selectedRows.forEach(row => row.style.display = 'none');
      closeModal();
      showToast('Nettoyage en cours…');

      await api('/api/action', {
        method: 'POST',
        body: { action: 'delete_prorata', payload: { ids: idsToDelete } }
      });
      showToast('Données supprimées');
      selectedProrataMonths.clear();
      loadProrata(); // Rechargement discret du fond
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du nettoyage', 'error');
      loadProrata(); // Re-afficher en cas d'erreur
    }
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Supprimer';
    updateCleanupBtn();
  });
}

function initSimulateur() {
  const updateSim = () => {
    const occ = parseFloat($('#sim_occ').value) || 0;
    const mois = parseFloat($('#sim_mois').value) || 0;
    const elec = parseFloat($('#sim_elec').value) || 0;
    const eau = parseFloat($('#sim_eau').value) || 0;

    let pre = 0, prAu = 0;
    if (mois >= 28 && mois <= 31 && elec > 0 && eau > 0) {
      pre = (elec / mois) * occ;
      prAu = (eau / mois) * occ;
    }
    $('#sim_res_elec').textContent = pre > 0 ? pre.toFixed(2) + ' €' : '0.00 €';
    $('#sim_res_eau').textContent = prAu > 0 ? prAu.toFixed(2) + ' €' : '0.00 €';
  };
  $$('.sim-input').forEach(i => i.addEventListener('input', updateSim));
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

  btnSubscribe.addEventListener('click', () => {
    console.log("GM: Notif Subscribe clicked");
    modal.classList.remove('active');

    // Mémoriser la fonction de rattachement API
    const syncUserToDb = () => {
      // Marquer comme activé en base de données pour ce compte
      if (currentUser) {
        api('/api/auth', { method: 'POST', body: { action: 'update_notif', userId: currentUser.id, status: true } })
        .then(() => {
          currentUser.notif_active = true;
          localStorage.setItem('gm_user', JSON.stringify(currentUser));
          console.log("GM: Updated notif_active in Supabase via API");
        }).catch(err => console.error("GM: Error updating notif_active:", err));
      }
    };

    if (window.OneSignal && window.OneSignal.Notifications) {
      console.log("GM: Triggering direct requestPermission (synchronously !)");
      // LA DEMANDE NATIVE DOIT ÊTRE LA PREMIÈRE CHOSE EFFECTUÉE APRÈS LE CLIC (pas de 'await' avant)
      window.OneSignal.Notifications.requestPermission().then(permission => {
        console.log("GM: Permission result:", permission);
        
        // Parfois sur mobile, la permission est silencieusement bloquée (denied)
        if (Notification && Notification.permission === 'denied') {
           showToast("Notifications bloquées par votre navigateur. Activez-les dans vos paramètres.", "error");
        } 
        else if (permission === true || permission === 'granted' || (Notification && Notification.permission === 'granted')) {
          if (currentUser) {
            console.log("GM: Permission granted! Forcing re-sync for this device.");
            window.OneSignal.login(currentUser.id);
            syncUserToDb();
          }
        }
      });
    } else {
      console.log("GM: OneSignal not ready, using Deferred push");
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(function (OneSignal) {
        OneSignal.Notifications.requestPermission().then(() => syncUserToDb());
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
  initCleanup();
  initNotifPrompt();
  initSimulateur();
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
    navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' }).then(reg => {
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
