const resultsCard = document.getElementById('results-card');
const patientInfoCard = document.getElementById('patient-info-card');
const pageTitle = document.getElementById('page-title');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function checkSession() {
  const res = await fetch('/api/auth/session');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

function renderPatientInfo(data) {
  // dob/age/patientId are all best-effort, extracted from the PDFs' own text
  // rather than the filename — any of them can be missing, so only show the
  // fields we actually have rather than displaying blanks or "N/A".
  const fields = [
    { label: 'Name', value: data.patientName },
    { label: 'Patient ID', value: data.patientId },
    { label: 'Age', value: data.age },
    { label: 'Date of Birth', value: data.dob },
  ].filter((f) => f.value);

  if (fields.length === 0) {
    patientInfoCard.style.display = 'none';
    return;
  }

  patientInfoCard.innerHTML = `
    <div class="patient-info-grid">
      ${fields
        .map(
          (f) => `
        <div class="patient-info-field">
          <div class="patient-info-label">${escapeHtml(f.label)}</div>
          <div class="patient-info-value">${escapeHtml(f.value)}</div>
        </div>`
        )
        .join('')}
    </div>`;
  patientInfoCard.style.display = 'block';
}

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

async function loadResults() {
  const res = await fetch('/api/results');
  if (res.status === 401) {
    window.location.href = '/index.html';
    return;
  }
  const data = await res.json();

  if (data.patientName) {
    pageTitle.textContent = `Lab Results — ${data.patientName}`;
  }
  renderPatientInfo(data);

  if (!data.results || data.results.length === 0) {
    resultsCard.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 2h6v4H9z" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 6h8l1.5 12a2 2 0 0 1-2 2.2H8.5a2 2 0 0 1-2-2.2L8 6z" stroke="currentColor" stroke-width="1.4"/>
        </svg>
        No lab results found yet. Check back after your sample has been processed.
      </div>`;
    return;
  }

  const groups = groupByCategory(data.results);
  const categoryOrder = Object.keys(groups).sort();

  const viewIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>`;

  let html = `
    <div class="summary-bar">
      <div class="summary-count">${data.results.length} result${data.results.length === 1 ? '' : 's'} on file</div>
    </div>`;
  for (const category of categoryOrder) {
    const items = groups[category];
    html += `<div class="category-group"><h3>${escapeHtml(category)} <span class="count-badge">${items.length}</span></h3>`;
    for (const item of items) {
      html += `
        <div class="result-row">
          <div class="meta">
            <div>${escapeHtml(item.fileName.replace(/\.pdf$/i, ''))}</div>
            <div class="date">${escapeHtml(item.date)} &middot; Case ${escapeHtml(item.caseNo)}</div>
          </div>
          <a class="view-btn" href="/api/results/file/${encodeURIComponent(item.token)}" target="_blank" rel="noopener">${viewIcon} View PDF</a>
        </div>`;
    }
    html += `</div>`;
  }
  resultsCard.innerHTML = html;
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/index.html';
});

(async () => {
  const loggedIn = await checkSession();
  if (loggedIn) await loadResults();
})();
