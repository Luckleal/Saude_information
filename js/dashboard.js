import { db } from './firebase-config.js';
import { logout, requireAuth } from './auth.js';
import { can, roleLabel, allowedPatientFields } from './permissions.js';
import { setupRegisterForm } from './register.js';
import { ref, onValue, set, update, get, child } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { setText, getValue, setValue, splitLines, linesToText, formatDateTime, toast, downloadText, sanitizeText } from './utils.js';
import { fileToBase64, getMimeType, formatExamJson, renderExamTable } from './lab-extractor.js';

const SECTORS = {
  cm: {
    label: 'Clínica Médica',
    subtitle: '25 leitos · 6 quartos',
    icon: 'ti-building-hospital',
    rooms: [
      { id: '101', beds: ['a', 'b', 'c', 'd', 'e'] },
      { id: '102', beds: ['a', 'b', 'c', 'd', 'e'] },
      { id: '103', beds: ['a', 'b', 'c'] },
      { id: '104', beds: ['a', 'b', 'c', 'd', 'e'] },
      { id: '105', beds: ['a', 'b', 'c'] },
      { id: '106', beds: ['a', 'b', 'c', 'd'] }
    ]
  },
  sv: {
    label: 'Sala Vermelha',
    subtitle: '4 leitos de emergência',
    icon: 'ti-urgent',
    rooms: [{ id: '700', beds: ['a', 'b', 'c', 'd'] }]
  },
  ps: {
    label: 'Observação — Pronto Socorro',
    subtitle: '7 leitos · quartos 902 e 903',
    icon: 'ti-stethoscope',
    rooms: [
      { id: '902', beds: ['a', 'b', 'c'] },
      { id: '903', beds: ['a', 'b', 'c', 'd'] }
    ]
  }
};

const STATE_PATH = 'hrpt/v20';
let state = { DATA: { cm: {}, sv: {}, ps: {} }, MEDICOS: [] };
let currentSector = 'cm';
let selectedBed = null;
let currentUser = null;
let currentProfile = null;
const stateRef = ref(db, STATE_PATH);

requireAuth({
  onReady(user, profile) {
    currentUser = user;
    currentProfile = { uid: user.uid, ...profile };
    bootDashboard();
  }
});

function bootDashboard() {
  document.getElementById('app').classList.remove('is-loading');
  setText(document.getElementById('userName'), currentProfile.nome || currentUser.email);
  setText(document.getElementById('userRole'), roleLabel(currentProfile.perfil));
  setText(document.getElementById('userAvatar'), (currentProfile.nome || currentUser.email || 'U').charAt(0).toUpperCase());

  applyPermissions();
  setupNavigation();
  setupRegisterForm(currentProfile, renderUsersList);
  setupModalEvents();
  setupCalculator();
  setupLogout();
  setupSettings();
  setupDoctors();
  setupAiModal();
  listenState();
  renderUsersList();
}

function applyPermissions() {
  document.querySelectorAll('[data-permission]').forEach(element => {
    element.hidden = !can(currentProfile.perfil, element.dataset.permission);
  });
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      if (!tab) return;
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

      if (tab === 'sector') {
        currentSector = button.dataset.sector || 'cm';
        selectedBed = null;
        document.getElementById('sectorTab')?.classList.add('active');
        renderCurrentSector();
        return;
      }

      document.getElementById(`${tab}Tab`)?.classList.add('active');
      const titles = { calculator: 'Calculadora Médica', users: 'Usuários', doctors: 'Médicos' };
      setText(document.getElementById('pageTitle'), titles[tab] || 'Dashboard');
      setText(document.getElementById('pageSubtitle'), 'Sistema HRPT');
      if (tab === 'doctors') renderDoctorsList();
    });
  });

  document.getElementById('exportSectorButton')?.addEventListener('click', exportCurrentSectorCsv);
}


function setupSettings() {
  applyStoredSettings();
  document.getElementById('settingsButton')?.addEventListener('click', openSettingsModal);
  document.getElementById('closeSettingsModalButton')?.addEventListener('click', closeSettingsModal);
  document.getElementById('cancelSettingsButton')?.addEventListener('click', closeSettingsModal);
  document.getElementById('settingsModal')?.addEventListener('click', event => {
    if (event.target.id === 'settingsModal') closeSettingsModal();
  });
  document.getElementById('settingDarkMode')?.addEventListener('change', event => {
    localStorage.setItem('hrpt_dark_mode', event.target.checked ? '1' : '0');
    applyStoredSettings();
  });
  document.getElementById('settingCompactMode')?.addEventListener('change', event => {
    localStorage.setItem('hrpt_compact_mode', event.target.checked ? '1' : '0');
    applyStoredSettings();
  });
  document.getElementById('saveSettingsButton')?.addEventListener('click', () => {
    const endpoint = getValue('settingsAiEndpoint') || '/api/extrair';
    localStorage.setItem('hrpt_ai_endpoint', endpoint);
    setValue('aiEndpoint', endpoint);
    toast('Configurações salvas.');
    closeSettingsModal();
  });
}

function applyStoredSettings() {
  const dark = localStorage.getItem('hrpt_dark_mode') === '1';
  const compact = localStorage.getItem('hrpt_compact_mode') === '1';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.body.classList.toggle('compact-mode', compact);
  const darkInput = document.getElementById('settingDarkMode');
  const compactInput = document.getElementById('settingCompactMode');
  if (darkInput) darkInput.checked = dark;
  if (compactInput) compactInput.checked = compact;
}

