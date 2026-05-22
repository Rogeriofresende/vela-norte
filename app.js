/* =========================================================
   Vela — Wave 2 · Hash Router + State + Render
   Decisions: 0085 (desktop-only), 0086 (tokens), 0087 (nome único),
              0089 (zero retention server-side)
   ========================================================= */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const LS_PROJECTS = 'vela_projects';
const LS_CONVERSATIONS = 'vela_conversations'; // keyed by project slug

function loadProjects() {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '[]'); }
  catch { return []; }
}

function saveProjects(list) {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(list));
}

function loadConversations(slug) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_CONVERSATIONS) || '{}');
    return all[slug] || [];
  } catch { return []; }
}

function saveConversation(slug, conv) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_CONVERSATIONS) || '{}');
    if (!all[slug]) all[slug] = [];
    // replace or append
    const idx = all[slug].findIndex(c => c.id === conv.id);
    if (idx >= 0) all[slug][idx] = conv;
    else all[slug].push(conv);
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(all));
  } catch {}
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------
function toSlug(name) {
  return name.trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'projeto';
}

function uniqueSlug(name, existing) {
  let slug = toSlug(name);
  let counter = 2;
  const slugs = existing.map(p => p.slug);
  while (slugs.includes(slug)) {
    slug = toSlug(name) + '-' + counter;
    counter++;
  }
  return slug;
}

function relTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  return `${d}d atrás`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function parseRoute(hash) {
  const path = (hash || '').replace(/^#\/?/, '');
  if (!path || path === 'projetos') return { view: 'projetos' };
  const convMatch = path.match(/^projetos\/([^/]+)\/conversas\/([^/]+)$/);
  if (convMatch) return { view: 'conversa', slug: convMatch[1], convId: convMatch[2] };
  const projMatch = path.match(/^projetos\/([^/]+)$/);
  if (projMatch) return { view: 'projeto', slug: projMatch[1] };
  return { view: 'projetos' };
}

function navigate(hash) {
  window.location.hash = hash;
}

// ---------------------------------------------------------------------------
// SVG Icons inline (small, reused)
// ---------------------------------------------------------------------------
const ICON_FOLDER = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
  <path d="M1.5 3.5 C1.5 2.9 2 2.5 2.6 2.5 H5.5 L6.5 3.5 H11.4 C12 3.5 12.5 4 12.5 4.6 V10.5 C12.5 11.1 12 11.5 11.4 11.5 H2.6 C2 11.5 1.5 11.1 1.5 10.5 Z" stroke="currentColor" stroke-width="1.2"/>
</svg>`;

const ICON_CHAT = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
  <rect x="1.5" y="1.5" width="11" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/>
  <path d="M4 12.5 L5 10.5 H9 L10 12.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_PLUS = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
  <path d="M7 2 V12 M2 7 H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_CLOSE = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_VELA = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M10 2 L17 16 H3 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
</svg>`;

// ---------------------------------------------------------------------------
// Modal "Criar Projeto"
// ---------------------------------------------------------------------------
let _modalOpen = false;
let _modalProjectSlug = null; // set when creating from project view

function openCreateModal(prefillSlug) {
  _modalOpen = true;
  _modalProjectSlug = prefillSlug || null;
  const backdrop = document.getElementById('create-project-modal');
  backdrop.classList.remove('modal-backdrop--hidden');
  const input = document.getElementById('modal-project-name-input');
  input.value = '';
  input.focus();
  clearModalError();
}

function closeCreateModal() {
  _modalOpen = false;
  const backdrop = document.getElementById('create-project-modal');
  backdrop.classList.add('modal-backdrop--hidden');
  clearModalError();
}

function clearModalError() {
  const err = document.getElementById('modal-name-error');
  const input = document.getElementById('modal-project-name-input');
  if (err) err.textContent = '';
  if (input) input.classList.remove('input--error');
}

function submitCreateProject() {
  const input = document.getElementById('modal-project-name-input');
  const name = input.value.trim();
  const err = document.getElementById('modal-name-error');

  if (!name) {
    err.textContent = 'O nome do projeto não pode estar vazio.';
    input.classList.add('input--error');
    input.focus();
    return;
  }

  const projects = loadProjects();

  // Check duplicates (case-insensitive)
  const dup = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (dup) {
    err.textContent = 'Já existe um projeto com esse nome.';
    input.classList.add('input--error');
    input.focus();
    return;
  }

  const slug = uniqueSlug(name, projects);
  const project = { id: slug, slug, name, createdAt: Date.now(), lastActivity: Date.now() };
  projects.push(project);
  saveProjects(projects);

  closeCreateModal();
  navigate(`#/projetos/${slug}`);
}

// ---------------------------------------------------------------------------
// Shared Sidebar HTML (projects list)
// ---------------------------------------------------------------------------
function renderSidebarProjects(activeSlug) {
  const projects = loadProjects();

  const projectItems = projects.length === 0
    ? `<span style="display:block;padding:var(--space-2) var(--space-4);font-size:var(--text-xs);color:var(--color-text-muted);">Nenhum projeto</span>`
    : projects.map(p => {
        const isActive = p.slug === activeSlug;
        const convs = loadConversations(p.slug);
        return `<a href="#/projetos/${p.slug}" class="sidebar__item${isActive ? ' sidebar__item--active' : ''}" ${isActive ? 'aria-current="page"' : ''}>
          <span class="sidebar__item-icon">${ICON_FOLDER}</span>
          <span class="sidebar__item-label">${escHtml(p.name)}</span>
          ${convs.length > 0 ? `<span class="sidebar__item-badge">${convs.length}</span>` : ''}
        </a>`;
      }).join('');

  return `
    <nav class="layout-sidebar sidebar" aria-label="Projetos" id="main-sidebar">
      <div class="sidebar__inner">
        <div class="sidebar__section">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 var(--space-4) var(--space-1);">
            <p class="sidebar__section-title" style="margin:0;">Projetos</p>
            <button class="btn btn--ghost btn--sm" type="button" id="sidebar-new-project-btn" title="Novo projeto"
              style="padding:var(--space-1);min-width:unset;height:24px;width:24px;display:flex;align-items:center;justify-content:center;">
              ${ICON_PLUS}
            </button>
          </div>
          ${projectItems}
        </div>
      </div>
      <div class="sidebar__footer">
        <a href="#/projetos" class="sidebar__item">
          <span class="sidebar__item-icon">${ICON_FOLDER}</span>
          <span class="sidebar__item-label">Todos os projetos</span>
        </a>
      </div>
    </nav>`;
}

// ---------------------------------------------------------------------------
// T2.1 — Meus Projetos
// ---------------------------------------------------------------------------
function renderProjetos() {
  const projects = loadProjects();

  const emptyState = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-16) var(--space-6);text-align:center;gap:var(--space-4);">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" style="opacity:0.3;">
        <rect x="8" y="16" width="48" height="36" rx="4" stroke="var(--color-text-muted)" stroke-width="2"/>
        <path d="M8 24 H56" stroke="var(--color-text-muted)" stroke-width="2"/>
        <path d="M20 16 V12 C20 10.9 20.9 10 22 10 H42 C43.1 10 44 10.9 44 12 V16" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round"/>
        <path d="M24 36 H40 M24 42 H34" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div>
        <p style="font-size:var(--text-base);font-weight:var(--fw-medium);color:var(--color-text-primary);margin-bottom:var(--space-2);">Nenhum projeto ainda</p>
        <p style="font-size:var(--text-sm);color:var(--color-text-secondary);">Crie seu primeiro projeto para começar.</p>
      </div>
      <button class="btn btn--primary" type="button" id="empty-new-project-btn">
        ${ICON_PLUS}
        Novo projeto
      </button>
    </div>`;

  const grid = projects.length === 0 ? emptyState : `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-4);">
      ${projects.map(p => {
        const convs = loadConversations(p.slug);
        return `<div class="card card--clickable" data-slug="${p.slug}" role="button" tabindex="0" style="cursor:pointer;">
          <div class="card__header">
            <span class="card__title">${escHtml(p.name)}</span>
          </div>
          <div class="card__body" style="font-size:var(--text-sm);color:var(--color-text-secondary);">
            <span>${relTime(p.lastActivity)}</span>
          </div>
          <div class="card__footer">
            <span style="font-size:var(--text-xs);color:var(--color-text-muted);">
              ${convs.length} conversa${convs.length !== 1 ? 's' : ''}
            </span>
            <button class="btn btn--primary btn--sm open-project-btn" type="button" data-slug="${p.slug}">Abrir</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const sidebar = renderSidebarProjects(null);

  document.getElementById('app').innerHTML = `
    ${sidebar}
    <header class="layout-header header">
      <a href="#/projetos" class="header__logo">
        ${ICON_VELA}
        <span class="header__wordmark">Vela</span>
      </a>
      <span class="header__title">Meus Projetos</span>
      <div class="header__actions">
        <button class="btn btn--primary btn--sm header__btn--primary" type="button" id="header-new-project-btn">
          ${ICON_PLUS}
          Novo projeto
        </button>
        <div class="header__avatar" role="button" tabindex="0" aria-label="Minha conta">RR</div>
      </div>
    </header>
    <main class="layout-content" style="padding:var(--space-6);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6);">
        <h1 style="font-size:var(--text-xl);font-weight:var(--fw-semibold);">Meus Projetos</h1>
        ${projects.length > 0 ? `<button class="btn btn--primary" type="button" id="content-new-project-btn">${ICON_PLUS} Novo projeto</button>` : ''}
      </div>
      ${grid}
    </main>`;

  // Wire events
  document.querySelectorAll('[id$="-new-project-btn"], #empty-new-project-btn').forEach(btn => {
    btn.addEventListener('click', () => openCreateModal());
  });
  document.querySelectorAll('.card--clickable[data-slug]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.open-project-btn')) return; // handled below
      navigate(`#/projetos/${card.dataset.slug}`);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(`#/projetos/${card.dataset.slug}`);
    });
  });
  document.querySelectorAll('.open-project-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(`#/projetos/${btn.dataset.slug}`));
  });
  document.getElementById('sidebar-new-project-btn')?.addEventListener('click', () => openCreateModal());
}

