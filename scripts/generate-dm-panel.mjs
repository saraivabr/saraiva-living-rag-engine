import fs from 'node:fs';

const inputPath = process.argv[2] || '/Users/saraiva/Downloads/social-selling-task-pack-saraiva-ai.json';
const outputPath = process.argv[3] || '/Users/saraiva/Downloads/painel-envio-dm-saraiva-ai.html';

const pack = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rows = (pack.rows || []).map((row) => ({
  priority: row.priority,
  username: row.username,
  handle: String(row.username || '').replace(/^@/, ''),
  senderId: row.senderId,
  score: row.score,
  stage: row.stage,
  temperature: row.temperature,
  offer: row.offer,
  promiseLabel: row.promiseLabel,
  reason: row.reason,
  nextAction: row.nextAction,
  taskId: row.taskId,
  personId: row.personId,
  opportunityId: row.opportunityId,
  instagramUrl: row.instagramUrl,
  dmUrl: row.username ? `https://ig.me/m/${String(row.username).replace(/^@/, '')}` : row.instagramUrl,
  postPermalink: row.postPermalink,
  suggestedMessage: row.suggestedMessage,
}));

const generatedAt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'medium',
}).format(new Date());

const payloadJson = JSON.stringify({ generatedAt, summary: pack.summary, rows }).replace(/</g, '\\u003c');