function openSettingsModal() {
  setValue('settingsAiEndpoint', localStorage.getItem('hrpt_ai_endpoint') || '/api/extrair');
  applyStoredSettings();
  const modal = document.getElementById('settingsModal');
  modal.hidden = false;
  modal.removeAttribute('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.hidden = true;
  modal.setAttribute('hidden', '');
}

function setupLogout() {
  document.getElementById('logoutButton').addEventListener('click', async () => {
    await logout();
    window.location.href = 'login.html';
  });
}

function listenState() {
  setSyncStatus('Conectando...', 'warn');
  onValue(stateRef, async snapshot => {
    if (!snapshot.exists()) {
      state = createInitialState();
      await set(stateRef, state);
      setSyncStatus('Online', 'ok');
      renderCurrentSector();
      renderDoctorsList();
      return;
    }

    const firebaseState = snapshot.val() || {};
    state = {
      DATA: firebaseState.DATA || { cm: firebaseState.cm || {}, sv: firebaseState.sv || {}, ps: firebaseState.ps || {} },
      MEDICOS: Array.isArray(firebaseState.MEDICOS) ? firebaseState.MEDICOS : []
    };
    ensureAllBeds();
    renderCurrentSector();
    renderDoctorsList();
    setText(document.getElementById('lastUpdate'), formatDateTime());
    setSyncStatus('Sincronizado', 'ok');
  }, error => {
    console.error(error);
    setSyncStatus('Erro Firebase', 'err');
  });
}

function createInitialState() {
  const data = { cm: {}, sv: {}, ps: {} };
  Object.entries(SECTORS).forEach(([sector, config]) => {
    config.rooms.forEach(room => room.beds.forEach(bed => {
      data[sector][`${room.id}${bed}`] = { status: 'free' };
    }));
  });
  return { DATA: data, MEDICOS: [] };
}

function ensureAllBeds() {
  if (!state.DATA) state.DATA = { cm: {}, sv: {}, ps: {} };
  Object.entries(SECTORS).forEach(([sector, config]) => {
    if (!state.DATA[sector]) state.DATA[sector] = {};
    config.rooms.forEach(room => room.beds.forEach(bed => {
      const key = `${room.id}${bed}`;
      if (!state.DATA[sector][key]) state.DATA[sector][key] = { status: 'free' };
    }));
  });
  if (!Array.isArray(state.MEDICOS)) state.MEDICOS = [];
}

function setSyncStatus(text, stateName) {
  const status = document.getElementById('syncStatus');
  status.classList.remove('ok', 'err');
  if (stateName === 'ok') status.classList.add('ok');
  if (stateName === 'err') status.classList.add('err');
  status.innerHTML = `<span class="sync-dot"></span> ${sanitizeText(text)}`;
}

function renderCurrentSector() {
  const config = SECTORS[currentSector];
  setText(document.getElementById('pageTitle'), config.label);
  setText(document.getElementById('pageSubtitle'), config.subtitle);
  setText(document.getElementById('sectorTitle'), config.label);
  setText(document.getElementById('sectorDescription'), config.subtitle);
  const header = document.getElementById('sectorHeader');
  header.className = `sector-header ${currentSector}`;
  const icon = document.getElementById('sectorIcon');
  icon.className = `ti ${config.icon}`;
  renderStats();
  renderWard();
  if (selectedBed) renderPatientPanel(selectedBed);
  else renderEmptyPanel();
}

function getSectorPatients() {
  return state.DATA?.[currentSector] || {};
}

function renderStats() {
  const patients = getSectorPatients();
  const stats = { occ: 0, alert: 0, free: 0, clean: 0 };
  Object.values(patients).forEach(patient => {
    const status = patient.status || 'free';
    if (stats[status] !== undefined) stats[status] += 1;
    else stats.free += 1;
  });
  const total = SECTORS[currentSector].rooms.reduce((sum, room) => sum + room.beds.length, 0);
  const cards = [
    { key: 'occ', label: 'Ocupados', icon: 'ti-bed', color: 'var(--color-danger)' },
    { key: 'alert', label: 'Alta prevista', icon: 'ti-door-exit', color: 'var(--color-warning)' },
    { key: 'free', label: 'Livres', icon: 'ti-circle-check', color: 'var(--color-success)' },
    { key: 'clean', label: 'Limpeza', icon: 'ti-wash', color: 'var(--color-gray)' },
    { key: 'total', label: 'Total leitos', icon: 'ti-building-hospital', color: 'var(--color-primary)', value: total }
  ];

  const row = document.getElementById('statsRow');
  row.replaceChildren(...cards.map(card => {
    const article = document.createElement('article');
    article.className = 'stat-card';
    const icon = document.createElement('i');
    icon.className = `ti ${card.icon}`;
    const number = document.createElement('div');
    number.className = 'stat-number';
    number.style.color = card.color;
    number.textContent = card.value ?? stats[card.key];
    const label = document.createElement('div');
    label.className = 'stat-label';
    label.textContent = card.label;
    article.append(icon, number, label);
    return article;
  }));
}

function renderWard() {
  const grid = document.getElementById('wardGrid');
  grid.replaceChildren();
  const patients = getSectorPatients();
  SECTORS[currentSector].rooms.forEach(room => {
    const card = document.createElement('article');
    card.className = 'room-card';
    const header = document.createElement('div');
    header.className = 'room-header';
    const badge = document.createElement('span');
    badge.className = `room-badge ${currentSector}`;
    badge.textContent = `QUARTO ${room.id}`;
    const label = document.createElement('span');
    label.className = 'room-label';
    label.textContent = `${room.beds.length} leitos`;
    header.append(badge, label);
    const beds = document.createElement('div');
    beds.className = 'beds';
    room.beds.forEach(bed => beds.appendChild(createBedButton(room.id, bed, patients)));
    card.append(header, beds);
    grid.appendChild(card);
  });
}

function createBedButton(roomId, bed, patients) {
  const key = `${roomId}${bed}`;
  const patient = patients[key] || { status: 'free' };
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bed ${currentSector} ${patient.status || 'free'}${selectedBed === key ? ' selected' : ''}`;
  button.addEventListener('click', () => renderPatientPanel(key));
  const dot = document.createElement('span');
  dot.className = 'bed-dot';
  dot.style.background = statusColor(patient.status);
  const icon = document.createElement('i');
  icon.className = patient.isolamento ? 'ti ti-biohazard' : 'ti ti-bed';
  const id = document.createElement('span');
  id.className = 'bed-id';
  id.textContent = `${roomId}${bed.toUpperCase()}`;
  const name = document.createElement('span');
  name.className = 'bed-name';
  name.textContent = patient.nome ? patient.nome.split(' ')[0] : '—';
  const doctor = document.createElement('span');
  doctor.className = 'bed-doctor';
  doctor.textContent = getDoctorShortName(patient.medico_id);
  button.append(dot, icon, id, name, doctor);
  return button;
}

function statusColor(status) {
  const colors = { occ: '#ef4444', alert: '#f59e0b', clean: '#94a3b8', free: '#22c55e' };
  return colors[status] || colors.free;
}

function renderEmptyPanel() {
  const panel = document.getElementById('patientPanel');
  panel.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  empty.innerHTML = `<i class="ti ${SECTORS[currentSector].icon}"></i><p>Selecione um leito para visualizar a ficha.</p>`;
  panel.appendChild(empty);
}

function renderPatientPanel(key) {
  selectedBed = key;
  renderWard();
  const patient = getSectorPatients()[key] || { status: 'free', vitals: {} };
  const panel = document.getElementById('patientPanel');
  panel.replaceChildren();

  const header = document.createElement('header');
  header.className = `patient-summary-header ${currentSector}`;
  const title = document.createElement('h2');
  title.innerHTML = `<i class="ti ti-bed"></i> Leito ${key.slice(0, -1)} ${key.slice(-1).toUpperCase()}`;
  const subtitle = document.createElement('span');
  subtitle.className = `status-badge ${patient.status || 'free'}`;
  subtitle.textContent = getStatusLabel(patient.status);
  header.append(title, subtitle);

  const body = document.createElement('div');
  body.className = 'patient-summary-body';

  if (!patient.nome) {
    const empty = document.createElement('div');
    empty.className = 'patient-summary-empty';
    empty.innerHTML = '<i class="ti ti-circle-check"></i><strong>Leito disponível</strong><span>Sem paciente internado neste leito.</span>';
    const actions = document.createElement('div');
    actions.className = 'panel-actions dark-actions';
    const admit = document.createElement('button');
    admit.className = 'btn btn-primary';
    admit.type = 'button';
    admit.innerHTML = '<i class="ti ti-user-plus"></i> Admitir paciente';
    admit.hidden = !can(currentProfile.perfil, 'editBeds');
    admit.addEventListener('click', () => openPatientModal(currentSector, key));
    actions.appendChild(admit);
    panel.append(header, empty, actions);
    return;
  }

  const doctorName = state.MEDICOS.find(doctor => doctor.id === patient.medico_id)?.nome || '—';
  const identification = document.createElement('section');
  identification.className = 'summary-section';
  identification.innerHTML = '<h3><i class="ti ti-id-badge"></i> Identificação</h3>';
  appendSummaryInfo(identification, 'Nome', patient.nome || '—');
  appendSummaryInfo(identification, 'Idade / Sexo', `${patient.idade || '—'} anos / ${patient.sexo === 'F' ? 'Feminino' : 'Masculino'}`);
  appendSummaryInfo(identification, 'Origem', patient.origem || '—');
  appendSummaryInfo(identification, 'Admissão', patient.admissao || '—');
  appendSummaryInfo(identification, 'Diagnóstico', patient.diagnostico || '—');
  appendSummaryInfo(identification, 'CID', patient.cid || '—');
  appendSummaryInfo(identification, 'Comorbidades', patient.comorbidades || '—');
  appendSummaryInfo(identification, 'Alergias', patient.alergias || 'Nega', patient.alergias ? '' : 'positive');
  appendSummaryInfo(identification, 'MUC', formatSimpleList(patient.muc, 'med') || 'Nega');
  appendSummaryInfo(identification, 'Médico resp.', doctorName, doctorName === '—' ? '' : 'accent');

  const vitals = document.createElement('section');
  vitals.className = 'summary-section vitals-summary-section';
  vitals.innerHTML = '<h3><i class="ti ti-wave-sine"></i> Sinais vitais</h3>';
  const vitalsGrid = document.createElement('div');
  vitalsGrid.className = 'summary-vitals-grid';
  vitalsGrid.append(
    createVitalCard('PA', patient.vitals?.pa || '—', 'mmHg'),
    createVitalCard('FC', patient.vitals?.fc || '—', 'bpm'),
    createVitalCard('FR', patient.vitals?.fr || '—', 'irpm'),
    createVitalCard('TEMP.', patient.vitals?.temp || '—', '°C'),
    createVitalCard('SPO₂', patient.vitals?.spo2 || '—', '')
  );
  vitals.appendChild(vitalsGrid);

  body.append(identification, vitals);

  const actions = document.createElement('div');
  actions.className = 'panel-actions dark-actions patient-panel-footer';

  const release = document.createElement('button');
  release.className = 'btn btn-danger btn-footer-liberate';
  release.type = 'button';
  release.innerHTML = '<i class="ti ti-door-exit"></i> Liberar';
  release.hidden = !can(currentProfile.perfil, 'releaseBed');
  release.addEventListener('click', async () => {
    if (!confirm('Deseja liberar este leito?')) return;
    await set(ref(db, `${STATE_PATH}/DATA/${currentSector}/${key}`), { status: 'clean', medico_id: patient.medico_id || '', liberadoEm: new Date().toISOString(), liberadoPor: currentUser.uid });
    toast('Leito liberado e marcado para limpeza.');
  });

  const exportButton = document.createElement('button');
  exportButton.className = 'btn btn-green btn-footer-export';
  exportButton.type = 'button';
  exportButton.innerHTML = '<i class="ti ti-file-export"></i> Exportar';
  exportButton.hidden = !can(currentProfile.perfil, 'exportRecord');
  exportButton.addEventListener('click', () => exportPatientRecord(currentSector, key));

  const edit = document.createElement('button');
  edit.className = 'btn btn-primary btn-footer-edit';
  edit.type = 'button';
  edit.innerHTML = '<i class="ti ti-edit"></i> Editar';
  edit.hidden = !can(currentProfile.perfil, 'editBeds') && !can(currentProfile.perfil, 'updateVitals');
  edit.addEventListener('click', () => openPatientModal(currentSector, key));

  actions.append(release, exportButton, edit);
  panel.append(header, body, actions);
}

function appendSummaryInfo(parent, label, value, className = '') {
  const row = document.createElement('div');
  row.className = 'summary-info-row';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value || '—';
  if (className) valueEl.classList.add(className);
  row.append(labelEl, valueEl);
  parent.appendChild(row);
}

function createVitalCard(label, value, unit) {
  const card = document.createElement('div');
  card.className = label === 'SPO₂' ? 'summary-vital-card wide' : 'summary-vital-card';
  card.innerHTML = `<span>${label}</span><strong>${value}</strong><small>${unit}</small>`;
  return card;
}

function getStatusLabel(status) {
  const labels = { free: 'Livre', occ: 'Internado(a)', alert: 'Alta prevista', clean: 'Em limpeza' };
  return labels[status] || labels.free;
}

function appendInfo(parent, label, value) {
  const row = document.createElement('div');
  row.className = 'info-row';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  parent.appendChild(row);
}

function appendSection(parent, title, value) {
  if (!value) return;
  const section = document.createElement('section');
  section.className = 'panel-section';
  const h = document.createElement('h3');
  h.textContent = title;
  const box = document.createElement('div');
  box.className = 'obs-box';
  box.textContent = value;
  section.append(h, box);
  parent.appendChild(section);
}

function appendImageThumbs(parent, imageEntries = []) {
  const fotos = (imageEntries || []).flatMap(item => item.fotos || []).filter(Boolean);
  if (!fotos.length) return;
  const section = document.createElement('section');
  section.className = 'panel-section';
  const h = document.createElement('h3');
  h.textContent = 'Arquivos de imagem';
  const wrap = document.createElement('div');
  wrap.className = 'img-thumb-wrap';
  fotos.forEach(src => {
    const img = document.createElement('img');
    img.className = 'img-thumb';
    img.src = src;
    img.alt = 'Imagem de exame';
    img.addEventListener('click', () => openLightbox(src));
    wrap.appendChild(img);
  });
  section.append(h, wrap);
  parent.appendChild(section);
}

function setupModalEvents() {
  document.getElementById('closeModalButton').addEventListener('click', closePatientModal);
  document.getElementById('cancelModalButton').addEventListener('click', closePatientModal);
  document.getElementById('patientModal').addEventListener('click', event => {
    if (event.target.id === 'patientModal') closePatientModal();
  });
  document.getElementById('patientForm').addEventListener('submit', savePatientFromForm);
  document.getElementById('releaseBedButton').addEventListener('click', releaseSelectedBed);
  document.getElementById('openAiExamButton').addEventListener('click', openExamModal);
  document.getElementById('imageFiles').addEventListener('change', renderSelectedImagesPreview);
  setupDynamicFormEvents();
  document.getElementById('closeLightbox')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox')?.addEventListener('click', event => {
    if (event.target.id === 'lightbox') closeLightbox();
  });
}

function openPatientModal(sector, key) {
  const permissionType = allowedPatientFields(currentProfile.perfil);
  if (permissionType === 'none') {
    toast('Você não possui permissão para editar este leito.');
    return;
  }
  const patient = state.DATA?.[sector]?.[key] || { status: 'free', vitals: {} };
  setValue('sectorKey', sector);
  setValue('bedKey', key);
  setValue('patientStatus', patient.status || 'free');
  setValue('patientIsolation', String(Boolean(patient.isolamento)));
  fillDoctorSelect(patient.medico_id || '');
  setValue('patientName', patient.nome || '');
  setValue('patientAge', patient.idade || '');
  setValue('patientSex', patient.sexo || 'M');
  setValue('patientWeight', patient.peso || '');
  setValue('patientOrigin', patient.origem || '');
  setValue('patientAdmission', patient.admissao || '');
  setValue('patientDiagnosis', patient.diagnostico || '');
  setValue('patientCid', patient.cid || '');
  setValue('patientAllergies', patient.alergias || 'Nega');
  setValue('patientComorbidities', patient.comorbidades || '');
  setValue('admissionHistory', patient.admissao_hda || patient.historia_admissao || '');
  setValue('dailyAssessment', patient.avaliacao_diaria || '');
  setValue('examEcto', patient.exame_fisico?.ecto || '');
  setValue('examNeuro', patient.exame_fisico?.neuro || '');
  setValue('examCardio', patient.exame_fisico?.cardio || '');
  setValue('examPulmonar', patient.exame_fisico?.pulmonar || '');
  setValue('examAbdome', patient.exame_fisico?.abdome || '');
  setValue('examRenal', patient.exame_fisico?.renal || '');
  setValue('examMmii', patient.exame_fisico?.mmii || '');
  populateSimpleRows('mucListRows', patient.muc, 'med', 'Medicação de uso contínuo');
  populateSimpleRows('hypothesesRows', patient.hipoteses, 'txt', 'Hipótese diagnóstica');
  populateSimpleRows('problemsRows', patient.problemas, 'txt', 'Problema');
  populatePendingRows(patient.pendencias);
  populateSimpleRows('conductRows', patient.conduta, 'txt', 'Conduta');
  populateTreatmentRows(patient.tratamentos);
  populateSpecialtyRows(patient.especialidades);
  populateDatedTextRows('labRows', patient.laboratoriais, 'Resultado laboratorial');
  populateDatedTextRows('imageExamRows', patient.imagens, 'Laudo/descrição');
  setValue('vitalPa', patient.vitals?.pa || '');
  setValue('vitalFc', patient.vitals?.fc || '');
  setValue('vitalFr', patient.vitals?.fr || '');
  setValue('vitalTemp', patient.vitals?.temp || '');
  setValue('vitalSpo2', patient.vitals?.spo2 || '');
  document.getElementById('imageFiles').value = '';
  document.getElementById('imagePreview').replaceChildren();
  applyModalFieldPermissions(permissionType);
  const modal = document.getElementById('patientModal');
  modal.hidden = false;
  modal.removeAttribute('hidden');
  setTimeout(() => modal.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus(), 80);
}

function fillDoctorSelect(selectedId = '') {
  const select = document.getElementById('patientDoctor');
  select.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '— Nenhum —';
  select.appendChild(empty);
  state.MEDICOS.forEach(doctor => {
    const option = document.createElement('option');
    option.value = doctor.id;
    option.textContent = doctor.crm ? `${doctor.nome} (${doctor.crm})` : doctor.nome;
    option.selected = doctor.id === selectedId;
    select.appendChild(option);
  });
}

function applyModalFieldPermissions(permissionType) {
  const form = document.getElementById('patientForm');
  if (!form) return;

  form.querySelectorAll('input, select, textarea, button').forEach(field => {
    if (field.type !== 'hidden') {
      field.disabled = false;
      field.readOnly = false;
      field.removeAttribute('disabled');
      field.removeAttribute('readonly');
    }
  });

  if (permissionType === 'nursing') {
    form.querySelectorAll('[data-medical-field], [data-medical-field] input, [data-medical-field] select, [data-medical-field] textarea, [data-add-row]').forEach(field => {
      field.disabled = true;
      if ('readOnly' in field) field.readOnly = true;
    });
  }

  document.getElementById('releaseBedButton').hidden = !can(currentProfile.perfil, 'releaseBed');
  document.getElementById('openAiExamButton').hidden = permissionType === 'nursing';
}

function closePatientModal() {
  const modal = document.getElementById('patientModal');
  modal.hidden = true;
  modal.setAttribute('hidden', '');
}

async function savePatientFromForm(event) {
  event.preventDefault();
  const sector = getValue('sectorKey');
  const key = getValue('bedKey');
  const base = state.DATA?.[sector]?.[key] || {};
  const permissionType = allowedPatientFields(currentProfile.perfil);
  const vitals = { pa: getValue('vitalPa'), fc: getValue('vitalFc'), fr: getValue('vitalFr'), temp: getValue('vitalTemp'), spo2: getValue('vitalSpo2') };
  let payload = { ...base, vitals, atualizadoEm: new Date().toISOString(), atualizadoPor: currentUser.uid };
  if (permissionType === 'all' || permissionType === 'medical') {
    const novasImagens = await buildImageEntriesFromInput();
    payload = {
      ...payload,
      status: getValue('patientStatus'),
      isolamento: getValue('patientIsolation') === 'true',
      medico_id: getValue('patientDoctor'),
      nome: getValue('patientName'), idade: getValue('patientAge'), sexo: getValue('patientSex'),
      peso: getValue('patientWeight'), origem: getValue('patientOrigin'), admissao: getValue('patientAdmission'),
      diagnostico: getValue('patientDiagnosis'), cid: getValue('patientCid'), alergias: getValue('patientAllergies') || 'Nega',
      comorbidades: getValue('patientComorbidities'),
      admissao_hda: getValue('admissionHistory'),
      avaliacao_diaria: getValue('dailyAssessment'),
      exame_fisico: {
        ecto: getValue('examEcto'),
        neuro: getValue('examNeuro'),
        cardio: getValue('examCardio'),
        pulmonar: getValue('examPulmonar'),
        abdome: getValue('examAbdome'),
        renal: getValue('examRenal'),
        mmii: getValue('examMmii')
      },
      muc: serializeSimpleRows('mucListRows', 'med'),
      hipoteses: serializeSimpleRows('hypothesesRows'),
      problemas: serializeSimpleRows('problemsRows'),
      pendencias: serializePendingRows(),
      conduta: serializeSimpleRows('conductRows'),
      tratamentos: serializeTreatmentRows(),
      especialidades: serializeSpecialtyRows(),
      laboratoriais: serializeDatedTextRows('labRows'),
      imagens: [...serializeDatedTextRows('imageExamRows'), ...novasImagens]
    };
  }
  if (permissionType === 'nursing') {
    payload.status = getValue('patientStatus');
    payload.isolamento = getValue('patientIsolation') === 'true';
  }
  try {
    await update(ref(db, `${STATE_PATH}/DATA/${sector}/${key}`), payload);
    closePatientModal();
    toast('Leito atualizado com sucesso.');
  } catch (error) {
    console.error(error);
    toast('Erro ao salvar. Verifique suas permissões.');
  }
}

async function buildImageEntriesFromInput() {
  const files = Array.from(document.getElementById('imageFiles')?.files || []);
  if (!files.length) return [];
  const fotos = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const base64 = await fileToBase64(file);
    fotos.push(`data:${file.type};base64,${base64}`);
  }
  return fotos.length ? [{ data: new Date().toLocaleDateString('pt-BR'), txt: 'Imagem anexada pelo formulário', fotos }] : [];
}

function renderSelectedImagesPreview() {
  const wrap = document.getElementById('imagePreview');
  wrap.replaceChildren();
  const files = Array.from(document.getElementById('imageFiles')?.files || []);
  files.forEach(file => {
    const item = document.createElement('span');
    item.className = 'image-preview-chip';
    item.textContent = file.name;
    wrap.appendChild(item);
  });
}

async function releaseSelectedBed() {
  const sector = getValue('sectorKey');
  const key = getValue('bedKey');
  if (!can(currentProfile.perfil, 'releaseBed')) {
    toast('Você não possui permissão para liberar leitos.');
    return;
  }
  if (!confirm('Deseja liberar este leito?')) return;
  const doctorId = state.DATA?.[sector]?.[key]?.medico_id || '';
  await set(ref(db, `${STATE_PATH}/DATA/${sector}/${key}`), { status: 'clean', medico_id: doctorId, liberadoEm: new Date().toISOString(), liberadoPor: currentUser.uid });
  closePatientModal();
  toast('Leito liberado e marcado para limpeza.');
}

function setupDoctors() {
  const form = document.getElementById('doctorForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!can(currentProfile.perfil, 'manageUsers')) return toast('Apenas administradores podem gerenciar médicos.');
    const nome = getValue('doctorName');
    const crm = getValue('doctorCrm');
    if (!nome) return toast('Informe o nome do médico.');
    const doctor = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), nome, crm, criadoEm: new Date().toISOString() };
    const nextDoctors = [...state.MEDICOS, doctor];
    await set(ref(db, `${STATE_PATH}/MEDICOS`), nextDoctors);
    setValue('doctorName', '');
    setValue('doctorCrm', '');
    toast('Médico cadastrado.');
  });
}

function renderDoctorsList() {
  const list = document.getElementById('doctorsList');
  if (!list) return;
  if (!state.MEDICOS.length) {
    list.innerHTML = '<div class="panel-empty small">Nenhum médico cadastrado.</div>';
    return;
  }
  list.replaceChildren(...state.MEDICOS.map(doctor => {
    const item = document.createElement('div');
    item.className = 'user-list-item';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = doctor.nome;
    const meta = document.createElement('p');
    meta.textContent = doctor.crm || 'Sem CRM informado';
    info.append(name, meta);
    const removeButton = document.createElement('button');
    removeButton.className = 'btn btn-danger';
    removeButton.type = 'button';
    removeButton.textContent = 'Remover';
    removeButton.addEventListener('click', () => removeDoctor(doctor.id));
    item.append(info, removeButton);
    return item;
  }));
}

async function removeDoctor(id) {
  if (!confirm('Remover este médico da lista?')) return;
  const nextDoctors = state.MEDICOS.filter(doctor => doctor.id !== id);
  await set(ref(db, `${STATE_PATH}/MEDICOS`), nextDoctors);
  toast('Médico removido.');
}

function getDoctorName(id) {
  return state.MEDICOS.find(doctor => doctor.id === id)?.nome || '';
}

function getDoctorShortName(id) {
  const name = getDoctorName(id);
  if (!name) return '';
  return name.replace(/^Dr\.?|^Dra\.?/i, '').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function exportCurrentSectorCsv() {
  const patients = getSectorPatients();
  const rows = [['Setor', 'Leito', 'Status', 'Nome', 'Idade', 'Sexo', 'Médico', 'Diagnóstico', 'Admissão', 'Pendências']];
  Object.entries(patients).forEach(([key, patient]) => {
    rows.push([SECTORS[currentSector].label, key.toUpperCase(), patient.status || 'free', patient.nome || '', patient.idade || '', patient.sexo || '', getDoctorName(patient.medico_id), patient.diagnostico || '', patient.admissao || '', formatPending(patient.pendencias)]);
  });
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n');
  downloadText(`hrpt_${currentSector}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

function exportPatientRecord(sector, key) {
  const patient = state.DATA?.[sector]?.[key];
  if (!patient?.nome) return;
  const content = [
    `SETOR: ${SECTORS[sector].label}`,
    `LEITO ${key.slice(0, -1)} ${key.slice(-1).toUpperCase()}`,
    `NOME: ${patient.nome}`,
    `IDADE/SEXO: ${patient.idade || '—'} / ${patient.sexo || '—'}`,
    `MÉDICO: ${getDoctorName(patient.medico_id) || '—'}`,
    `ORIGEM: ${patient.origem || '—'}`,
    `ADMISSÃO: ${patient.admissao || '—'}`,
    `DIAGNÓSTICO: ${patient.diagnostico || '—'}`,
    `CID: ${patient.cid || '—'}`,
    `ALERGIAS: ${patient.alergias || 'Nega'}`,
    '', 'MUC:', formatSimpleList(patient.muc, 'med') || 'Nega',
    '', 'HIPÓTESES:', formatSimpleList(patient.hipoteses) || '—',
    '', 'AVALIAÇÃO DIÁRIA:', patient.avaliacao_diaria || '—',
    '', 'PROBLEMAS:', formatSimpleList(patient.problemas) || '—',
    '', 'PENDÊNCIAS:', formatPending(patient.pendencias) || '—',
    '', 'TRATAMENTOS:', formatTreatments(patient.tratamentos) || '—',
    '', 'ESPECIALIDADES:', formatSpecialties(patient.especialidades) || '—',
    '', 'EXAMES LABORATORIAIS:', formatDatedText(patient.laboratoriais) || '—',
    '', 'EXAMES DE IMAGEM:', formatDatedText(patient.imagens) || '—',
    '', 'CONDUTA:', formatSimpleList(patient.conduta) || '—',
    '', 'SINAIS VITAIS:', `PA: ${patient.vitals?.pa || '—'} | FC: ${patient.vitals?.fc || '—'} | FR: ${patient.vitals?.fr || '—'} | TEMP: ${patient.vitals?.temp || '—'} | SPO2: ${patient.vitals?.spo2 || '—'}`
  ].join('\n');
  downloadText(`leito_${sector}_${key}_${patient.nome.split(' ')[0]}.txt`, content);
}

function setupCalculator() {
  document.getElementById('imcForm').addEventListener('submit', event => {
    event.preventDefault();
    const peso = Number(getValue('imcPeso'));
    const altura = Number(getValue('imcAltura'));
    const result = document.getElementById('imcResult');
    if (!peso || !altura) { result.textContent = 'Informe peso e altura.'; return; }
    const imc = peso / (altura * altura);
    const faixa = imc < 18.5 ? 'baixo peso' : imc < 25 ? 'eutrofia' : imc < 30 ? 'sobrepeso' : 'obesidade';
    result.textContent = `IMC: ${imc.toFixed(2)} kg/m² — ${faixa}`;
  });
  document.getElementById('doseForm').addEventListener('submit', event => {
    event.preventDefault();
    const peso = Number(getValue('dosePeso'));
    const dose = Number(getValue('doseMgKg'));
    const result = document.getElementById('doseResult');
    if (!peso || !dose) { result.textContent = 'Informe peso e dose.'; return; }
    result.textContent = `Dose total: ${(peso * dose).toFixed(2)} mg`;
  });
  document.getElementById('ckdForm').addEventListener('submit', event => {
    event.preventDefault();
    const cr = Number(getValue('ckdCr'));
    const idade = Number(getValue('ckdAge'));
    const sexo = getValue('ckdSex');
    const result = document.getElementById('ckdResult');
    if (!cr || !idade) { result.textContent = 'Informe creatinina e idade.'; return; }
    const k = sexo === 'F' ? 0.7 : 0.9;
    const a = sexo === 'F' ? -0.241 : -0.302;
    const mult = sexo === 'F' ? 1.012 : 1;
    const ratio = cr / k;
    const tfg = 142 * Math.pow(Math.min(ratio, 1), a) * Math.pow(Math.max(ratio, 1), -1.2) * Math.pow(0.9938, idade) * mult;
    result.textContent = `TFG estimada: ${tfg.toFixed(1)} mL/min/1,73m²`;
  });
  document.getElementById('wellsForm').addEventListener('submit', event => {
    event.preventDefault();
    const total = [...document.querySelectorAll('#wellsForm input[type="checkbox"]')].reduce((sum, input) => sum + (input.checked ? Number(input.value) : 0), 0);
    const risco = total <= 1 ? 'baixa' : total <= 6 ? 'intermediária' : 'alta';
    document.getElementById('wellsResult').textContent = `${total} ponto(s) — probabilidade ${risco}`;
  });
  document.getElementById('sofaForm').addEventListener('submit', event => {
    event.preventDefault();
    const total = [...document.querySelectorAll('.sofa-part')].reduce((sum, select) => sum + Number(select.value), 0);
    document.getElementById('sofaResult').textContent = `SOFA: ${total} ponto(s)`;
  });
  document.getElementById('hasbledForm').addEventListener('submit', event => {
    event.preventDefault();
    const total = [...document.querySelectorAll('#hasbledForm input[type="checkbox"]')].filter(input => input.checked).length;
    document.getElementById('hasbledResult').textContent = `HAS-BLED: ${total} ponto(s)`;
  });
}

async function renderUsersList() {
  if (!can(currentProfile?.perfil, 'manageUsers')) return;
  const list = document.getElementById('usersList');
  const snapshot = await get(child(ref(db), 'usuarios'));
  const users = snapshot.exists() ? snapshot.val() : {};
  list.replaceChildren(...Object.entries(users).map(([, user]) => {
    const item = document.createElement('div');
    item.className = 'user-list-item';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = user.nome || 'Sem nome';
    const meta = document.createElement('p');
    meta.textContent = `${user.email || 'sem e-mail'} · ${roleLabel(user.perfil)}`;
    info.append(name, meta);
    item.appendChild(info);
    return item;
  }));
}

function setupAiModal() {
  document.getElementById('closeExamModalButton').addEventListener('click', closeExamModal);
  document.getElementById('processExamButton').addEventListener('click', processExamWithApi);
  document.getElementById('insertExamButton').addEventListener('click', insertExamResultIntoForm);
  const savedEndpoint = localStorage.getItem('hrpt_ai_endpoint') || '/api/extrair';
  setValue('aiEndpoint', savedEndpoint);
}

function openExamModal() {
  const modal = document.getElementById('examModal');
  modal.hidden = false;
  modal.removeAttribute('hidden');
}

function closeExamModal() {
  const modal = document.getElementById('examModal');
  modal.hidden = true;
  modal.setAttribute('hidden', '');
}

async function processExamWithApi() {
  const endpoint = getValue('aiEndpoint') || '/api/extrair';
  const file = document.getElementById('examFileInput').files?.[0];
  const status = document.getElementById('examStatus');
  const resultBox = document.getElementById('examResultTable');
  if (!endpoint) { status.textContent = 'Informe o endpoint seguro da IA.'; return; }
  if (!file) { status.textContent = 'Selecione um arquivo PDF ou imagem.'; return; }
  localStorage.setItem('hrpt_ai_endpoint', endpoint);
  status.textContent = `Preparando ${file.name} para análise...`;
  if (resultBox) resultBox.replaceChildren();
  try {
    const base64 = await fileToBase64(file);
    const mimeType = getMimeType(file);
    status.textContent = 'Enviando arquivo para a IA...';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, mimeType }) });
    const result = await response.json().catch(async () => ({ error: await response.text() }));
    if (!response.ok) throw new Error(result.error || `Erro HTTP ${response.status}`);
    const text = formatExamJson(result);
    setValue('examPreview', text);
    if (resultBox) resultBox.innerHTML = renderExamTable(result);
    status.textContent = 'Exame processado com sucesso.';
  } catch (error) {
    console.error(error);
    status.textContent = `Erro ao processar: ${error.message}`;
  }
}