// ---------------------------------------------------------------------------
// T2.3 — Dentro Projeto / Conversa
// ---------------------------------------------------------------------------
let _chatMessages = {}; // in-memory only, per convId — Decision 0089

function renderConversa(slug, convId) {
  const projects = loadProjects();
  const project = projects.find(p => p.slug === slug);
  if (!project) { navigate('#/projetos'); return; }

  const convs = loadConversations(slug);
  let conv = convs.find(c => c.id === convId);
  if (!conv) {
    conv = { id: convId, title: 'Nova conversa', createdAt: Date.now(), ts: Date.now() };
    saveConversation(slug, conv);
    updateProjectActivity(slug);
  }

  if (!_chatMessages[convId]) _chatMessages[convId] = [];

  const convListItems = convs.map(c => {
    const isActive = c.id === convId;
    return `<a href="#/projetos/${slug}/conversas/${c.id}" class="sidebar__item${isActive ? ' sidebar__item--active' : ''}" ${isActive ? 'aria-current="page"' : ''}>
      <span class="sidebar__item-icon">${ICON_CHAT}</span>
      <span class="sidebar__item-label">${escHtml(c.title)}</span>
    </a>`;
  }).join('');

  const msgs = _chatMessages[convId];
  const messagesHtml = msgs.length === 0
    ? `<div id="chat-empty" style="flex:1;display:flex;align-items:center;justify-content:center;">
        <p style="font-size:var(--text-sm);color:var(--color-text-muted);">Envie uma mensagem para começar.</p>
       </div>`
    : `<div id="chat-messages" style="flex:1;overflow-y:auto;padding:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4);">
        ${msgs.map(m => renderMessage(m)).join('')}
       </div>`;

  // 3-column layout override — inline styles (Decision 0086: usar tokens, não inventar classes)
  document.getElementById('app').innerHTML = `
    <nav style="position:fixed;left:0;top:var(--header-height);bottom:0;width:200px;background:var(--color-bg-deep);border-right:1px solid var(--color-border-subtle);overflow-y:auto;display:flex;flex-direction:column;z-index:var(--z-sidebar);" aria-label="Projetos" id="proj-sidebar">
      <div style="padding:var(--space-3) 0;flex:1;">
        <div style="padding:var(--space-1) var(--space-3) var(--space-2);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:var(--text-xs);font-weight:var(--fw-semibold);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Projetos</span>
          <button class="btn btn--ghost btn--sm" type="button" id="proj-sidebar-new-btn" title="Novo projeto"
            style="padding:2px;min-width:unset;height:22px;width:22px;display:flex;align-items:center;justify-content:center;">
            ${ICON_PLUS}
          </button>
        </div>
        ${projects.map(p => {
          const isActive = p.slug === slug;
          return `<a href="#/projetos/${p.slug}" class="sidebar__item${isActive ? ' sidebar__item--active' : ''}" style="padding-left:var(--space-3);" ${isActive ? 'aria-current="page"' : ''}>
            <span class="sidebar__item-icon">${ICON_FOLDER}</span>
            <span class="sidebar__item-label" style="font-size:var(--text-sm);">${escHtml(p.name)}</span>
          </a>`;
        }).join('')}
      </div>
    </nav>

    <nav style="position:fixed;left:200px;top:var(--header-height);bottom:0;width:var(--sidebar-width);background:var(--color-bg-elev);border-right:1px solid var(--color-border-subtle);overflow-y:auto;display:flex;flex-direction:column;z-index:var(--z-sidebar);" aria-label="Conversas" id="conv-sidebar">
      <div style="padding:var(--space-3) var(--space-3) var(--space-2);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--color-border-subtle);">
        <span style="font-size:var(--text-xs);font-weight:var(--fw-semibold);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">${escHtml(project.name)}</span>
        <button class="btn btn--ghost btn--sm" type="button" id="new-conv-btn" title="Nova conversa"
          style="padding:2px;min-width:unset;height:22px;width:22px;display:flex;align-items:center;justify-content:center;">
          ${ICON_PLUS}
        </button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:var(--space-2) 0;">
        ${convListItems || `<span style="display:block;padding:var(--space-3);font-size:var(--text-xs);color:var(--color-text-muted);">Nenhuma conversa</span>`}
      </div>
    </nav>

    <header class="layout-header header" style="padding-left:calc(200px + var(--sidebar-width) + var(--space-4));">
      <a href="#/projetos" class="header__logo">
        ${ICON_VELA}
        <span class="header__wordmark">Vela</span>
      </a>
      <span class="header__title">${escHtml(project.name)}</span>
      <div class="header__actions">
        <button class="btn btn--ghost btn--sm" type="button" id="clear-conv-btn" title="Apagar conversa" style="font-size:var(--text-xs);color:var(--color-text-muted);">Apagar conversa</button>
        <div class="header__avatar" role="button" tabindex="0" aria-label="Minha conta">RR</div>
      </div>
    </header>

    <main id="chat-area" style="margin-left:calc(200px + var(--sidebar-width));margin-top:var(--header-height);height:calc(100vh - var(--header-height));display:flex;flex-direction:column;max-width:calc(var(--content-max-width) - 200px - var(--sidebar-width));position:relative;">
      ${messagesHtml}
      <div id="chat-input-area" style="padding:var(--space-4) var(--space-6);border-top:1px solid var(--color-border-subtle);background:var(--color-bg);display:flex;align-items:flex-end;gap:var(--space-3);">
        <textarea id="chat-input" class="input input--textarea"
          placeholder="Escreva uma mensagem… (Enter para enviar, Shift+Enter para nova linha)"
          style="flex:1;min-height:44px;max-height:200px;resize:none;line-height:1.5;padding:var(--space-2) var(--space-3);"
          rows="1"></textarea>
        <button class="btn btn--primary" type="button" id="chat-send-btn">Enviar</button>
      </div>
    </main>`;

  // Wire chat
  const textarea = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }
  textarea.addEventListener('input', autoGrow);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  sendBtn.addEventListener('click', sendMessage);

  document.getElementById('new-conv-btn')?.addEventListener('click', () => createNewConversation(slug));
  document.getElementById('proj-sidebar-new-btn')?.addEventListener('click', () => openCreateModal(slug));

  // Apagar conversa: limpa mensagens em memória e re-renderiza
  document.getElementById('clear-conv-btn')?.addEventListener('click', () => {
    if (!confirm('Apagar todas as mensagens desta conversa?')) return;
    _chatMessages[convId] = [];
    renderConversa(slug, convId);
  });

  let _sending = false;

  function sendMessage() {
    if (_sending) return;
    const text = textarea.value.trim();
    if (!text) return;

    const userMsg = { id: Date.now(), role: 'user', text, ts: Date.now() };
    _chatMessages[convId] = _chatMessages[convId] || [];
    _chatMessages[convId].push(userMsg);
    appendMessage(userMsg);
    textarea.value = '';
    textarea.style.height = 'auto';

    // Update conv title from first message
    const freshConvs = loadConversations(slug);
    const c = freshConvs.find(cc => cc.id === convId);
    if (c && c.title === 'Nova conversa') {
      c.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      c.ts = Date.now();
      saveConversation(slug, c);
    }
    updateProjectActivity(slug);

    // Claude API real via SSE — Decision 0089: no content logged server-side
    callChatApiSSE(slug, convId, text);
  }
}

