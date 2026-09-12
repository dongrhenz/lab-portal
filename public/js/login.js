const $ = (id) => document.getElementById(id);

let state = { caseNo: '', fullName: '' };

function showError(boxId, message) {
  const box = $(boxId);
  box.textContent = message;
  box.classList.add('show');
}
function clearError(boxId) {
  const box = $(boxId);
  box.textContent = '';
  box.classList.remove('show');
}

function showScreen(id) {
  ['screen-verify', 'screen-setup-pin', 'screen-pin-login'].forEach((s) => {
    $(s).style.display = s === id ? 'block' : 'none';
  });
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

$('btn-verify').addEventListener('click', async () => {
  clearError('verify-error');
  const caseNo = $('caseNo').value.trim();
  const fullName = $('fullName').value.trim();
  if (!caseNo || !fullName) {
    showError('verify-error', 'Please fill in both fields.');
    return;
  }

  $('btn-verify').disabled = true;
  const { ok, data } = await postJSON('/api/auth/verify', { caseNo, fullName });
  $('btn-verify').disabled = false;

  if (!ok) {
    showError('verify-error', data.error || 'Could not verify those details.');
    return;
  }

  state.caseNo = caseNo;
  state.fullName = fullName;

  if (data.status === 'needs_pin_setup') {
    $('welcome-name').textContent = `Welcome, ${data.nameOnFile}.`;
    showScreen('screen-setup-pin');
  } else {
    showScreen('screen-pin-login');
  }
});

$('btn-setup-pin').addEventListener('click', async () => {
  clearError('setup-error');
  const pin1 = $('pin1').value.trim();
  const pin2 = $('pin2').value.trim();

  if (!/^\d{4,8}$/.test(pin1)) {
    showError('setup-error', 'PIN must be 4-8 digits.');
    return;
  }
  if (pin1 !== pin2) {
    showError('setup-error', 'PINs do not match.');
    return;
  }

  $('btn-setup-pin').disabled = true;
  const { ok, data } = await postJSON('/api/auth/setup-pin', {
    caseNo: state.caseNo,
    fullName: state.fullName,
    pin: pin1,
  });
  $('btn-setup-pin').disabled = false;

  if (!ok) {
    showError('setup-error', data.error || 'Could not save PIN.');
    return;
  }
  window.location.href = '/dashboard.html';
});

$('btn-pin-login').addEventListener('click', async () => {
  clearError('pin-error');
  const pin = $('pinLogin').value.trim();
  if (!pin) {
    showError('pin-error', 'Enter your PIN.');
    return;
  }

  $('btn-pin-login').disabled = true;
  const { ok, data } = await postJSON('/api/auth/login', { caseNo: state.caseNo, pin });
  $('btn-pin-login').disabled = false;

  if (!ok) {
    showError('pin-error', data.error || 'Invalid PIN.');
    return;
  }
  window.location.href = '/dashboard.html';
});

$('btn-back').addEventListener('click', () => {
  clearError('pin-error');
  showScreen('screen-verify');
});