function insertExamResultIntoForm() {
  const extracted = getValue('examPreview');
  if (!extracted) return toast('Nenhum resultado para inserir.');
  addDatedTextRow('labRows', { data: new Date().toLocaleDateString('pt-BR'), txt: extracted }, 'Resultado laboratorial');
  closeExamModal();
  toast('Exames inseridos na ficha.');
}


function setupDynamicFormEvents() {
  document.querySelectorAll('[data-add-row]').forEach(button => {
    button.addEventListener('click', () => addRowByContainer(button.dataset.addRow));
  });
}

function addRowByContainer(containerId) {
  const map = {
    mucListRows: () => addSimpleRow('mucListRows', '', 'Medicação de uso contínuo'),
    hypothesesRows: () => addSimpleRow('hypothesesRows', '', 'Hipótese diagnóstica'),
    problemsRows: () => addSimpleRow('problemsRows', '', 'Problema'),
    conductRows: () => addSimpleRow('conductRows', '', 'Conduta'),
    pendingRows: () => addPendingRow({}),
    treatmentsRows: () => addTreatmentRow({}),
    specialtiesRows: () => addSpecialtyRow({}),
    labRows: () => addDatedTextRow('labRows', {}, 'Resultado laboratorial'),
    imageExamRows: () => addDatedTextRow('imageExamRows', {}, 'Laudo/descrição')
  };
  map[containerId]?.();
}