function appendMessage(msg) {
  let container = document.getElementById('chat-messages');
  if (!container) {
    // Replace empty state
    const area = document.getElementById('chat-area');
    const empty = document.getElementById('chat-empty');
    if (empty) empty.remove();
    container = document.createElement('div');
    container.id = 'chat-messages';
    container.style.cssText = 'flex:1;overflow-y:auto;padding:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4);';
    const inputArea = document.getElementById('chat-input-area');
    area.insertBefore(container, inputArea);
  }
  const el = document.createElement('div');
  el.innerHTML = renderMessage(msg);
  container.appendChild(el.firstElementChild);
  container.scrollTop = container.scrollHeight;
}

function renderMessage(msg) {
  const isUser = msg.role === 'user';
  const align = isUser ? 'flex-end' : 'flex-start';
  const bg = isUser ? 'var(--color-accent-gold)' : 'var(--color-bg-surface)';
  const color = isUser ? '#0A0A0F' : 'var(--color-text-primary)';
  const label = isUser ? 'Você' : 'Vela';
  return `<div data-msg-id="${msg.id}" style="display:flex;flex-direction:column;align-items:${align};gap:4px;max-width:72%;">
    <span style="font-size:var(--text-xs);color:var(--color-text-muted);padding:0 var(--space-2);">${label}</span>
    <div style="background:${bg};color:${color};padding:var(--space-3) var(--space-4);border-radius:12px;font-size:var(--text-sm);line-height:1.6;white-space:pre-wrap;word-break:break-word;" data-msg-text>${escHtml(msg.text)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Claude API real — SSE streaming (Wave 3)
// Decision 0089: history fica só em memória client-side, nunca persiste server
// ---------------------------------------------------------------------------
function _resolveProjectId(slug) {
  // Mapeamento slug → project_id para system prompt correto
  // Slugs criados pelo usuário podem ter qualquer nome —
  // procura palavras-chave no slug para rotear para competência certa
  const s = (slug || '').toLowerCase();
  if (s.includes('ada') || s.includes('ops') || s.includes('infra') || s.includes('eng')) return 'ada';
  if (s.includes('leo') || s.includes('copy') || s.includes('growth') || s.includes('conteud')) return 'leo';
  if (s.includes('max') || s.includes('pmo') || s.includes('sprint') || s.includes('product')) return 'max';
  if (s.includes('val') || s.includes('qa') || s.includes('qualidade') || s.includes('metrica')) return 'val';
  return 'default-norte';
}

function callChatApiSSE(slug, convId, text) {
  // Disable send while streaming
  const sendBtn = document.getElementById('chat-send-btn');
  const textarea = document.getElementById('chat-input');
  if (sendBtn) sendBtn.disabled = true;
  if (textarea) textarea.disabled = true;

  // Build history (last 20 msgs, excluding the one just added)
  const history = (_chatMessages[convId] || []).slice(-21, -1); // exclude last (just pushed user msg)
  const project_id = _resolveProjectId(slug);

  // Create streaming assistant bubble
  const assistantId = Date.now() + 1;
  const assistantMsg = { id: assistantId, role: 'assistant', text: '', ts: Date.now() };
  _chatMessages[convId].push(assistantMsg);
  appendMessage(assistantMsg);

  // Find the bubble DOM element for progressive update
  let container = document.getElementById('chat-messages');
  const bubbles = container ? container.querySelectorAll('[data-msg-id]') : [];
  const bubble = bubbles[bubbles.length - 1];
  const textNode = bubble ? bubble.querySelector('[data-msg-text]') : null;

  let accumulated = '';

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      history_last_n: history.map(m => ({ role: m.role, text: m.text })),
      project_id,
      conversation_id: convId,
    }),
  })
    .then(async resp => {
      if (resp.status === 429) {
        const data = await resp.json().catch(() => ({}));
        _finishStream(convId, assistantId, data.error || 'Limite atingido. Tente amanhã.', textNode, sendBtn, textarea);
        return;
      }
      if (!resp.ok) {
        _finishStream(convId, assistantId, 'Erro ao conectar. Tente novamente.', textNode, sendBtn, textarea);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      async function read() {
        const { done, value } = await reader.read();
        if (done) {
          _finishStream(convId, assistantId, accumulated || '…', textNode, sendBtn, textarea);
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event: chunk')) continue;
          if (line.startsWith('event: done')) {
            _finishStream(convId, assistantId, accumulated, textNode, sendBtn, textarea);
            return;
          }
          if (line.startsWith('event: error')) continue;
          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6));
              accumulated += chunk;
              if (textNode) textNode.textContent = accumulated;
              // scroll
              if (container) container.scrollTop = container.scrollHeight;
            } catch {}
          }
        }
        read();
      }
      read();
    })
    .catch(() => {
      _finishStream(convId, assistantId, 'Sem conexão. Verifique sua internet.', textNode, sendBtn, textarea);
    });
}

function _finishStream(convId, assistantId, finalText, textNode, sendBtn, textarea) {
  // Update in-memory history with final text
  const msgs = _chatMessages[convId] || [];
  const msg = msgs.find(m => m.id === assistantId);
  if (msg) msg.text = finalText;
  if (textNode && textNode.textContent !== finalText) textNode.textContent = finalText;
  // Re-enable input
  if (sendBtn) sendBtn.disabled = false;
  if (textarea) { textarea.disabled = false; textarea.focus(); }
}

function createNewConversation(slug) {
  const convId = `conv-${Date.now()}`;
  const conv = { id: convId, title: 'Nova conversa', createdAt: Date.now(), ts: Date.now() };
  saveConversation(slug, conv);
  updateProjectActivity(slug);
  navigate(`#/projetos/${slug}/conversas/${convId}`);
}

