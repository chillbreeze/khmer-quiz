let allVocab = [];

async function loadVocab() {
  const res  = await fetch('/api/vocab?t=' + Date.now());
  allVocab   = await res.json();
  renderTable(allVocab);
  document.getElementById('vocabCount').textContent = `(${allVocab.length})`;
}

function renderTable(rows) {
  const tbody = document.getElementById('vocabBody');
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    tr.innerHTML = `
      <td>${row.id}</td>
      <td><input type="text" value="${esc(row.english)}" data-field="english" /></td>
      <td><input type="text" value="${esc(row.khmer)}"   data-field="khmer"   /></td>
      <td><input type="text" value="${esc(row.notes || '')}"  data-field="notes"   /></td>
      <td><input type="text" value="${esc(row.category || 'general')}" data-field="category" /></td>
      <td><input type="checkbox" ${row.active ? 'checked' : ''} data-field="active" /></td>
      <td>
        <button class="btn-del" data-id="${row.id}">Del</button>
      </td>
    `;
    tr.querySelector('.btn-del').addEventListener('click', () => deleteRow(row.id));
    tbody.appendChild(tr);
  });
}

function esc(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function saveAll() {
  const rows = document.querySelectorAll('#vocabBody tr[data-id]');
  const requests = [];
  rows.forEach(tr => {
    const id = tr.dataset.id;
    const data = {
      english:  tr.querySelector('[data-field="english"]').value,
      khmer:    tr.querySelector('[data-field="khmer"]').value,
      notes:    tr.querySelector('[data-field="notes"]').value,
      category: tr.querySelector('[data-field="category"]').value,
      active:   tr.querySelector('[data-field="active"]').checked,
    };
    requests.push(
      fetch(`/api/vocab/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
    );
  });

  await Promise.all(requests);

  // Flash all rows green briefly
  rows.forEach(tr => tr.style.background = 'rgba(76,175,125,0.12)');
  setTimeout(() => rows.forEach(tr => tr.style.background = ''), 800);
}

async function deleteRow(id) {
  if (!confirm('Delete this word?')) return;
  await fetch(`/api/vocab/${id}`, { method: 'DELETE' });
  await loadVocab();
}

// Add new word
document.getElementById('btnAdd').addEventListener('click', async () => {
  const english  = document.getElementById('newEnglish').value.trim();
  const khmer    = document.getElementById('newKhmer').value.trim();
  const notes    = document.getElementById('newNotes').value.trim();
  const category = document.getElementById('newCategory').value.trim() || 'general';
  if (!english || !khmer) { alert('English and Khmer fields are required.'); return; }

  await fetch('/api/vocab', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ english, khmer, notes, category }),
  });

  ['newEnglish','newKhmer','newNotes','newCategory'].forEach(id => document.getElementById(id).value = '');
  await loadVocab();
});

// Save all
document.getElementById('btnSaveAll').addEventListener('click', saveAll);

// Filter
document.getElementById('filterInput').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderTable(allVocab.filter(r =>
    r.english.toLowerCase().includes(q) ||
    r.khmer.toLowerCase().includes(q) ||
    (r.notes || '').toLowerCase().includes(q) ||
    (r.category || '').toLowerCase().includes(q)
  ));
});

loadVocab();