function clearRows(containerId) {
  document.getElementById(containerId)?.replaceChildren();
}

function createRemoveButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remove-row-button';
  button.innerHTML = '<i class="ti ti-trash"></i>';
  button.addEventListener('click', () => button.closest('.dynamic-row')?.remove());
  return button;
}

function addSimpleRow(containerId, value = '', placeholder = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row simple-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder;
  input.dataset.field = 'txt';
  row.append(input, createRemoveButton());
  container.appendChild(row);
}

function populateSimpleRows(containerId, list = [], key = 'txt', placeholder = '') {
  clearRows(containerId);
  const values = (list || []).map(item => typeof item === 'string' ? item : item?.[key]).filter(Boolean);
  if (!values.length) addSimpleRow(containerId, '', placeholder);
  values.forEach(value => addSimpleRow(containerId, value, placeholder));
}

function serializeSimpleRows(containerId, key = 'txt') {
  return Array.from(document.querySelectorAll(`#${containerId} .dynamic-row`))
    .map(row => row.querySelector('[data-field="txt"]')?.value.trim())
    .filter(Boolean)
    .map(value => ({ [key]: value }));
}

function addPendingRow(item = {}) {
  const container = document.getElementById('pendingRows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row pending-row';
  row.innerHTML = `
    <input data-field="txt" type="text" placeholder="Pendência" value="${escapeAttr(item.txt || '')}">
    <input data-field="prazo" type="text" placeholder="Prazo" value="${escapeAttr(item.prazo || '')}">
  `;
  row.appendChild(createRemoveButton());
  container.appendChild(row);
}

function populatePendingRows(list = []) {
  clearRows('pendingRows');
  const values = (list || []).filter(item => item && (typeof item === 'string' || item.txt || item.prazo));
  if (!values.length) addPendingRow({});
  values.forEach(item => addPendingRow(typeof item === 'string' ? { txt: item } : item));
}

function serializePendingRows() {
  return Array.from(document.querySelectorAll('#pendingRows .dynamic-row')).map(row => ({
    txt: row.querySelector('[data-field="txt"]')?.value.trim() || '',
    prazo: row.querySelector('[data-field="prazo"]')?.value.trim() || '',
    feita: false
  })).filter(item => item.txt || item.prazo);
}

function addTreatmentRow(item = {}) {
  const container = document.getElementById('treatmentsRows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row treatment-row';
  row.innerHTML = `
    <input data-field="n" type="text" placeholder="Medicação" value="${escapeAttr(item.n || item.med || '')}">
    <input data-field="dose" type="text" placeholder="Dose" value="${escapeAttr(item.dose || '')}">
    <input data-field="freq" type="text" placeholder="Freq." value="${escapeAttr(item.freq || '')}">
    <input data-field="via" type="text" placeholder="Via" value="${escapeAttr(item.via || '')}">
    <input data-field="di" type="text" placeholder="D. início" value="${escapeAttr(item.di || item.inicio || '')}">
  `;
  row.appendChild(createRemoveButton());
  container.appendChild(row);
}

function populateTreatmentRows(list = []) {
  clearRows('treatmentsRows');
  const values = (list || []).filter(item => item && (typeof item === 'string' || item.n || item.dose));
  if (!values.length) addTreatmentRow({});
  values.forEach(item => {
    if (typeof item === 'string') {
      const [n = '', dose = '', freq = '', via = '', di = ''] = item.split('|').map(part => part.trim());
      addTreatmentRow({ n, dose, freq, via, di });
    } else addTreatmentRow(item);
  });
}

function serializeTreatmentRows() {
  return Array.from(document.querySelectorAll('#treatmentsRows .dynamic-row')).map(row => ({
    n: row.querySelector('[data-field="n"]')?.value.trim() || '',
    dose: row.querySelector('[data-field="dose"]')?.value.trim() || '',
    freq: row.querySelector('[data-field="freq"]')?.value.trim() || '',
    via: row.querySelector('[data-field="via"]')?.value.trim() || '',
    di: row.querySelector('[data-field="di"]')?.value.trim() || ''
  })).filter(item => item.n || item.dose || item.freq || item.via || item.di);
}

function addSpecialtyRow(item = {}) {
  const container = document.getElementById('specialtiesRows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row specialty-row';
  row.innerHTML = `
    <input data-field="data" type="text" placeholder="Data" value="${escapeAttr(item.data || '')}">
    <input data-field="esp" type="text" placeholder="Especialidade" value="${escapeAttr(item.esp || item.especialidade || '')}">
    <input data-field="medico" type="text" placeholder="Médico(a)" value="${escapeAttr(item.medico || item.status || '')}">
  `;
  row.appendChild(createRemoveButton());
  container.appendChild(row);
}

function populateSpecialtyRows(list = []) {
  clearRows('specialtiesRows');
  const values = (list || []).filter(item => item && (typeof item === 'string' || item.esp || item.data || item.medico));
  if (!values.length) addSpecialtyRow({});
  values.forEach(item => {
    if (typeof item === 'string') {
      const [data = '', esp = '', medico = ''] = item.split('|').map(part => part.trim());
      addSpecialtyRow({ data, esp, medico });
    } else addSpecialtyRow(item);
  });
}

function serializeSpecialtyRows() {
  return Array.from(document.querySelectorAll('#specialtiesRows .dynamic-row')).map(row => ({
    data: row.querySelector('[data-field="data"]')?.value.trim() || '',
    esp: row.querySelector('[data-field="esp"]')?.value.trim() || '',
    medico: row.querySelector('[data-field="medico"]')?.value.trim() || ''
  })).filter(item => item.data || item.esp || item.medico);
}

function addDatedTextRow(containerId, item = {}, placeholder = 'Descrição') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'dynamic-row dated-text-row';
  row.innerHTML = `
    <input data-field="data" type="text" placeholder="Data" value="${escapeAttr(item.data || '')}">
    <textarea data-field="txt" rows="2" placeholder="${escapeAttr(placeholder)}">${escapeHtml(item.txt || '')}</textarea>
  `;
  row.appendChild(createRemoveButton());
  container.appendChild(row);
}

function populateDatedTextRows(containerId, list = [], placeholder = 'Descrição') {
  clearRows(containerId);
  const values = (list || []).filter(item => item && (typeof item === 'string' || item.txt || item.data));
  if (!values.length) addDatedTextRow(containerId, {}, placeholder);
  values.forEach(item => addDatedTextRow(containerId, typeof item === 'string' ? { txt: item } : item, placeholder));
}

function serializeDatedTextRows(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .dynamic-row`)).map(row => ({
    data: row.querySelector('[data-field="data"]')?.value.trim() || '',
    txt: row.querySelector('[data-field="txt"]')?.value.trim() || ''
  })).filter(item => item.data || item.txt);
}

function formatPhysicalExam(exam = {}) {
  if (!exam) return '';
  const labels = [
    ['Ectoscopia', exam.ecto],
    ['Neurológico', exam.neuro],
    ['Cardiovascular', exam.cardio],
    ['Pulmonar', exam.pulmonar],
    ['Abdome', exam.abdome],
    ['Renal', exam.renal],
    ['Membros inferiores', exam.mmii]
  ];
  return labels.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n');
}

function escapeAttr(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function parseSimpleList(value, key = 'txt') {
  return splitLines(value).map(item => ({ [key]: item }));
}

function formatSimpleList(list, key = 'txt') {
  return (list || []).map(item => typeof item === 'string' ? item : item?.[key]).filter(Boolean).join('\n');
}

function parseTreatments(value) {
  return splitLines(value).map(line => {
    const [n = '', dose = '', freq = '', via = '', di = ''] = line.split('|').map(part => part.trim());
    return { n, dose, freq, via, di };
  }).filter(item => item.n);
}

function formatTreatments(list = []) {
  return list.map(item => {
    if (typeof item === 'string') return item;
    const pieces = [item.n, item.dose, item.freq, item.via, item.di].filter(Boolean);
    return pieces.join(' | ');
  }).filter(Boolean).join('\n');
}

function parsePending(value) {
  return splitLines(value).map(line => {
    const [txt = '', prazo = '', feita = ''] = line.split('|').map(part => part.trim());
    return { txt, prazo, feita: /^(sim|feito|feita|ok|true)$/i.test(feita) };
  }).filter(item => item.txt);
}

function formatPending(list = []) {
  return list.map(item => {
    if (typeof item === 'string') return item;
    return [item.txt, item.prazo, item.feita ? 'feito' : ''].filter(Boolean).join(' | ');
  }).filter(Boolean).join('\n');
}

function parseSpecialties(value) {
  return splitLines(value).map(line => {
    const [esp = '', motivo = '', status = ''] = line.split('|').map(part => part.trim());
    return { esp, motivo, status };
  }).filter(item => item.esp || item.motivo);
}

function formatSpecialties(list = []) {
  return list.map(item => {
    if (typeof item === 'string') return item;
    return [item.data, item.esp, item.medico || item.motivo || item.status].filter(Boolean).join(' | ');
  }).filter(Boolean).join('\n');
}

function parseDatedText(value) {
  return splitLines(value).map(line => {
    const parts = line.split(/\s+[—-]\s+/);
    if (parts.length > 1 && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(parts[0].trim())) {
      return { data: parts[0].trim(), txt: parts.slice(1).join(' — ').trim() };
    }
    return { data: new Date().toLocaleDateString('pt-BR'), txt: line };
  }).filter(item => item.txt);
}

function formatDatedText(list = []) {
  return list.map(item => {
    if (typeof item === 'string') return item;
    return item.data ? `${item.data} — ${item.txt || ''}`.trim() : item.txt;
  }).filter(Boolean).join('\n');
}

function openLightbox(src) {
  const lightbox = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = src;
  lightbox.hidden = false;
  lightbox.removeAttribute('hidden');
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.hidden = true;
  lightbox.setAttribute('hidden', '');
  document.getElementById('lightboxImg').src = '';
}