const html = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Painel de envio DM - @saraiva.ai</title>
  <style>
    :root { color-scheme: light; --ink:#111827; --muted:#667085; --line:#d9dee8; --bg:#f6f7f9; --panel:#ffffff; --accent:#0f766e; --hot:#b42318; --warn:#b54708; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); }
    header { position: sticky; top:0; z-index: 10; background:rgba(255,255,255,.96); border-bottom:1px solid var(--line); padding:14px 18px; }
    h1 { margin:0; font-size:20px; line-height:1.2; }
    .sub { color:var(--muted); font-size:13px; margin-top:4px; }
    .wrap { display:grid; grid-template-columns: 390px minmax(0,1fr); min-height: calc(100vh - 70px); }
    aside { border-right:1px solid var(--line); background:#fff; overflow:auto; max-height:calc(100vh - 70px); }
    main { padding:18px; overflow:auto; max-height:calc(100vh - 70px); }
    .controls { padding:12px; display:grid; gap:8px; border-bottom:1px solid var(--line); }
    input, select, textarea { width:100%; border:1px solid var(--line); border-radius:8px; padding:10px 11px; font:inherit; background:#fff; color:var(--ink); }
    textarea { min-height:190px; line-height:1.45; resize:vertical; }
    .lead-list { display:grid; }
    .lead { border:0; border-bottom:1px solid var(--line); text-align:left; background:#fff; padding:11px 12px; cursor:pointer; display:grid; gap:4px; color:var(--ink); }
    .lead:hover, .lead.active { background:#eef7f5; }
    .lead.done { opacity:.62; }
    .lead .top { display:flex; justify-content:space-between; gap:10px; font-weight:700; font-size:14px; }
    .lead .meta { color:var(--muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .pill { display:inline-flex; align-items:center; height:22px; border:1px solid var(--line); border-radius:999px; padding:0 8px; font-size:12px; color:var(--muted); background:#fff; }
    .grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; margin-bottom:14px; }
    .metric { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .metric b { display:block; font-size:22px; }
    .metric span { color:var(--muted); font-size:12px; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:14px; }
    .card h2 { margin:0 0 10px; font-size:18px; }
    .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .facts { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px; margin-top:10px; }
    .fact { border:1px solid var(--line); border-radius:8px; padding:10px; min-width:0; }
    .fact label { display:block; color:var(--muted); font-size:12px; margin-bottom:3px; }
    .fact div { font-size:13px; overflow-wrap:anywhere; }
    button, a.btn { border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); padding:9px 11px; font:inherit; text-decoration:none; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; min-height:38px; }
    button.primary, a.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
    button.warn { border-color:#fedf89; background:#fffaeb; color:var(--warn); }
    button.hot { border-color:#fecdca; background:#fff5f5; color:var(--hot); }
    .status { font-size:13px; color:var(--muted); min-height:18px; margin-top:8px; }
    .note { color:var(--muted); font-size:13px; line-height:1.45; }
    @media (max-width: 900px) { .wrap { grid-template-columns:1fr; } aside { max-height:420px; border-right:0; border-bottom:1px solid var(--line); } main { max-height:none; } .grid, .facts { grid-template-columns:1fr 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>Painel de envio DM - @saraiva.ai</h1>
    <div class="sub">Gerado em __GENERATED_AT__. Nada aqui envia mensagem automaticamente.</div>
  </header>
  <div class="wrap">
    <aside>
      <div class="controls">
        <input id="search" placeholder="Buscar lead, oferta ou taskId" />
        <select id="offerFilter"><option value="">Todas as ofertas</option></select>
        <select id="statusFilter"><option value="">Todos os status</option><option value="pending">Pendentes</option><option value="sent">Enviados</option><option value="replied">Responderam</option><option value="hot">Quentes</option><option value="skip">Pulados</option></select>
      </div>
      <div id="leadList" class="lead-list"></div>
    </aside>
    <main>
      <div class="grid">
        <div class="metric"><b id="mTotal">0</b><span>Total</span></div>
        <div class="metric"><b id="mPending">0</b><span>Pendentes</span></div>
        <div class="metric"><b id="mSent">0</b><span>Enviados</span></div>
        <div class="metric"><b id="mHot">0</b><span>Quentes</span></div>
      </div>
      <section class="card" id="detail"></section>
      <section class="card">
        <h2>Progresso</h2>
        <div class="row">
          <button id="exportJson">Exportar progresso JSON</button>
          <button id="exportCsv">Exportar progresso CSV</button>
          <button id="clearProgress" class="warn">Limpar progresso local</button>
        </div>
        <p class="note">O progresso fica salvo neste navegador via localStorage. Exporte no fim do bloco para registrar o dia.</p>
      </section>
    </main>
  </div>
  <script id="payload" type="application/json">__PAYLOAD__</script>
  <script>
    const data = JSON.parse(document.getElementById('payload').textContent);
    const rows = data.rows;
    const stateKey = 'saraiva-os-dm-sender-progress-v1';
    let progress = JSON.parse(localStorage.getItem(stateKey) || '{}');
    let activeId = rows[0] && rows[0].senderId;
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const statusOf = (row) => (progress[row.senderId] && progress[row.senderId].status) || 'pending';
    const noteOf = (row) => (progress[row.senderId] && progress[row.senderId].note) || '';
    const save = () => localStorage.setItem(stateKey, JSON.stringify(progress));

    function initFilters() {
      const offers = [...new Set(rows.map(row => row.offer || row.promiseLabel).filter(Boolean))].sort();
      for (const offer of offers) {
        const option = document.createElement('option');
        option.value = offer;
        option.textContent = offer;
        $('offerFilter').appendChild(option);
      }
      ['search','offerFilter','statusFilter'].forEach(id => $(id).addEventListener('input', renderList));
    }

    function filteredRows() {
      const q = $('search').value.trim().toLowerCase();
      const offer = $('offerFilter').value;
      const status = $('statusFilter').value;
      return rows.filter(row => {
        const hay = [row.username, row.senderId, row.offer, row.promiseLabel, row.taskId, row.reason].join(' ').toLowerCase();
        return (!q || hay.includes(q)) && (!offer || (row.offer || row.promiseLabel) === offer) && (!status || statusOf(row) === status);
      });
    }

    function renderList() {
      const list = $('leadList');
      list.innerHTML = '';
      for (const row of filteredRows()) {
        const button = document.createElement('button');
        button.className = 'lead' + (row.senderId === activeId ? ' active' : '') + (statusOf(row) !== 'pending' ? ' done' : '');
        button.innerHTML = '<div class="top"><span>' + escapeHtml(row.priority + '. ' + (row.username || row.senderId)) + '</span><span class="pill">' + escapeHtml(statusOf(row)) + '</span></div><div class="meta">' + escapeHtml(row.offer || row.promiseLabel) + '</div>';
        button.onclick = () => { activeId = row.senderId; render(); };
        list.appendChild(button);
      }
      renderMetrics();
    }

    function renderMetrics() {
      $('mTotal').textContent = rows.length;
      $('mPending').textContent = rows.filter(row => statusOf(row) === 'pending').length;
      $('mSent').textContent = rows.filter(row => statusOf(row) === 'sent').length;
      $('mHot').textContent = rows.filter(row => statusOf(row) === 'hot').length;
    }

    function renderDetail() {
      const row = rows.find(item => item.senderId === activeId) || rows[0];
      if (!row) { $('detail').innerHTML = '<p>Nenhum lead.</p>'; return; }
      $('detail').innerHTML = [
        '<div class="row" style="justify-content:space-between;margin-bottom:10px">',
        '<h2>' + escapeHtml(row.priority + '. ' + (row.username || row.senderId)) + '</h2>',
        '<span class="pill">' + escapeHtml(statusOf(row)) + '</span>',
        '</div>',
        '<div class="row" style="margin-bottom:10px">',
        '<a class="btn primary" href="' + escapeHtml(row.dmUrl) + '" target="_blank" rel="noreferrer">Abrir DM</a>',
        '<a class="btn" href="' + escapeHtml(row.instagramUrl) + '" target="_blank" rel="noreferrer">Abrir perfil</a>',
        row.postPermalink ? '<a class="btn" href="' + escapeHtml(row.postPermalink) + '" target="_blank" rel="noreferrer">Abrir post</a>' : '',
        '<button class="primary" id="copyMsg">Copiar mensagem</button>',
        '</div>',
        '<div class="facts">',
        '<div class="fact"><label>Oferta</label><div>' + escapeHtml(row.offer || row.promiseLabel) + '</div></div>',
        '<div class="fact"><label>Motivo</label><div>' + escapeHtml(row.reason) + '</div></div>',
        '<div class="fact"><label>Proxima acao</label><div>' + escapeHtml(row.nextAction) + '</div></div>',
        '</div>',
        '<h2 style="margin-top:16px">Mensagem exata para DM</h2>',
        '<textarea id="msgBox">' + escapeHtml(row.suggestedMessage) + '</textarea>',
        '<div class="row" style="margin-top:10px">',
        '<button id="markSent">Marcar enviado</button>',
        '<button id="markReplied">Marcar respondeu</button>',
        '<button id="markHot" class="hot">Marcar quente</button>',
        '<button id="markSkip" class="warn">Pular</button>',
        '</div>',
        '<div style="margin-top:10px"><textarea id="noteBox" placeholder="Nota rapida desse lead">' + escapeHtml(noteOf(row)) + '</textarea></div>',
        '<div class="status" id="copyStatus"></div>',
        '<div class="note" style="margin-top:12px">Regra: se responder com preco, implementacao, prazo ou negocio real, assumir humano e registrar no acompanhamento interno.</div>',
      ].join('');
      $('copyMsg').onclick = async () => {
        const text = $('msgBox').value;
        try {
          await navigator.clipboard.writeText(text);
          $('copyStatus').textContent = 'Mensagem copiada.';
        } catch {
          $('msgBox').select();
          document.execCommand('copy');
          $('copyStatus').textContent = 'Mensagem selecionada/copiada.';
        }
      };
      $('noteBox').oninput = () => {
        progress[row.senderId] = { ...(progress[row.senderId] || {}), status: statusOf(row), note: $('noteBox').value, updatedAt: new Date().toISOString() };
        save();
      };
      $('markSent').onclick = () => setStatus(row, 'sent');
      $('markReplied').onclick = () => setStatus(row, 'replied');
      $('markHot').onclick = () => setStatus(row, 'hot');
      $('markSkip').onclick = () => setStatus(row, 'skip');
    }

    function setStatus(row, status) {
      progress[row.senderId] = { ...(progress[row.senderId] || {}), status, note: $('noteBox') ? $('noteBox').value : noteOf(row), updatedAt: new Date().toISOString() };
      save();
      render();
    }

    function download(name, text, type) {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }

    function exportRows() {
      return rows.map(row => ({ ...row, progress: progress[row.senderId] || { status: 'pending' } }));
    }

    $('exportJson').onclick = () => download('progresso-dm-saraiva-ai.json', JSON.stringify({ exportedAt: new Date().toISOString(), rows: exportRows() }, null, 2), 'application/json');
    $('exportCsv').onclick = () => {
      const cols = ['priority','username','offer','taskId','instagramUrl','status','note','updatedAt'];
      const lines = [cols.join(',')].concat(exportRows().map(row => cols.map(col => {
        const value = col in row ? row[col] : row.progress && row.progress[col];
        return '"' + String(value || '').replace(/"/g, '""') + '"';
      }).join(',')));
      download('progresso-dm-saraiva-ai.csv', lines.join('\n') + '\n', 'text/csv');
    };
    $('clearProgress').onclick = () => {
      if (confirm('Limpar progresso local deste painel?')) { progress = {}; save(); render(); }
    };

    function render() { renderList(); renderDetail(); }
    initFilters();
    render();
  </script>
</body>
</html>`;

fs.writeFileSync(
  outputPath,
  html
    .replace('__GENERATED_AT__', generatedAt)
    .replace('__PAYLOAD__', payloadJson),
);

console.log(JSON.stringify({ outputPath, rows: rows.length, generatedAt }, null, 2));
