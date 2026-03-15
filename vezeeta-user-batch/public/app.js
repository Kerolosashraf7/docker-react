const state = {
  endpoint: '',
  passwordPolicy: '',
  defaultRole: '',
  isSendingAll: false,
  users: [],
  fileName: ''
};

const elements = {
  csvFileInput: document.getElementById('csvFileInput'),
  fileStatus: document.getElementById('fileStatus'),
  totalCount: document.getElementById('totalCount'),
  idleCount: document.getElementById('idleCount'),
  successCount: document.getElementById('successCount'),
  errorCount: document.getElementById('errorCount'),
  usersTableBody: document.getElementById('usersTableBody'),
  sendAllButton: document.getElementById('sendAllButton'),
  rowTemplate: document.getElementById('rowTemplate')
};

function randomInt(max) {
  const cryptoObject = window.crypto || window.msCrypto;
  const values = new Uint32Array(1);
  cryptoObject.getRandomValues(values);
  return values[0] % max;
}

function pickRandom(characterSet) {
  return characterSet[randomInt(characterSet.length)];
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return values;
}

function generateComplexPassword(length = 16) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()-_=+?';
  const all = `${upper}${lower}${digits}${symbols}`;
  const password = [pickRandom(upper), pickRandom(lower), pickRandom(digits), pickRandom(symbols)];

  while (password.length < length) {
    password.push(pickRandom(all));
  }

  return shuffle(password).join('');
}

function summarizeUsers() {
  return state.users.reduce(
    (summary, user) => {
      summary.total += 1;
      summary[user.status] += 1;
      return summary;
    },
    { total: 0, idle: 0, success: 0, error: 0, sending: 0 }
  );
}

function renderSummary() {
  const summary = summarizeUsers();
  elements.totalCount.textContent = summary.total;
  elements.idleCount.textContent = summary.idle;
  elements.successCount.textContent = summary.success;
  elements.errorCount.textContent = summary.error;
}

function renderEmptyState() {
  elements.usersTableBody.innerHTML = `
    <tr>
      <td colspan="6" class="empty-state">
        Upload a CSV file to preview users and start creating accounts.
      </td>
    </tr>
  `;
}

function updateUser(userId, updates) {
  state.users = state.users.map((user) => (user.id === userId ? { ...user, ...updates } : user));
  render();
}

function normalizeMessage(payload, response) {
  return payload.body
    ? typeof payload.body === 'string'
      ? payload.body
      : JSON.stringify(payload.body)
    : payload.error || `Request completed with status ${response.status}`;
}

async function sendUser(user) {
  updateUser(user.id, { status: 'sending', message: 'Submitting request...' });

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mail: user.mail,
        key: user.key,
        name: user.name,
        password: user.password
      })
    });

    const payload = await response.json();
    const message = normalizeMessage(payload, response);

    if (!response.ok || !payload.ok) {
      throw new Error(message);
    }

    updateUser(user.id, {
      status: 'success',
      message: '',
      password: payload.generatedPassword || user.password
    });
  } catch (error) {
    updateUser(user.id, {
      status: 'error',
      message: error.message || 'Request failed'
    });
  }
}

async function handleSendAll() {
  state.isSendingAll = true;
  render();

  for (const user of state.users) {
    if (user.status !== 'success') {
      await sendUser(user);
    }
  }

  state.isSendingAll = false;
  render();
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('The CSV file must include a header row and at least one data row.');
  }

  const headers = lines[0].split(',').map((value) => value.trim().toLowerCase());
  const requiredHeaders = ['mail', 'key', 'name'];

  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required column: ${header}`);
    }
  }

  return lines.slice(1).map((line, index) => {
    const columns = line.split(',').map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, columnIndex) => [header, columns[columnIndex] || '']));

    if (!row.mail || !row.key || !row.name) {
      throw new Error(`Row ${index + 2} is missing mail, key, or name.`);
    }

    return {
      id: `${row.mail}-${index}`,
      mail: row.mail,
      key: row.key,
      name: row.name,
      password: generateComplexPassword(),
      status: 'idle',
      message: 'Ready to submit'
    };
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the CSV file.'));
    reader.readAsText(file);
  });
}

async function handleFileUpload(event) {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  try {
    const text = await readFileAsText(file);
    state.users = parseCsv(text);
    state.fileName = file.name;
    state.isSendingAll = false;
    elements.fileStatus.textContent = `${file.name} loaded with ${state.users.length} user records. Passwords are ready.`;
    render();
  } catch (error) {
    state.users = [];
    state.fileName = '';
    elements.fileStatus.textContent = error.message;
    render();
  }
}

function renderRows() {
  if (!state.users.length) {
    renderEmptyState();
    return;
  }

  elements.usersTableBody.innerHTML = '';

  state.users.forEach((user) => {
    const fragment = elements.rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('tr');
    const nameCell = fragment.querySelector('.user-name');
    const mailCell = fragment.querySelector('.user-mail');
    const keyCell = fragment.querySelector('.user-key');
    const passwordCell = fragment.querySelector('.user-password');
    const statusPill = fragment.querySelector('.status-pill');
    const statusMessage = fragment.querySelector('.status-message');
    const actionButton = fragment.querySelector('.row-button');

    row.dataset.userId = user.id;
    nameCell.textContent = user.name;
    mailCell.textContent = user.mail;
    keyCell.textContent = user.key;
    passwordCell.textContent = user.password;
    statusPill.textContent = user.status;
    statusPill.className = `status-pill ${user.status}`;
    statusMessage.textContent = user.status === 'success' ? '' : user.message;
    actionButton.textContent = user.status === 'sending' ? 'Sending...' : 'Send';
    actionButton.disabled = state.isSendingAll || user.status === 'sending';
    actionButton.addEventListener('click', () => sendUser(user));

    elements.usersTableBody.appendChild(fragment);
  });
}

async function loadConfig() {
  const response = await fetch('/api/config');
  const payload = await response.json();
  state.endpoint = payload.endpoint;
  state.passwordPolicy = payload.passwordPolicy;
  state.defaultRole = payload.defaultRole;
}

function render() {
  elements.sendAllButton.textContent = state.isSendingAll ? 'Sending batch...' : 'Send all users';
  elements.sendAllButton.disabled = state.isSendingAll || state.users.length === 0;
  renderSummary();
  renderRows();
}

elements.csvFileInput.addEventListener('change', handleFileUpload);
elements.sendAllButton.addEventListener('click', handleSendAll);

loadConfig().finally(render);