function updateProjectActivity(slug) {
  const projects = loadProjects();
  const p = projects.find(pr => pr.slug === slug);
  if (p) { p.lastActivity = Date.now(); saveProjects(projects); }
}

// T2.2 redirect — "dentro projeto" sem conv abre ou cria uma
function renderProjetoDentro(slug) {
  const projects = loadProjects();
  const project = projects.find(p => p.slug === slug);
  if (!project) { navigate('#/projetos'); return; }

  const convs = loadConversations(slug);
  if (convs.length > 0) {
    navigate(`#/projetos/${slug}/conversas/${convs[convs.length - 1].id}`);
  } else {
    const convId = `conv-${Date.now()}`;
    const conv = { id: convId, title: 'Nova conversa', createdAt: Date.now(), ts: Date.now() };
    saveConversation(slug, conv);
    updateProjectActivity(slug);
    navigate(`#/projetos/${slug}/conversas/${convId}`);
  }
}

// ---------------------------------------------------------------------------
// Modal HTML (injected once into body)
// ---------------------------------------------------------------------------
function injectModal() {
  if (document.getElementById('create-project-modal')) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div class="modal-backdrop modal-backdrop--hidden" id="create-project-modal" role="dialog" aria-modal="true" aria-labelledby="modal-create-title">
      <div class="modal" style="width:480px;" role="document">
        <div class="modal__header">
          <h2 class="modal__title" id="modal-create-title">Criar projeto</h2>
          <button class="modal__close" type="button" id="modal-close-btn" aria-label="Fechar">${ICON_CLOSE}</button>
        </div>
        <div class="modal__body">
          <div class="input-group">
            <label class="input-label" for="modal-project-name-input">Nome do projeto</label>
            <input class="input" id="modal-project-name-input" type="text" placeholder="Ex: Meu novo projeto" maxlength="80" autocomplete="off" />
            <span class="input-error-msg" id="modal-name-error" role="alert"></span>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary" type="button" id="modal-cancel-btn">Cancelar</button>
          <button class="btn btn--primary" type="button" id="modal-submit-btn">Criar projeto</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(tpl.firstElementChild);

  document.getElementById('modal-close-btn').addEventListener('click', closeCreateModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeCreateModal);
  document.getElementById('modal-submit-btn').addEventListener('click', submitCreateProject);
  document.getElementById('create-project-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreateModal();
  });
  document.getElementById('modal-project-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCreateProject();
    if (e.key === 'Escape') closeCreateModal();
  });
}

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------
function render() {
  const route = parseRoute(window.location.hash);
  switch (route.view) {
    case 'projetos':
      renderProjetos();
      break;
    case 'projeto':
      renderProjetoDentro(route.slug);
      break;
    case 'conversa':
      renderConversa(route.slug, route.convId);
      break;
    default:
      renderProjetos();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  injectModal();
  render();
  window.addEventListener('hashchange', render);

  // Default route
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#/projetos';
  }
});
