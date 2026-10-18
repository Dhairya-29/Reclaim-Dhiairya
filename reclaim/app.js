'use strict';
/* Reclaim — Today · Discover · Companion · My Life (with Voicepal-style Journal). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
const wait = ms => new Promise(r => setTimeout(r, ms));

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  discover: svg('<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/>'),
  companion: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  life: svg('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>'),
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  playFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  pauseFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  more: svg('<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 3v4M17 5h4"/>'),
  pencil: svg('<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
  wave: svg('<path d="M3 12h1M7 8v8M11 5v14M15 8v8M19 10v4"/>'),
  bubbles: svg('<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2zM18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  send: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="2"/>'),
  settings: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  compass: svg('<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>'),
  leaf: svg('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5-6"/>')
};

/* ---------------- State ---------------- */
const KEY = 'reclaim.v1';
const fresh = () => ({
  onboarded: false,
  prefs: { name: '', interests: [], theme: 'system', apiUrl: '', presets: DEFAULT_PRESETS.map(p => ({ ...p })) },
  ui: { tab: 'today', lifeSeg: 'journal', filters: { time: 0, energy: 0, budget: 'any', setting: 'any', interest: 'any' }, page: 0, convoId: null, q: '' },
  moods: {}, today: { date: '', i: 0 },
  history: [], streams: [], memories: [], people: [], projects: [], convos: []
});
let S;
try { const d = JSON.parse(localStorage.getItem(KEY)); S = d ? { ...fresh(), ...d, prefs: { ...fresh().prefs, ...d.prefs }, ui: { ...fresh().ui, ...d.ui } } : fresh(); }
catch { S = fresh(); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch { toast('Storage is full — export your data from Settings.'); }
}

// Audio recordings live in IndexedDB (too big for localStorage).
const idb = (() => {
  let p;
  const db = () => p ||= new Promise((res, rej) => {
    const r = indexedDB.open('reclaim', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('audio');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('audio', mode); const q = fn(t.objectStore('audio'));
    t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error);
  }));
  return { put: (k, v) => tx('readwrite', s => s.put(v, k)), get: k => tx('readonly', s => s.get(k)), del: k => tx('readwrite', s => s.delete(k)), clear: () => tx('readwrite', s => s.clear()) };
})();

/* ---------------- Dates ---------------- */
const dayKey = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const rel = ts => { const d = Math.floor((new Date(dayKey()) - new Date(dayKey(ts))) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : fmtDate(ts); };

/* ---------------- Layers + Android back gesture ----------------
   Every screen, sheet and overlay pushes one history entry, so the
   system back gesture closes the top-most thing, like a native app. */
const layers = [];
const popWaiters = [];
function pushLayer(layer) { layers.push(layer); history.pushState({ n: layers.length }, ''); }
function popLayer() { return new Promise(res => { if (!layers.length) return res(); popWaiters.push(res); history.back(); }); }
addEventListener('popstate', () => { const l = layers.pop(); l?.close(); popWaiters.shift()?.(); });

const screens = [];
const scrolls = {};
const viewKey = () => { const t = screens.at(-1); return t ? `${t.name}:${t.params.id || ''}` : `tab:${S.ui.tab}`; };
function go(name, params = {}) {
  screens.push({ name, params });
  pushLayer({ close: () => { screens.pop(); paint('back'); } });
  paint('forward');
}
function paint(dir = 'none') {
  const fromKey = viewKey.last;
  const run = () => {
    if (fromKey) scrolls[fromKey] = scrollY;
    stopPlayer();
    $('#app').innerHTML = render();
    viewKey.last = viewKey();
    afterRender(dir);
  };
  if (dir !== 'none' && document.startViewTransition && !reduced) {
    document.documentElement.dataset.dir = dir;
    document.startViewTransition(run).ready.catch(() => {}); // rapid taps skip a transition; harmless
  } else run();
}
const refresh = () => {
  const keep = $$('[data-keep]').map(e => [e.dataset.keep, e.scrollLeft]);
  const y = scrollY; $('#app').innerHTML = render(); afterRender('none'); scrollTo(0, y);
  keep.forEach(([k, x]) => { const e = $(`[data-keep="${k}"]`); if (e) e.scrollLeft = x; });
};

function render() {
  const top = screens.at(-1);
  if (!S.onboarded) return V.onboarding();
  if (top) return (V[top.name] || V.missing)(top.params);
  return V[S.ui.tab]() + tabbar();
}

function afterRender(dir) {
  const key = viewKey();
  const stored = scrolls[key];
  if (stored != null && dir !== 'forward') scrollTo(0, stored);
  else if (key.startsWith('stream:') || key === 'tab:companion') scrollTo(0, document.body.scrollHeight);
  else scrollTo(0, 0);
  $$('.entry .text.clamp').forEach(t => { if (t.scrollHeight > t.clientHeight + 2) t.parentElement.querySelector('.more')?.classList.add('show'); });
}

const tabbar = () => `<nav class="tabbar" aria-label="Main">${[['today', 'Today'], ['discover', 'Discover'], ['companion', 'Companion'], ['life', 'My Life']].map(([t, l]) =>
  `<button class="tab" data-a="tab" data-v="${t}" ${S.ui.tab === t ? 'aria-current="page"' : ''}><span class="ind"></span>${I[t]}<span>${l}</span></button>`).join('')}</nav>`;

/* ---------------- Sheets, dialogs, toast ---------------- */
function sheet(html, { onMount, onClose, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="backdrop" data-a="closeSheet"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  $('#sheet-root').append(wrap);
  const el = wrap.querySelector('.sheet');
  pushLayer({ close: () => { $$('.sheet,.backdrop', wrap).forEach(n => n.classList.add('closing')); setTimeout(() => wrap.remove(), reduced ? 0 : 260); onClose?.(); } });
  dragToClose(el);
  onMount?.(el);
  return el;
}
function dragToClose(el) {
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => { if (el.scrollTop <= 0 && !e.target.closest('textarea,input')) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  el.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translate(-50%, ${dy}px)`; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchend', () => { if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 110) popLayer(); y0 = null; });
}
function ask(title, msg, ok = 'Confirm', danger = true) {
  return new Promise(res => {
    let v = false;
    sheet(`<h2>${esc(title)}</h2><p class="muted">${esc(msg)}</p><div class="stack"><button class="btn block ${danger ? 'dark' : 'primary'}" id="ok">${esc(ok)}</button><button class="btn block soft" data-a="closeSheet">Cancel</button></div>`,
      { onMount: s => { s.querySelector('#ok').onclick = () => { v = true; popLayer(); }; }, onClose: () => res(v) });
  });
}
function textSheet({ title, sub = '', value = '', placeholder = 'Write here…', ok = 'Save' }) {
  return new Promise(res => {
    let v = null;
    sheet(`<h2>${esc(title)}</h2>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}<textarea class="field" id="ts" placeholder="${esc(placeholder)}" style="margin:12px 0">${esc(value)}</textarea><button class="btn primary block" id="ok">${esc(ok)}</button>`, {
      onMount: s => { const t = s.querySelector('#ts'); setTimeout(() => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 320); s.querySelector('#ok').onclick = () => { v = t.value.trim(); popLayer(); }; },
      onClose: () => res(v)
    });
  });
}
let toastT;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Undo</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { undo(); t.classList.remove('show'); };
  t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2600);
}

/* ---------------- Recommendations ---------------- */
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
function score(a, mood) {
  let s = S.prefs.interests.includes(a.cat) ? 2 : 0;
  s -= S.history.filter(h => h.activityId === a.id && Date.now() - h.ts < 3 * 864e5).length * 3;
  if (mood === 'tired' || mood === 'low') s += a.energy === 1 ? 2 : -1;
  if (mood === 'restless') s += a.energy === 3 ? 3 : a.energy === 2 ? 1 : 0;
  if (mood === 'lonely') s += a.cat === 'social' ? 3 : 0;
  if (mood === 'calm' || mood === 'good') s += ['outdoors', 'creative', 'social'].includes(a.cat) ? 1 : 0;
  return s + (Math.abs(hash(a.id + dayKey())) % 100) / 100;
}
const ranked = (list, mood) => [...list].sort((a, b) => score(b, mood) - score(a, mood));
const actById = id => ACTIVITIES.find(a => a.id === id);
const activeRun = () => S.history.find(h => h.state === 'started');
function matches(a, f) {
  return (!f.time || a.dur <= f.time) && (!f.energy || a.energy <= f.energy) &&
    (f.budget === 'any' || a.cost <= (f.budget === 'free' ? 0 : 1)) &&
    (f.setting === 'any' || a.setting === f.setting || a.setting === 'either') &&
    (f.interest === 'any' || a.cat === f.interest);
}
const costLabel = c => ['Free', 'Low cost', 'Some cost'][c];
const energyLabel = e => ['', 'Low energy', 'Some energy', 'High energy'][e];
const metaPills = a => `<div class="meta"><span class="pill">${a.dur} min</span><span class="pill">${costLabel(a.cost)}</span><span class="pill">${energyLabel(a.energy)}</span><span class="pill">${a.setting === 'either' ? 'Indoor or out' : a.setting === 'indoor' ? 'Indoor' : 'Outdoor'}</span></div>`;
function whyFits(a) {
  const it = INTERESTS.find(([k]) => k === a.cat);
  return (S.prefs.interests.includes(a.cat) ? `You said you enjoy ${it[1].toLowerCase()}. ` : '') + a.why;
}
const todayMood = () => S.moods[dayKey()];
function todayPicks() {
  if (S.today.date !== dayKey()) { S.today = { date: dayKey(), i: 0 }; save(); }
  return ranked(ACTIVITIES, todayMood()).slice(0, 3);
}

/* ---------------- Views ---------------- */
const V = {};

V.onboarding = () => `<section class="page full rise" style="display:flex;flex-direction:column;justify-content:center;min-height:100dvh">
  <div class="splash-mark" style="border-color:var(--green);margin-bottom:28px"></div>
  <h1 class="serif" style="font-size:34px;line-height:1.15">Less empty scrolling.<br>More life worth remembering.</h1>
  <p class="muted">Reclaim gives you one good idea at a time, a companion to think with, and a private place for the moments that matter.</p>
  <div class="label">What should we call you?</div>
  <input class="field" id="obName" placeholder="Your first name" autocomplete="given-name" value="${esc(S.prefs.name)}">
  <div class="label">What do you enjoy? <span class="small">(pick any)</span></div>
  <div class="chips">${INTERESTS.map(([k, l]) => `<button class="chip" data-a="toggleInterest" data-v="${k}" aria-pressed="${S.prefs.interests.includes(k)}">${l}</button>`).join('')}</div>
  <button class="btn primary block" data-a="finishOnboarding" style="margin-top:28px">Begin</button>
  <p class="muted small" style="text-align:center">No feeds. No streaks. No notifications. Everything stays on this phone.</p>
</section>`;

V.today = () => {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const mood = todayMood();
  const picks = todayPicks();
  const a = picks[S.today.i] || picks[0];
  const run = activeRun();
  const runAct = run && actById(run.activityId);
  const md = dayKey().slice(5);
  const onThisDay = S.memories.find(m => m.date.slice(5) === md && m.date !== dayKey()) || S.memories[0];
  return `<section class="page rise">
    <div class="muted small">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    <h1 class="greet serif">${greet}${S.prefs.name ? `, ${esc(S.prefs.name)}` : ''}.</h1>
    <div style="margin:18px 0 22px">
      <div class="label" style="margin-top:0">How are you arriving? <span class="small">(optional)</span></div>
      <div class="chips scroll" data-keep="mood">${MOODS.map(([k, l]) => `<button class="chip" data-a="mood" data-v="${k}" aria-pressed="${mood === k}">${l}</button>`).join('')}</div>
    </div>
    ${runAct ? `<div class="card sage tap" data-a="activity" data-v="${runAct.id}"><div class="eyebrow">In progress</div><h3 class="serif" style="font-size:20px">${esc(runAct.title)}</h3><p class="muted small" style="margin:4px 0 0">Tap when you are done — or skip, no pressure.</p></div>` : ''}
    <div class="card hero">
      <div class="eyebrow">One idea for today${mood ? ' · for feeling ' + mood : ''}</div>
      <h2>${esc(a.title)}</h2>
      <p class="muted" style="margin:8px 0 0">${esc(whyFits(a))}</p>
      ${metaPills(a)}
      <div class="row" style="margin-top:16px"><button class="btn primary" data-a="activity" data-v="${a.id}">Let's do it</button><button class="btn ghost" data-a="anotherIdea">${S.today.i < 2 ? 'Another idea' : 'Back to first'}</button></div>
    </div>
    <div class="card tap" data-a="quickLine">
      <div class="eyebrow">Small next step</div>
      <div class="row"><div style="flex:1"><b>Write one line about today</b><div class="muted small">It goes to your private Journal.</div></div><span class="icon-btn">${I.pencil}</span></div>
    </div>
    <div class="card tap" data-a="pause">
      <div class="row"><div style="flex:1"><b>Reaching for your phone out of habit?</b><div class="muted small">Take a 40-second pause first.</div></div><span class="icon-btn">${I.leaf}</span></div>
    </div>
    ${onThisDay ? `<div class="card tap" data-a="viewMemory" data-v="${onThisDay.id}"><div class="eyebrow">${onThisDay.date.slice(5) === md ? 'On this day' : 'A memory'}</div><h3 class="serif" style="font-size:19px">${esc(onThisDay.title)}</h3><p class="muted small" style="margin:4px 0 0">${esc(fmtDate(onThisDay.date + 'T12:00'))}</p></div>` : ''}
    <p class="end-note">That is all for today. The rest is out there.</p>
  </section>`;
};

const FILTERS = [
  ['time', 'Time', [[0, 'Any time'], [15, '15 min'], [30, '30 min'], [60, '1 hour']]],
  ['energy', 'Energy', [[0, 'Any'], [1, 'Low'], [2, 'Medium'], [3, 'High']]],
  ['budget', 'Budget', [['any', 'Any'], ['free', 'Free'], ['low', 'Low cost']]],
  ['setting', 'Where', [['any', 'Anywhere'], ['indoor', 'Indoor'], ['outdoor', 'Outdoor']]],
  ['interest', 'Interest', [['any', 'All'], ...INTERESTS]]
];
V.discover = () => {
  const f = S.ui.filters;
  const list = ranked(ACTIVITIES.filter(a => matches(a, f)), todayMood());
  const start = S.ui.page * 3;
  const shown = list.slice(start, start + 3);
  const more = start + 3 < list.length;
  return `<section class="page">
    <div class="page-head"><h1 class="serif">Discover</h1></div>
    ${FILTERS.map(([k, l, opts]) => `<div class="label" style="margin-top:10px">${l}</div><div class="chips scroll" data-keep="f-${k}">${opts.map(([v, t]) => `<button class="chip" data-a="filter" data-v="${k}:${v}" aria-pressed="${String(f[k]) === String(v)}">${t}</button>`).join('')}</div>`).join('')}
    <div class="divider"></div>
    <div class="muted small" style="margin-bottom:12px">${list.length ? `Ideas ${start + 1}–${start + shown.length} of ${list.length}` : 'No ideas match'}</div>
    <div class="rise" id="results">
      ${shown.map(a => `<article class="card tap" data-a="activity" data-v="${a.id}">
        <h3 class="serif" style="font-size:21px;line-height:1.2">${esc(a.title)}</h3>
        <p style="margin:6px 0">${esc(a.desc)}</p>
        <p class="muted small" style="margin:0"><b>Why it may fit:</b> ${esc(whyFits(a))}</p>
        ${metaPills(a)}
      </article>`).join('') || `<div class="empty"><div class="serif">Nothing fits all of those.</div>Try loosening one filter.</div>`}
    </div>
    ${list.length ? (more ? `<button class="btn soft block" data-a="morePage">Show 3 different ideas</button>`
      : `<div class="empty" style="padding:16px"><div class="serif" style="font-size:18px">That is every idea for these filters.</div>Pick one that feels good — or <button class="btn ghost" data-a="resetPage">start over</button></div>`) : ''}
  </section>`;
};

V.companion = () => {
  const c = currentConvo(false);
  const msgs = c ? c.messages : [];
  const offline = !navigator.onLine;
  return `<section class="page" style="padding-bottom:calc(env(safe-area-inset-bottom) + 170px)">
    <div class="page-head"><h1 class="serif">Companion</h1><span class="ai-badge">AI · not a person</span><button class="icon-btn" data-a="convoMenu" aria-label="Conversation options">${I.more}</button></div>
    ${offline ? `<div class="banner">You are offline — replies are generated on this device.</div>` : ''}
    <div class="chat" id="chat">
      <div class="msg assistant">Hi${S.prefs.name ? ' ' + esc(S.prefs.name) : ''}. I am Reclaim's AI companion — not a person, but I am here to listen, help you name what you need, and nudge you back toward real life. What is going on?</div>
      ${msgs.length ? '' : `<div class="chips" style="margin:4px 0">${['I keep doomscrolling', 'I feel lonely', 'I am stressed', 'Give me an idea', 'Help me reach out to someone'].map(t => `<button class="chip" data-a="quickSay" data-v="${esc(t)}">${t}</button>`).join('')}</div>`}
      ${msgs.map(msgHTML).join('')}
      ${chatPending ? `<div class="msg assistant"><span class="typing-dots" aria-label="Companion is typing"><i></i><i></i><i></i></span></div>` : ''}
    </div>
  </section>
  <div class="composer chat-input ${chatPending ? 'typing' : ''}">
    <textarea id="chatInput" rows="1" placeholder="Talk it through…" enterkeyhint="send" aria-label="Message the companion"></textarea>
    ${chatPending ? `<button class="round send-btn" data-a="stopReply" aria-label="Stop reply" style="display:grid">${I.stop}</button>` : `<button class="round send-btn" data-a="sendChat" aria-label="Send" style="display:grid">${I.send}</button>`}
  </div>`;
};
function msgHTML(m) {
  if (m.state === 'error') return `<div class="msg assistant error">Could not reach the companion server.<div class="acts"><button data-a="retryChat" data-v="${m.id}">Retry</button><button data-a="offlineReply" data-v="${m.id}">Use on-device reply</button></div></div>`;
  return `<div class="msg ${m.role}">${esc(m.content)}${m.actions?.length ? `<div class="acts">${m.actions.map(x => `<button data-a="${x.a === 'tab' ? 'jumpTab' : x.a}" data-v="${esc(x.v || '')}">${esc(x.label)}</button>`).join('')}</div>` : ''}${m.state === 'stopped' ? '<div class="small" style="opacity:.7;margin-top:4px">Stopped</div>' : ''}${m.remote ? `<div class="fb">${m.rating ? '<span class="small muted">Thanks for the feedback</span>' : `<button data-a="feedback" data-v="${m.id}:up" aria-label="Helpful">👍</button><button data-a="feedback" data-v="${m.id}:down" aria-label="Not helpful">👎</button>`}</div>` : ''}</div>`;
}

const SEGS = [['journal', 'Journal'], ['memories', 'Memories'], ['people', 'People'], ['projects', 'Projects']];
V.life = () => {
  const seg = S.ui.lifeSeg, idx = SEGS.findIndex(([k]) => k === seg);
  return `<section class="page">
    <div class="page-head"><h1 class="serif">My Life</h1><button class="icon-btn" data-a="open" data-v="settings" aria-label="Settings">${I.settings}</button></div>
    <div class="seg" role="tablist"><span class="thumb" style="transform:translateX(${idx * 100}%)"></span>${SEGS.map(([k, l]) => `<button role="tab" data-a="seg" data-v="${k}" aria-pressed="${seg === k}">${l}</button>`).join('')}</div>
    <div class="rise" id="segBody">${LIFE[seg]()}</div>
  </section>${seg === 'journal' ? `<button class="fab" data-a="quickRecord" aria-label="Record a new thought">${I.mic}</button>` : ''}`;
};

function weekStats() {
  const since = Date.now() - 7 * 864e5;
  return {
    done: S.history.filter(h => h.state === 'completed' && h.done > since).length,
    memories: S.memories.filter(m => new Date(m.date + 'T12:00') > since).length,
    entries: S.streams.reduce((n, s) => n + s.entries.filter(e => e.ts > since).length, 0)
  };
}
const streamText = st => st.entries.map(e => e.text).filter(Boolean).join(' ');
const LIFE = {
  journal() {
    const w = weekStats();
    return `<div class="card sage"><div class="eyebrow">This week</div>
      <div class="stat-row"><div class="stat"><b>${w.done}</b><span>things done</span></div><div class="stat"><b>${w.memories}</b><span>memories</span></div><div class="stat"><b>${w.entries}</b><span>thoughts</span></div></div>
      <button class="btn primary block" data-a="weekly">Reflect on your week</button></div>
      <div class="row" style="margin:6px 0 14px"><div style="position:relative;flex:1"><input class="field" id="streamSearch" placeholder="Search your journal" value="${esc(S.ui.q)}" style="padding-left:42px" aria-label="Search journal"><span style="position:absolute;left:12px;top:13px;width:20px;color:var(--muted)">${I.search.replace('<svg', '<svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8"')}</span></div>
      <button class="btn soft" data-a="newStream" aria-label="New stream">${I.plus}</button></div>
      <div id="streamList">${streamList()}</div>`;
  },
  memories() {
    return `<button class="btn soft block" data-a="editMemory" style="margin-bottom:14px">${I.plus} Add a memory</button>` +
      (S.memories.length ? S.memories.map(m => `<article class="card tap" data-a="viewMemory" data-v="${m.id}"><div class="muted small">${esc(fmtDate(m.date + 'T12:00'))}</div><h3 class="serif" style="font-size:19px;margin:2px 0 4px">${esc(m.title)}</h3>${m.note ? `<p class="muted" style="margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(m.note)}</p>` : ''}${m.tags?.length ? `<div class="meta">${m.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}</article>`).join('')
        : `<div class="empty"><div class="serif">Your memories will live here.</div>Finish an activity or add one yourself.</div>`);
  },
  people() {
    return `<p class="muted small" style="margin-top:0">People you want to stay close to. No reminders — just a gentle list.</p><button class="btn soft block" data-a="editPerson" style="margin-bottom:14px">${I.plus} Add someone</button>` +
      (S.people.length ? `<div class="card">${S.people.map(p => `<div class="list-item"><div class="grow" data-a="editPerson" data-v="${p.id}" style="cursor:pointer"><b>${esc(p.name)}</b><div class="muted small clip">${esc(p.note || 'Tap to add what to talk about')}</div><div class="small muted">${p.last ? 'Last reached out: ' + rel(p.last) : 'Not yet'}</div></div><button class="btn soft" data-a="reachedOut" data-v="${p.id}" style="min-height:40px;padding:0 14px;font-size:14px">Reached out</button></div>`).join('')}</div>
      <button class="btn ghost block" data-a="starters">Need a conversation starter?</button>`
        : `<div class="empty"><div class="serif">Who would you like to reconnect with?</div>Add a friend, a relative, an old colleague.</div>`);
  },
  projects() {
    return `<button class="btn soft block" data-a="editProject" style="margin-bottom:14px">${I.plus} Start a project</button>` +
      (S.projects.length ? S.projects.map(p => `<article class="card tap" data-a="viewProject" data-v="${p.id}"><h3 class="serif" style="font-size:19px">${esc(p.title)}</h3>${p.note ? `<p class="muted small" style="margin:4px 0 0">${esc(p.note)}</p>` : ''}<div class="progress"><i style="width:${p.progress}%"></i></div><div class="small muted" style="margin-top:6px">${p.progress}% · ${p.logs.length} update${p.logs.length === 1 ? '' : 's'}</div></article>`).join('')
        : `<div class="empty"><div class="serif">Make something.</div>A song, a garden, a sketchbook, a recipe collection.</div>`);
  }
};
function streamList() {
  const q = S.ui.q.trim().toLowerCase();
  const list = [...S.streams].sort((a, b) => b.updated - a.updated).filter(s => !q || s.title.toLowerCase().includes(q) || streamText(s).toLowerCase().includes(q));
  if (!list.length) return q ? `<div class="empty">No thoughts match “${esc(S.ui.q)}”.</div>` : `<div class="empty"><div class="serif">Start a stream of thought.</div>Tap the mic and just talk — or type. Organise thoughts by topic, go deeper with questions, and turn them into something worth keeping.</div>`;
  return list.map(s => { const last = s.entries.at(-1); return `<article class="card tap stream-card" data-a="openStream" data-v="${s.id}"><h3>${esc(s.title)}</h3><p>${esc(last ? (last.q ? last.q + ' — ' : '') + (last.text || (last.type === 'voice' ? 'Voice note' : '')) : 'Empty stream')}</p><div class="small muted" style="margin-top:8px">${rel(s.updated)} · ${s.entries.length} thought${s.entries.length === 1 ? '' : 's'}${s.drafts?.length ? ` · ${s.drafts.length} draft${s.drafts.length === 1 ? '' : 's'}` : ''}</div></article>`; }).join('');
}

/* ---- Journal stream (Voicepal behaviour) ---- */
const getStream = id => S.streams.find(s => s.id === id);
function entryHTML(e) {
  const icon = e.type === 'voice' ? I.wave : e.q ? I.bubbles : I.pencil;
  return `<article class="entry" data-a="entryMenu" data-v="${e.id}"><div class="kind">${icon}</div>
    ${e.type === 'voice' ? `<button class="play" data-a="play" data-v="${e.id}" aria-label="Play audio">${I.playFill}<span class="pl">Play audio</span><span class="dur">${fmtDur(e.dur || 0)}</span></button>` : ''}
    ${e.q ? `<div class="q">${esc(e.q)}</div>` : ''}
    <div class="text clamp">${e.text ? esc(e.text) : '<span class="muted">No transcript — tap to add text.</span>'}</div>
    <button class="more" data-a="readMore">Read more</button>
    <div class="time">${fmtTime(e.ts)}</div></article>`;
}
V.stream = ({ id }) => {
  const st = getStream(id);
  if (!st) return V.missing();
  let lastDay = '';
  const body = st.entries.map(e => { const d = dayKey(e.ts); const chip = d !== lastDay ? `<span class="date-chip">${fmtDate(e.ts)}</span>` : ''; lastDay = d; return chip + entryHTML(e); }).join('');
  return `<section class="page stream-page">
    <div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button><button class="title" data-a="renameStream" aria-label="Rename stream">${esc(st.title)}</button><button class="icon-btn" data-a="streamMenu" aria-label="Stream options">${I.more}</button></div>
    ${st.entries.length ? `<div class="timeline">${body}</div>` : `<div class="empty"><div class="serif">What is on your mind?</div>Talk or type below — or pick a topic for guided questions.</div>
      <div class="chips" style="justify-content:center">${JOURNAL_TOPICS.map(t => `<button class="chip" data-a="pickTopic" data-v="${t.id}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>`}
  </section>
  <div class="composer" id="composer">
    <button class="round" data-a="questions" aria-label="Follow-up questions">${I.bubbles}</button>
    <button class="round" data-a="recordInStream" aria-label="Record a voice thought">${I.mic}</button>
    <textarea id="thought" rows="1" placeholder="Add thoughts..." aria-label="Add thoughts"></textarea>
    <button class="round draft-btn" data-a="draftSheet" aria-label="Generate draft">${I.sparkle}</button>
    <button class="round send-btn" data-a="addThought" aria-label="Add thought">${I.send}</button>
  </div>`;
};

const WEEKLY_Q = [
  { q: 'What was a moment this week you want to remember?', ctx: 'Big or tiny. Describe it like you are telling a friend.' },
  { q: 'Who made your week better — and do they know?', ctx: 'Maybe this is your sign to tell them.' },
  { q: 'What do you want a little more of next week?', ctx: 'One thing. Keep it small and real.' }
];
// Questions for the current questions screen: weekly, a journal topic, or follow-ups from the stream.
function questionList(p, st) {
  const fresh = list => list.filter(w => !st.entries.some(e => e.q === w.q));
  if (p.weekly) return fresh(WEEKLY_Q);
  const topic = JOURNAL_TOPICS.find(t => t.id === p.topic);
  if (topic) { const left = fresh(topic.qs.map(([q, ctx]) => ({ q, ctx }))); const s = (p.seed || 0) % Math.max(1, left.length); return [...left.slice(s), ...left.slice(0, s)].slice(0, 3); }
  return followUps(st, p.seed || 0);
}
V.questions = p => {
  const st = getStream(p.id);
  if (!st) return V.missing();
  const qs = questionList(p, st);
  const topic = JOURNAL_TOPICS.find(t => t.id === p.topic);
  return `<section class="page full">
    <div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button><div class="title">${topic ? `${topic.icon} ${esc(topic.name)}` : 'Follow up questions'}</div>${p.weekly ? '<div style="width:48px"></div>' : `<button class="icon-btn" data-a="moreQuestions" aria-label="Different questions">${I.refresh}</button>`}</div>
    <div class="rise">${qs.map((x, i) => `<article class="card qcard"><h3>${esc(x.q)}</h3><p>${esc(x.ctx)}</p><div class="row"><button data-a="answerVoice" data-v="${i}" aria-label="Answer by voice">${I.mic}</button><button data-a="answerText" data-v="${i}" aria-label="Answer by typing">Aa</button></div></article>`).join('') || `<div class="empty"><div class="serif">All answered.</div>Lovely work. Head back to your stream.</div>`}</div>
  </section>`;
};

V.draft = p => {
  const st = getStream(p.id);
  if (!st) return V.missing();
  const preset = p.custom ? { name: p.custom, icon: '✏️' } : S.prefs.presets.find(x => x.id === p.presetId) || { name: 'Draft', icon: '✨' };
  if (p.stage === 'gen') return `<section class="page full"><div class="generating"><div class="big" aria-hidden="true">${esc(preset.icon)}</div><h2>Generating first draft<span class="dots"></span></h2><p class="muted small">${esc(preset.name)}</p><button class="btn soft" data-a="back">Cancel</button></div></section>`;
  const d = p.draft;
  return `<section class="page full" style="padding-bottom:calc(env(safe-area-inset-bottom) + 110px)">
    <div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button><div class="title"></div><button class="icon-btn" data-a="shareDraft" aria-label="Share draft">${I.share}</button>${p.draftId ? `<button class="icon-btn" data-a="deleteDraft" aria-label="Delete draft">${I.trash}</button>` : ''}</div>
    <div class="draft"><div class="tag"><span aria-hidden="true">${esc(preset.icon)}</span>${esc(preset.name)}</div>
      ${p.editing ? `<input class="field" id="dTitle" value="${esc(d.title)}" style="font-weight:600;font-size:18px;margin-bottom:10px"><textarea class="field" id="dBody" style="min-height:50dvh">${esc(d.body)}</textarea>`
      : `<h2>${esc(d.title)}</h2><div class="body">${mdLite(d.body)}</div>`}
    </div>
  </section>
  <div class="draft-bar"><button class="circle" data-a="back" aria-label="${p.draftId ? 'Close' : 'Discard draft'}">${I.x}</button><button class="circle" data-a="editDraft" aria-label="${p.editing ? 'Preview' : 'Edit draft'}">${p.editing ? I.check : I.pencil}</button><button class="btn dark" data-a="saveDraft">${I.check} ${p.draftId ? 'Done' : 'Save'}</button></div>`;
};
function mdLite(src) {
  return String(src).split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    let out = '';
    if (lines[0].startsWith('## ')) { out += `<h3>${esc(lines.shift().slice(3))}</h3>`; }
    if (lines.length && lines.every(l => l.startsWith('- '))) return out + `<ul>${lines.map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>`;
    return out + (lines.length ? `<p>${lines.map(esc).join('<br>')}</p>` : '');
  }).join('');
}

V.drafts = ({ id }) => {
  const st = getStream(id);
  if (!st) return V.missing();
  return `<section class="page full"><div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button><div class="title">Drafts</div><div style="width:48px"></div></div>
    <div class="rise">${(st.drafts || []).map(d => { const p = S.prefs.presets.find(x => x.id === d.presetId); return `<article class="card tap" data-a="openDraft" data-v="${d.id}"><div class="muted small">${esc(p?.icon || '✏️')} ${esc(p?.name || d.custom || 'Draft')} · ${rel(d.ts)}</div><h3 style="margin-top:4px">${esc(d.title)}</h3></article>`; }).join('') || `<div class="empty"><div class="serif">No drafts yet.</div>Tap the sparkle in a stream to generate one.</div>`}</div></section>`;
};

V.presets = () => `<section class="page full"><div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button><div class="title">Edit presets</div><div style="width:48px"></div></div>
  <p class="muted small" style="margin-top:0">Presets shape how your thoughts become a draft.</p>
  <div class="card">${S.prefs.presets.map(p => `<div class="list-item"><span style="width:28px;text-align:center;font-size:20px">${esc(p.icon)}</span><div class="grow">${esc(p.name)}</div><button class="icon-btn" data-a="deletePreset" data-v="${p.id}" aria-label="Delete ${esc(p.name)}">${I.trash}</button></div>`).join('') || '<div class="empty">No presets.</div>'}</div>
  <button class="btn soft block" data-a="addPreset">${I.plus} Add preset</button>
  <button class="btn ghost block" data-a="resetPresets" style="margin-top:8px">Restore defaults</button></section>`;

V.settings = () => `<section class="page full">
  <div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button><div class="title">Settings</div><div style="width:48px"></div></div>
  <div class="label">Your name</div><input class="field" id="setName" value="${esc(S.prefs.name)}" placeholder="First name">
  <div class="label">Interests</div><div class="chips">${INTERESTS.map(([k, l]) => `<button class="chip" data-a="toggleInterest" data-v="${k}" aria-pressed="${S.prefs.interests.includes(k)}">${l}</button>`).join('')}</div>
  <div class="label">Appearance</div><div class="chips">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button class="chip" data-a="theme" data-v="${k}" aria-pressed="${S.prefs.theme === k}">${l}</button>`).join('')}</div>
  <div class="label">Companion server (optional)</div>
  <input class="field" id="setApi" value="${esc(S.prefs.apiUrl)}" placeholder="https://your-reclaim-api.example.com" inputmode="url" autocapitalize="off">
  <p class="muted small">Leave empty to use on-device replies. A server is your FastAPI backend (POST /v1/chat). No API key is ever stored in the app.</p>
  <button class="btn soft" data-a="testApi">Test connection</button>
  <div class="label">Your data</div>
  <div class="card">
    <button class="list-item" data-a="exportData"><div class="grow">Export everything (JSON)</div></button>
    <label class="list-item" style="cursor:pointer"><div class="grow">Import from a backup</div><input type="file" id="importFile" accept="application/json" class="sr"></label>
    <button class="list-item" data-a="clearMemories"><div class="grow">Clear memories</div></button>
    <button class="list-item" data-a="clearConvos"><div class="grow">Delete all conversations</div></button>
    <button class="list-item btn danger" data-a="wipe" style="justify-content:flex-start;padding:14px 0"><div class="grow">Delete everything</div></button>
  </div>
  <p class="muted small">Reclaim has no feeds, streaks or notifications, and keeps everything on this device. Voice recordings stay on the phone and are not included in exports. Live transcription uses Chrome's built-in speech service, which may process audio on Google's servers.</p>
  <p class="muted small">Reclaim 1.0</p>
</section>`;

V.missing = () => `<section class="page full"><div class="page-head"><button class="icon-btn" data-a="back" aria-label="Back">${I.back}</button></div><div class="empty"><div class="serif">This is gone.</div>It may have been deleted.</div></section>`;

/* ---------------- Recorder (Voicepal "Recording" screen) ---------------- */
function record({ title = 'Recording', question = '' } = {}) {
  return new Promise(resolve => {
    let media, rec, ctx, raf, tick, sr, chunks = [], finalText = '', interim = '', paused = false, srOK = true, done = false, pending = null, confirmed = false;
    let elapsed = 0, lastStart = Date.now(), promptI = Math.floor(Math.random() * RECORD_PROMPTS.length);
    const secs = () => (elapsed + (paused ? 0 : Date.now() - lastStart)) / 1000;
    const el = document.createElement('div');
    el.className = 'recorder'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="page-head"><button class="icon-btn" data-r="back" aria-label="Discard recording">${I.back}</button><div class="title">${esc(title)}</div><div style="width:48px"></div></div>
      <div class="center">${question ? `<div class="rec-q">${esc(question)}</div>` : ''}<div id="rp"></div>
        <div class="bars" aria-hidden="true"><span style="height:62px"></span><span style="height:100px"></span><span style="height:84px"></span><span style="height:58px"></span></div>
        <div class="timer">${I.mic}<span id="rt">0:00</span></div>
        <div class="live-text"><div id="lt"></div></div></div>
      <div class="rec-controls"><button class="side" data-r="prompt" aria-label="Show a prompt">${I.compass}</button><button class="mid" data-r="pause" aria-label="Pause recording">${I.pause}</button><button class="side done" data-r="done" aria-label="Finish recording">${I.check}</button></div>`;
    $('#overlay').append(el);
    const rt = el.querySelector('#rt'), lt = el.querySelector('#lt'), bars = $$('.bars span', el), pauseBtn = el.querySelector('[data-r="pause"]');
    const base = [62, 100, 84, 58];

    const cleanup = () => {
      cancelAnimationFrame(raf); clearInterval(tick);
      try { sr?.abort(); } catch {}
      media?.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => {});
    };
    const finish = result => { if (done) return; done = true; cleanup(); el.classList.add('closing'); setTimeout(() => el.remove(), reduced ? 0 : 280); resolve(result); };
    const layer = {
      close: () => {
        if (pending || confirmed || secs() < 5) return finish(pending);
        pushLayer(layer); // keep the recorder open while we ask
        ask('Discard this recording?', 'What you said will not be saved.', 'Discard').then(ok => { if (ok) { confirmed = true; popLayer(); } });
      }
    };
    pushLayer(layer);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const android = /Android/i.test(navigator.userAgent);
    const startSR = () => {
      if (!SR || !srOK || paused || done || pending) return;
      sr = new SR();
      sr.continuous = !android; // Android repeats results in continuous mode
      sr.interimResults = true;
      sr.lang = navigator.language || 'en-US';
      sr.onresult = ev => {
        interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim(); else interim += r[0].transcript;
        }
        lt.textContent = (finalText + ' ' + interim).trim();
      };
      sr.onerror = ev => { if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'network'].includes(ev.error)) { srOK = false; lt.textContent = 'Live transcription unavailable — your audio is still being saved.'; } };
      sr.onend = () => { sr = null; if (interim) { finalText += (finalText ? ' ' : '') + interim.trim(); interim = ''; } if (!paused && !done && !pending && srOK) setTimeout(startSR, 150); };
      try { sr.start(); } catch { srOK = false; }
    };
    const loop = analyser => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      const bands = [[1, 4], [4, 10], [10, 22], [22, 48]];
      const step = () => {
        analyser.getByteFrequencyData(data);
        bands.forEach(([a, b], i) => { let s = 0; for (let k = a; k < b; k++) s += data[k]; const lvl = s / (b - a) / 255; bars[i].style.height = Math.min(150, base[i] * (0.75 + lvl * 1.4)) + 'px'; });
        raf = requestAnimationFrame(step);
      };
      step();
    };

    (async () => {
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        toast('Microphone access is needed to record. You can type instead.');
        pending = null; confirmed = true; popLayer(); return;
      }
      if (done) return cleanup();
      rec = new MediaRecorder(media);
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.start(1000);
      lastStart = Date.now();
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(media).connect(an);
      el.classList.add('live'); loop(an);
      tick = setInterval(() => { rt.textContent = fmtDur(secs()); }, 250);
      if (!SR) lt.textContent = 'Live transcription is not supported here — audio will be saved.';
      startSR();
      haptic(15);
    })();

    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      haptic();
      const r = b.dataset.r;
      if (r === 'back') popLayer();
      if (r === 'prompt') {
        promptI = (promptI + 1) % RECORD_PROMPTS.length;
        el.querySelector('#rp').innerHTML = `<div class="rec-prompt">${esc(RECORD_PROMPTS[promptI])}</div>`;
      }
      if (r === 'pause' && rec) {
        if (!paused) {
          paused = true; elapsed += Date.now() - lastStart; rec.pause(); try { sr?.stop(); } catch {}
          cancelAnimationFrame(raf); el.classList.remove('live');
          pauseBtn.innerHTML = I.mic; pauseBtn.setAttribute('aria-label', 'Resume recording');
        } else {
          paused = false; lastStart = Date.now(); rec.resume(); el.classList.add('live');
          const an = ctx.createAnalyser(); an.fftSize = 256; ctx.createMediaStreamSource(media).connect(an); loop(an);
          pauseBtn.innerHTML = I.pause; pauseBtn.setAttribute('aria-label', 'Pause recording');
          startSR();
        }
      }
      if (r === 'done') {
        if (!rec) return;
        if (secs() < 1) return toast('Say a little more first.');
        const dur = secs();
        paused = true;
        rt.textContent = 'Transcribing…';
        try { sr?.stop(); } catch {}
        await new Promise(res => { rec.onstop = res; rec.state !== 'inactive' ? rec.stop() : res(); });
        await wait(srOK && SR ? 700 : 0); // let the last words arrive
        pending = { blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), dur, text: (finalText + ' ' + interim).trim() };
        popLayer();
      }
    });
  });
}

/* ---------------- Audio playback ---------------- */
const player = { id: null, audio: null, url: null };
function stopPlayer() { if (player.audio) { player.audio.pause(); URL.revokeObjectURL(player.url); } player.id = player.audio = player.url = null; }
function setPlayBtn(id, playing, label) {
  const b = $(`[data-a="play"][data-v="${id}"]`); if (!b) return;
  b.firstElementChild.outerHTML = playing ? I.pauseFill : I.playFill;
  b.querySelector('.pl').textContent = playing ? 'Pause' : 'Play audio';
  if (label) b.querySelector('.dur').textContent = label;
}

/* ---------------- Companion ---------------- */
let chatPending = null; // { controller, timer, msgId }
function currentConvo(create = true) {
  let c = S.convos.find(c => c.id === S.ui.convoId);
  if (!c && create) { c = { id: uid(), created: Date.now(), updated: Date.now(), messages: [] }; S.convos.unshift(c); S.ui.convoId = c.id; }
  return c;
}
const companionCtx = {
  suggest(intent) {
    const mood = { scroll: 'restless', lonely: 'lonely', tired: 'tired', low: 'low', anxious: 'calm' }[intent] || todayMood();
    const pool = intent === 'anxious' ? ACTIVITIES.filter(a => a.cat === 'mindful') : ACTIVITIES;
    return ranked(pool, mood)[0];
  },
  person() { return [...S.people].sort((a, b) => (a.last || 0) - (b.last || 0))[0]; }
};
async function apiFetch(path, body, signal, method = body ? 'POST' : 'GET') {
  const url = S.prefs.apiUrl.replace(/\/+$/, '') + path;
  const t = new AbortController();
  const timer = setTimeout(() => t.abort(), 75000); // free hosts can take ~50s to wake up
  signal?.addEventListener('abort', () => t.abort());
  try {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: t.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function reply(c, text) {
  const controller = new AbortController();
  chatPending = { controller };
  refresh(); scrollTo(0, document.body.scrollHeight);
  const useApi = S.prefs.apiUrl && navigator.onLine;
  try {
    let m;
    if (useApi) {
      // History excludes the message just sent (it goes in `message`) and any failed turns.
      const history = c.messages.slice(0, -1).filter(x => x.state !== 'error' && x.content).slice(-12).map(({ role, content }) => ({ role, content }));
      const r = await apiFetch('/v1/chat', { mode: 'companion', conversation_id: c.id, message: text, history, context: { name: S.prefs.name, interests: S.prefs.interests, mood: todayMood() || null } }, controller.signal);
      const act = r.activity_id && actById(r.activity_id);
      m = { content: String(r.reply || ''), actions: act ? [{ label: `Try: ${act.title}`, a: 'activity', v: act.id }] : [], remote: true };
    } else {
      await new Promise((res, rej) => {
        const t = setTimeout(res, 500 + Math.random() * 600);
        controller.signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('stopped', 'AbortError')); });
      });
      m = localReply(text, companionCtx);
    }
    c.messages.push({ id: uid(), role: 'assistant', content: m.content, actions: m.actions, ts: Date.now(), state: 'sent', remote: !!m.remote });
  } catch (err) {
    if (err.name === 'AbortError' && controller.signal.aborted) {
      const last = c.messages.at(-1); if (last) last.state = 'stopped';
    } else c.messages.push({ id: uid(), role: 'assistant', state: 'error', retryText: text, ts: Date.now() });
  }
  c.updated = Date.now();
  chatPending = null; save();
  if (S.ui.tab === 'companion' && !screens.length) { refresh(); scrollTo({ top: document.body.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }); }
}
function sendChat(text) {
  text = text.trim(); if (!text || chatPending) return;
  const c = currentConvo();
  c.messages.push({ id: uid(), role: 'user', content: text, ts: Date.now(), state: 'sent' });
  save(); reply(c, text);
}

/* ---------------- Activities ---------------- */
function openActivity(id) {
  const a = actById(id); if (!a) return;
  const body = () => {
    const run = S.history.find(h => h.state === 'started' && h.activityId === id);
    return `<div class="eyebrow">${esc(INTERESTS.find(([k]) => k === a.cat)?.[1] || '')}</div><h2 class="serif" style="font-size:26px;font-weight:500">${esc(a.title)}</h2>
      <p style="margin:8px 0">${esc(a.desc)}</p><p class="muted small" style="margin:0"><b>Why it may fit:</b> ${esc(whyFits(a))}</p>${metaPills(a)}
      <div class="label">${run ? 'Steps' : 'How to'}</div>
      ${a.steps.map((s, i) => run ? `<button class="check-step" role="checkbox" aria-checked="${!!run.steps?.[i]}" data-step="${i}"><span class="box"></span><span>${esc(s)}</span></button>` : `<div class="check-step"><span class="box" style="border-style:dashed"></span><span>${esc(s)}</span></div>`).join('')}
      <div class="stack" style="margin-top:18px">${run
        ? `<button class="btn primary block" data-act="done">I did it</button><button class="btn soft block" data-act="skip">Skip it</button>`
        : `<button class="btn primary block" data-act="start">Start</button><button class="btn soft block" data-a="closeSheet">Not now</button>`}</div>`;
  };
  sheet(`<div id="actBody">${body()}</div>`, {
    onMount: s => s.addEventListener('click', async e => {
      const st = e.target.closest('[data-step]');
      const run = S.history.find(h => h.state === 'started' && h.activityId === id);
      if (st && run) { haptic(); run.steps = run.steps || []; run.steps[st.dataset.step] = !run.steps[st.dataset.step]; save(); st.setAttribute('aria-checked', !!run.steps[st.dataset.step]); return; }
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
      haptic(12);
      if (act === 'start') {
        S.history.filter(h => h.state === 'started').forEach(h => { h.state = 'skipped'; });
        S.history.unshift({ id: uid(), activityId: id, state: 'started', ts: Date.now(), steps: [] });
        save(); s.querySelector('#actBody').innerHTML = body(); refresh();
        toast('Started. Put the phone down — Reclaim will be here after.');
      }
      if (act === 'skip') {
        run.state = 'skipped'; run.done = Date.now(); save(); await popLayer(); refresh();
        toast('Skipped — no worries.', () => { run.state = 'started'; delete run.done; save(); refresh(); });
      }
      if (act === 'done') { await popLayer(); reflect(run, a); }
    })
  });
}
function reflect(run, a) {
  sheet(`<h2 class="serif" style="font-weight:500">Nice. How was it?</h2><p class="muted small">A sentence is plenty. Optional.</p>
    <textarea class="field" id="rf" placeholder="What did you notice, enjoy, or learn?" style="margin:12px 0"></textarea>
    <button class="check-step" role="checkbox" aria-checked="true" id="asMem"><span class="box"></span><span style="text-decoration:none;color:var(--ink)">Save as a memory</span></button>
    <button class="btn primary block" id="ok" style="margin-top:12px">Save</button>`, {
    onMount: s => {
      const m = s.querySelector('#asMem');
      m.onclick = () => { haptic(); m.setAttribute('aria-checked', m.getAttribute('aria-checked') !== 'true'); };
      s.querySelector('#ok').onclick = async () => {
        const note = s.querySelector('#rf').value.trim();
        run.state = 'completed'; run.done = Date.now(); run.reflection = note;
        if (m.getAttribute('aria-checked') === 'true') S.memories.unshift({ id: uid(), title: a.title, note, date: dayKey(), tags: [INTERESTS.find(([k]) => k === a.cat)?.[1] || a.cat], activityId: a.id });
        save(); await popLayer(); refresh(); haptic(20);
        toast('Saved to My Life. Well done.');
      };
    }
  });
}

/* ---------------- Mindful pause ---------------- */
function mindfulPause() {
  const el = document.createElement('div');
  el.className = 'pause-wrap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Mindful pause');
  el.innerHTML = `<div class="breath" aria-hidden="true"></div><div class="serif" id="pw" aria-live="polite">Settle in</div><button class="btn soft" data-p="close">Skip</button>`;
  $('#overlay').append(el);
  let timers = [], closed = false;
  const close = () => { closed = true; timers.forEach(clearTimeout); el.classList.add('closing'); setTimeout(() => el.remove(), 300); };
  pushLayer({ close });
  const b = el.querySelector('.breath'), w = el.querySelector('#pw');
  const phases = [];
  for (let i = 0; i < 3; i++) phases.push(['in', 'Breathe in', 4000], ['hold', 'Hold', 2000], ['out', 'Breathe out', 6000]);
  let t = 900;
  phases.forEach(([cls, text, ms]) => { timers.push(setTimeout(() => { if (closed) return; b.className = 'breath ' + (cls === 'hold' ? 'in' : cls); w.textContent = text; haptic(cls === 'hold' ? 0 : 10); }, t)); t += ms; });
  timers.push(setTimeout(() => {
    if (closed) return;
    const a = ranked(ACTIVITIES.filter(x => x.dur <= 20), todayMood())[0];
    el.innerHTML = `<div class="serif" style="font-size:30px">Welcome back.</div><p style="max-width:300px;opacity:.85;margin:0">Still want to scroll? Or maybe: <b>${esc(a.title)}</b> — ${a.dur} minutes.</p><div class="row"><button class="btn soft" data-p="try" data-id="${a.id}">Try it</button><button class="btn soft" data-p="close">Close</button></div>`;
  }, t));
  el.addEventListener('click', async e => {
    const p = e.target.closest('[data-p]'); if (!p) return;
    haptic();
    const id = p.dataset.id;
    await popLayer();
    if (p.dataset.p === 'try') openActivity(id);
  });
}

/* ---------------- Journal actions ---------------- */
function newStream(title = 'Untitled stream') {
  const st = { id: uid(), title, created: Date.now(), updated: Date.now(), entries: [], drafts: [] };
  S.streams.unshift(st); save(); return st;
}
function addEntry(st, entry) {
  st.entries.push({ id: uid(), ts: Date.now(), ...entry });
  st.updated = Date.now();
  if (/^untitled/i.test(st.title)) st.title = autoTitle(entry.text) || st.title;
  save();
}
async function addVoice(st, res, q) {
  const id = uid();
  try { await idb.put(id, res.blob); } catch { toast('Could not store the audio, but the transcript is saved.'); }
  st.entries.push({ id, type: 'voice', text: res.text, dur: res.dur, ts: Date.now(), ...(q ? { q } : {}) });
  st.updated = Date.now();
  if (/^untitled/i.test(st.title)) st.title = autoTitle(res.text) || `Voice note · ${fmtDate(Date.now())}`;
  save();
}
function deleteStream(st) {
  const i = S.streams.indexOf(st); S.streams.splice(i, 1); save();
  const purge = setTimeout(() => st.entries.forEach(e => e.type === 'voice' && idb.del(e.id).catch(() => {})), 5500);
  return () => { clearTimeout(purge); S.streams.splice(i, 0, st); save(); };
}
async function generateDraft(st, presetId, custom) {
  go('draft', { id: st.id, presetId, custom, stage: 'gen' });
  const top = screens.at(-1);
  const preset = S.prefs.presets.find(p => p.id === presetId) || { kind: 'journal', name: 'Draft' };
  let d;
  if (S.prefs.apiUrl && navigator.onLine) {
    try {
      const r = await apiFetch('/v1/chat', { mode: 'draft', message: `Draft type: ${custom || preset.name}\n\n${st.entries.filter(e => e.text).map(e => (e.q ? `Q: ${e.q}\nA: ` : '') + e.text).join('\n\n')}` });
      const [title, ...rest] = String(r.reply || '').trim().split('\n');
      if (title) d = { title: title.replace(/^#+\s*/, ''), body: rest.join('\n').trim() };
    } catch (e) { toast(e.message === 'HTTP 503' ? 'Drafted on this device — the server has no AI model connected.' : 'Could not reach the server — drafted on this device instead.'); }
  }
  if (!d) { await wait(1400); d = localDraft(st, preset.kind === 'customNamed' ? null : preset, custom || (preset.kind === 'customNamed' ? preset.name : '')); }
  if (screens.at(-1) !== top) return; // user cancelled
  Object.assign(top.params, { stage: 'view', draft: d });
  refresh(); haptic(15);
}

/* ---------------- People / memories / projects editors ---------------- */
function editMemory(id) {
  const m = S.memories.find(x => x.id === id) || { title: '', note: '', date: dayKey(), tags: [] };
  sheet(`<h2>${id ? 'Edit memory' : 'New memory'}</h2>
    <div class="label">Title</div><input class="field" id="mT" value="${esc(m.title)}" placeholder="Sunset chai with Riya">
    <div class="label">What happened</div><textarea class="field" id="mN" placeholder="Details you want to keep">${esc(m.note)}</textarea>
    <div class="label">Date</div><input class="field" type="date" id="mD" value="${esc(m.date)}" max="${dayKey()}">
    <div class="label">Tags (comma separated)</div><input class="field" id="mG" value="${esc((m.tags || []).join(', '))}" placeholder="friends, food">
    <button class="btn primary block" id="ok" style="margin-top:18px">Save</button>`, {
    onMount: s => {
      if (!id) setTimeout(() => s.querySelector('#mT').focus(), 320);
      s.querySelector('#ok').onclick = async () => {
        const title = s.querySelector('#mT').value.trim();
        if (!title) { s.querySelector('#mT').focus(); return toast('Give it a short title.'); }
        Object.assign(m, { title, note: s.querySelector('#mN').value.trim(), date: s.querySelector('#mD').value || dayKey(), tags: s.querySelector('#mG').value.split(',').map(t => t.trim()).filter(Boolean) });
        if (!id) S.memories.unshift({ id: uid(), ...m });
        S.memories.sort((a, b) => b.date.localeCompare(a.date));
        save(); await popLayer(); refresh(); toast('Memory saved.');
      };
    }
  });
}
function viewMemory(id) {
  const m = S.memories.find(x => x.id === id); if (!m) return;
  const a = m.activityId && actById(m.activityId);
  sheet(`<div class="muted small">${esc(fmtDate(m.date + 'T12:00'))}</div><h2 class="serif" style="font-size:26px;font-weight:500;margin:4px 0 10px">${esc(m.title)}</h2>
    ${m.note ? `<p style="white-space:pre-wrap">${esc(m.note)}</p>` : ''}${a ? `<p class="muted small">From: ${esc(a.title)}</p>` : ''}
    ${m.tags?.length ? `<div class="meta">${m.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:20px"><button class="btn soft" id="ed" style="flex:1">Edit</button><button class="btn soft danger" id="del" style="flex:1">Delete</button></div>`, {
    onMount: s => {
      s.querySelector('#ed').onclick = async () => { await popLayer(); editMemory(id); };
      s.querySelector('#del').onclick = async () => {
        const i = S.memories.indexOf(m); S.memories.splice(i, 1); save(); await popLayer(); refresh();
        toast('Memory deleted.', () => { S.memories.splice(i, 0, m); save(); refresh(); });
      };
    }
  });
}
function editPerson(id) {
  const p = S.people.find(x => x.id === id) || { name: '', note: '' };
  sheet(`<h2>${id ? esc(p.name) : 'Someone to reconnect with'}</h2>
    <div class="label">Name</div><input class="field" id="pN" value="${esc(p.name)}" placeholder="Name">
    <div class="label">What to talk about</div><textarea class="field" id="pT" placeholder="Their new job, that trip you planned…" style="min-height:90px">${esc(p.note)}</textarea>
    <button class="btn primary block" id="ok" style="margin-top:18px">Save</button>${id ? '<button class="btn soft danger block" id="del" style="margin-top:10px">Remove</button>' : ''}`, {
    onMount: s => {
      if (!id) setTimeout(() => s.querySelector('#pN').focus(), 320);
      s.querySelector('#ok').onclick = async () => {
        const name = s.querySelector('#pN').value.trim(); if (!name) return toast('Add a name.');
        Object.assign(p, { name, note: s.querySelector('#pT').value.trim() });
        if (!id) S.people.push({ id: uid(), last: null, ...p });
        save(); await popLayer(); refresh();
      };
      s.querySelector('#del')?.addEventListener('click', async () => {
        const i = S.people.indexOf(p); S.people.splice(i, 1); save(); await popLayer(); refresh();
        toast('Removed.', () => { S.people.splice(i, 0, p); save(); refresh(); });
      });
    }
  });
}
function editProject(id) {
  sheet(`<h2>New project</h2><div class="label">What are you making?</div><input class="field" id="jT" placeholder="Learn three songs on guitar">
    <div class="label">Why it matters (optional)</div><input class="field" id="jN" placeholder="Something to play for friends">
    <button class="btn primary block" id="ok" style="margin-top:18px">Start project</button>`, {
    onMount: s => {
      setTimeout(() => s.querySelector('#jT').focus(), 320);
      s.querySelector('#ok').onclick = async () => {
        const title = s.querySelector('#jT').value.trim(); if (!title) return toast('Name your project.');
        S.projects.unshift({ id: uid(), title, note: s.querySelector('#jN').value.trim(), progress: 0, logs: [], created: Date.now() });
        save(); await popLayer(); refresh();
      };
    }
  });
}
function viewProject(id) {
  const p = S.projects.find(x => x.id === id); if (!p) return;
  sheet(`<h2 class="serif" style="font-weight:500;font-size:24px">${esc(p.title)}</h2>${p.note ? `<p class="muted">${esc(p.note)}</p>` : ''}
    <div class="label">Progress <b id="pv">${p.progress}%</b></div><input type="range" min="0" max="100" step="5" value="${p.progress}" id="pr" aria-label="Progress">
    <div class="label">Log an update</div><input class="field" id="pl" placeholder="Learned the chorus today">
    <button class="btn primary block" id="ok" style="margin-top:12px">Save</button>
    ${p.logs.length ? `<div class="label">Updates</div>${p.logs.slice().reverse().map(l => `<div class="list-item"><div class="grow">${esc(l.text)}<div class="small muted">${rel(l.ts)}</div></div></div>`).join('')}` : ''}
    <button class="btn soft danger block" id="del" style="margin-top:14px">Delete project</button>`, {
    onMount: s => {
      const r = s.querySelector('#pr');
      r.oninput = () => { s.querySelector('#pv').textContent = r.value + '%'; };
      s.querySelector('#ok').onclick = async () => {
        p.progress = +r.value; const t = s.querySelector('#pl').value.trim();
        if (t) p.logs.push({ text: t, ts: Date.now() });
        save(); await popLayer(); refresh();
        if (p.progress === 100) { haptic(30); toast('Finished! That deserves a memory.'); }
      };
      s.querySelector('#del').onclick = async () => {
        const i = S.projects.indexOf(p); S.projects.splice(i, 1); save(); await popLayer(); refresh();
        toast('Project deleted.', () => { S.projects.splice(i, 0, p); save(); refresh(); });
      };
    }
  });
}

/* ---------------- Action table ---------------- */
const curStream = () => getStream(screens.at(-1)?.params.id);
const A = {
  back: () => popLayer(),
  closeSheet: () => popLayer(),
  open: v => go(v),
  tab(v) {
    if (v === S.ui.tab) return scrollTo({ top: 0, behavior: 'smooth' });
    const wasHome = S.ui.tab === 'today';
    if (v === 'today' && layers.length && layers.at(-1).tab) return popLayer();
    S.ui.tab = v; save();
    // Back from any other tab returns Home first (Android convention).
    if (wasHome) pushLayer({ tab: true, close: () => { S.ui.tab = 'today'; save(); paint('fade'); } });
    paint('fade');
  },
  async jumpTab(v) {
    const [t, seg] = v.split(':');
    if (seg) { S.ui.lifeSeg = seg; save(); }
    while (screens.length) await popLayer();
    A.tab(t);
  },
  toggleInterest(v, el) {
    const i = S.prefs.interests.indexOf(v);
    i < 0 ? S.prefs.interests.push(v) : S.prefs.interests.splice(i, 1);
    el.setAttribute('aria-pressed', i < 0); save();
  },
  finishOnboarding() {
    S.prefs.name = $('#obName').value.trim(); S.onboarded = true; save();
    paint('fade');
  },
  mood(v) { S.moods[dayKey()] = todayMood() === v ? undefined : v; S.today.i = 0; save(); refresh(); if (todayMood()) toast('Thanks — noted.'); },
  anotherIdea() { S.today.i = (S.today.i + 1) % 3; save(); refresh(); },
  activity: v => openActivity(v),
  pause: () => mindfulPause(),
  quickLine: async () => {
    const t = await textSheet({ title: 'One line about today', placeholder: 'Today I…' });
    if (!t) return;
    const st = S.streams.find(s => s.title === 'Daily notes') || newStream('Daily notes');
    addEntry(st, { type: 'text', text: t }); toast('Saved to your Journal.');
  },
  viewMemory: v => viewMemory(v),
  filter(v) { const [k, val] = v.split(':'); S.ui.filters[k] = isNaN(+val) ? val : +val; S.ui.page = 0; save(); refresh(); },
  morePage() { S.ui.page++; save(); refresh(); $('#results')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); },
  resetPage() { S.ui.page = 0; save(); refresh(); },
  seg(v) {
    S.ui.lifeSeg = v; save();
    const idx = SEGS.findIndex(([k]) => k === v);
    $('.seg .thumb').style.transform = `translateX(${idx * 100}%)`;
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
    setTimeout(refresh, reduced ? 0 : 180);
  },
  // Journal
  openStream: v => go('stream', { id: v }),
  newStream() {
    sheet(`<h2>Start a stream</h2><p class="muted small">Write about anything, or pick a topic for guided questions.</p>
      <button class="option" data-t=""><span class="ico">✏️</span>Blank stream</button>
      <div class="chips" style="margin-top:6px">${JOURNAL_TOPICS.map(t => `<button class="chip" data-t="${t.id}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>`, {
      onMount: s => s.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-t]'); if (!b) return;
        haptic(); await popLayer();
        const topic = JOURNAL_TOPICS.find(t => t.id === b.dataset.t);
        const st = newStream(topic ? topic.name : undefined);
        go('stream', { id: st.id });
        if (topic) setTimeout(() => go('questions', { id: st.id, topic: topic.id }), reduced ? 0 : 350);
      })
    });
  },
  pickTopic(v) {
    const st = curStream(), topic = JOURNAL_TOPICS.find(t => t.id === v);
    if (/^untitled/i.test(st.title)) { st.title = topic.name; save(); refresh(); }
    go('questions', { id: st.id, topic: v });
  },
  async quickRecord() {
    const res = await record();
    if (!res) return;
    const st = newStream(); await addVoice(st, res); go('stream', { id: st.id });
  },
  weekly() {
    const title = `Week of ${new Date(Date.now() - 6 * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const st = S.streams.find(s => s.title === title) || newStream(title);
    go('stream', { id: st.id }); setTimeout(() => go('questions', { id: st.id, weekly: true }), reduced ? 0 : 350);
  },
  addThought() {
    const t = $('#thought'); const text = t.value.trim(); if (!text) return;
    addEntry(curStream(), { type: 'text', text }); refresh();
    scrollTo({ top: document.body.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  },
  async recordInStream() {
    const st = curStream(); const res = await record();
    if (!res) return;
    await addVoice(st, res); refresh(); scrollTo({ top: document.body.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  },
  readMore(v, el, e) {
    e.stopPropagation();
    const t = el.parentElement.querySelector('.text');
    const open = t.classList.toggle('clamp');
    el.textContent = open ? 'Read more' : 'Show less';
  },
  async play(id, el, e) {
    e.stopPropagation();
    if (player.id === id) {
      if (player.audio.paused) { player.audio.play(); setPlayBtn(id, true); } else { player.audio.pause(); setPlayBtn(id, false); }
      return;
    }
    stopPlayer();
    const blob = await idb.get(id).catch(() => null);
    if (!blob) return toast('This recording is not on this device.');
    player.id = id; player.url = URL.createObjectURL(blob); player.audio = new Audio(player.url);
    const entry = curStream()?.entries.find(x => x.id === id);
    player.audio.ontimeupdate = () => setPlayBtn(id, !player.audio.paused, fmtDur(Math.max(0, (entry?.dur || 0) - player.audio.currentTime)));
    player.audio.onended = () => { setPlayBtn(id, false, fmtDur(entry?.dur || 0)); stopPlayer(); };
    player.audio.play().then(() => setPlayBtn(id, true)).catch(() => toast('Could not play this recording.'));
  },
  entryMenu(id) {
    const st = curStream(); const e = st.entries.find(x => x.id === id); if (!e) return;
    sheet(`<h2>Thought</h2><p class="muted small">${fmtDate(e.ts)} · ${fmtTime(e.ts)}</p>
      <button class="option" data-m="edit"><span class="ico">✏️</span>${e.text ? 'Edit text' : 'Add text'}</button>
      <button class="option" data-m="copy"><span class="ico">📋</span>Copy</button>
      <button class="option" data-m="memory"><span class="ico">📷</span>Save as memory</button>
      <button class="option" data-m="del" style="color:#B3473A"><span class="ico">🗑️</span>Delete</button>`, {
      onMount: s => s.addEventListener('click', async ev => {
        const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return;
        haptic(); await popLayer();
        if (m === 'edit') { const t = await textSheet({ title: e.q || 'Edit thought', value: e.text }); if (t !== null) { e.text = t; save(); refresh(); } }
        if (m === 'copy') { navigator.clipboard?.writeText((e.q ? e.q + '\n' : '') + e.text).then(() => toast('Copied.'), () => toast('Could not copy.')); }
        if (m === 'memory') { S.memories.unshift({ id: uid(), title: autoTitle(e.text) || st.title, note: e.text, date: dayKey(e.ts), tags: ['journal'] }); save(); toast('Saved to Memories.'); }
        if (m === 'del') {
          const i = st.entries.indexOf(e); st.entries.splice(i, 1); save(); refresh();
          const purge = e.type === 'voice' && setTimeout(() => idb.del(e.id).catch(() => {}), 5500);
          toast('Thought deleted.', () => { clearTimeout(purge); st.entries.splice(i, 0, e); save(); refresh(); });
        }
      })
    });
  },
  async renameStream() {
    const st = curStream();
    const t = await textSheet({ title: 'Rename stream', value: st.title, ok: 'Rename' });
    if (t) { st.title = t; save(); refresh(); }
  },
  streamMenu() {
    const st = curStream();
    sheet(`<h2>${esc(st.title)}</h2><p class="muted small">${st.entries.length} thoughts · started ${fmtDate(st.created)}</p>
      <button class="option" data-m="rename"><span class="ico">✏️</span>Rename</button>
      <button class="option" data-m="drafts"><span class="ico">📄</span>Drafts (${st.drafts?.length || 0})</button>
      <button class="option" data-m="share"><span class="ico">↗️</span>Share as text</button>
      <button class="option" data-m="del" style="color:#B3473A"><span class="ico">🗑️</span>Delete stream</button>`, {
      onMount: s => s.addEventListener('click', async ev => {
        const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return;
        haptic(); await popLayer();
        if (m === 'rename') A.renameStream();
        if (m === 'drafts') go('drafts', { id: st.id });
        if (m === 'share') shareText(st.title, st.entries.map(e => (e.q ? `${e.q}\n` : '') + e.text).join('\n\n'));
        if (m === 'del') {
          if (st.entries.length && !(await ask('Delete this stream?', 'All thoughts, recordings and drafts in it will be removed.', 'Delete'))) return;
          const undo = deleteStream(st); await popLayer();
          toast('Stream deleted.', () => { undo(); refresh(); });
        }
      })
    });
  },
  questions() {
    const st = curStream();
    go('questions', { id: st.id, seed: 0 });
  },
  moreQuestions() { const p = screens.at(-1).params; p.seed = (p.seed || 0) + 3; refresh(); },
  async answerVoice(i) {
    const p = screens.at(-1).params, st = getStream(p.id);
    const q = questionList(p, st)[+i];
    const res = await record({ title: 'Recording', question: q.q });
    if (!res) return;
    await addVoice(st, res, q.q); await popLayer(); toast('Added to your stream.');
  },
  async answerText(i) {
    const p = screens.at(-1).params, st = getStream(p.id);
    const q = questionList(p, st)[+i];
    const t = await textSheet({ title: q.q, sub: q.ctx, placeholder: 'Type your answer…' });
    if (!t) return;
    addEntry(st, { type: 'text', text: t, q: q.q }); await popLayer(); toast('Added to your stream.');
  },
  draftSheet() {
    const st = curStream();
    if (!st.entries.some(e => (e.text || '').trim())) return toast('Add a few thoughts first — then I can draft from them.');
    sheet(`<div class="sheet-icon">${I.sparkle}</div><h2 style="text-align:center;margin-bottom:16px">Generate draft</h2>
      ${S.prefs.presets.map(p => `<button class="option" data-p="${p.id}"><span class="ico">${esc(p.icon)}</span>${esc(p.name)}</button>`).join('')}
      <button class="option" data-p="__edit"><span class="ico">⚙️</span>Edit presets</button>
      <div class="or">or</div>
      <form id="cf"><input class="field" id="custom" placeholder="✎  something else..." enterkeyhint="go" aria-label="Describe another kind of draft"></form>`, {
      onMount: s => {
        s.addEventListener('click', async ev => {
          const id = ev.target.closest('[data-p]')?.dataset.p; if (!id) return;
          haptic(); await popLayer();
          id === '__edit' ? go('presets') : generateDraft(st, id);
        });
        s.querySelector('#cf').onsubmit = async ev => { ev.preventDefault(); const c = s.querySelector('#custom').value.trim(); if (!c) return; await popLayer(); generateDraft(st, null, c); };
      }
    });
  },
  editDraft() {
    const p = screens.at(-1).params;
    if (p.editing) { p.draft.title = $('#dTitle').value.trim() || p.draft.title; p.draft.body = $('#dBody').value; }
    p.editing = !p.editing; refresh();
  },
  async saveDraft() {
    const p = screens.at(-1).params, st = getStream(p.id);
    if (p.editing) A.editDraft();
    st.drafts = st.drafts || [];
    if (p.draftId) Object.assign(st.drafts.find(d => d.id === p.draftId), p.draft);
    else st.drafts.unshift({ id: uid(), presetId: p.presetId, custom: p.custom, ...p.draft, ts: Date.now() });
    save(); await popLayer(); toast(p.draftId ? 'Draft updated.' : 'Draft saved. Find it under ••• → Drafts.');
  },
  shareDraft() { const p = screens.at(-1).params; shareText(p.draft.title, p.draft.title + '\n\n' + p.draft.body.replace(/^## /gm, '')); },
  async deleteDraft() {
    const p = screens.at(-1).params, st = getStream(p.id);
    const i = st.drafts.findIndex(d => d.id === p.draftId); const [d] = st.drafts.splice(i, 1); save(); await popLayer(); refresh();
    toast('Draft deleted.', () => { st.drafts.splice(i, 0, d); save(); refresh(); });
  },
  openDraft(v) {
    const st = curStream(); const d = st.drafts.find(x => x.id === v);
    go('draft', { id: st.id, draftId: d.id, presetId: d.presetId, custom: d.custom, stage: 'view', draft: { title: d.title, body: d.body } });
  },
  async addPreset() {
    const name = await textSheet({ title: 'New preset', sub: 'What should Reclaim turn your thoughts into?', placeholder: 'e.g. Poem, Speech for a friend’s wedding', ok: 'Add' });
    if (!name) return;
    S.prefs.presets.push({ id: uid(), name, icon: '✨', kind: 'customNamed' }); save(); refresh();
  },
  deletePreset(v) {
    const i = S.prefs.presets.findIndex(p => p.id === v); const [p] = S.prefs.presets.splice(i, 1); save(); refresh();
    toast('Preset removed.', () => { S.prefs.presets.splice(i, 0, p); save(); refresh(); });
  },
  resetPresets() { S.prefs.presets = DEFAULT_PRESETS.map(p => ({ ...p })); save(); refresh(); toast('Defaults restored.'); },
  // Companion
  sendChat() { const t = $('#chatInput'); sendChat(t.value); },
  quickSay: v => sendChat(v),
  stopReply() { chatPending?.controller.abort(); },
  feedback(v) {
    const [id, rating] = v.split(':'); const c = currentConvo(); const m = c.messages.find(x => x.id === id);
    m.rating = rating; save(); refresh();
    apiFetch('/v1/chat/feedback', { conversation_id: c.id, message_id: id, rating }).catch(() => {});
  },
  retryChat(id) { const c = currentConvo(); const i = c.messages.findIndex(m => m.id === id); const [m] = c.messages.splice(i, 1); save(); reply(c, m.retryText); },
  offlineReply(id) {
    const c = currentConvo(); const m = c.messages.find(x => x.id === id);
    const r = localReply(m.retryText, companionCtx); Object.assign(m, { state: 'sent', content: r.content, actions: r.actions }); save(); refresh();
  },
  convoMenu() {
    sheet(`<h2>Conversation</h2><p class="muted small">Conversations are stored only on this phone.</p>
      <button class="option" data-m="new"><span class="ico">✨</span>New conversation</button>
      <button class="option" data-m="del" style="color:#B3473A"><span class="ico">🗑️</span>Delete this conversation</button>`, {
      onMount: s => s.addEventListener('click', async ev => {
        const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return;
        await popLayer(); chatPending?.controller.abort();
        if (m === 'new') { S.ui.convoId = null; save(); refresh(); }
        if (m === 'del') {
          const c = currentConvo(false); if (!c) return;
          S.convos = S.convos.filter(x => x !== c); S.ui.convoId = null; save(); refresh();
          if (S.prefs.apiUrl) apiFetch(`/v1/conversations/${c.id}`, null, null, 'DELETE').catch(() => {}); // best-effort server delete
          toast('Conversation deleted.');
        }
      })
    });
  },
  record: () => A.quickRecord(),
  journal: async () => { await A.jumpTab('life:journal'); A.newStream(); },
  // My Life
  editMemory: v => editMemory(v),
  editPerson: v => editPerson(v),
  reachedOut(v) { const p = S.people.find(x => x.id === v); const prev = p.last; p.last = Date.now(); save(); refresh(); toast(`Lovely. Hope it was good to talk to ${p.name}.`, () => { p.last = prev; save(); refresh(); }); },
  starters() { sheet(`<h2>Conversation starters</h2><p class="muted small">Tap one to copy it.</p>${STARTERS.map(s => `<button class="option" data-s="${esc(s)}" style="font-weight:400">${esc(s)}</button>`).join('')}`, { onMount: s => s.addEventListener('click', ev => { const t = ev.target.closest('[data-s]'); if (t) navigator.clipboard?.writeText(t.dataset.s.replace(/[“”]/g, '')).then(() => toast('Copied.')); }) }); },
  editProject: () => editProject(),
  viewProject: v => viewProject(v),
  // Settings
  theme(v) { S.prefs.theme = v; save(); applyTheme(); refresh(); },
  async testApi() {
    S.prefs.apiUrl = $('#setApi').value.trim(); save();
    if (!S.prefs.apiUrl) return toast('No server set — on-device replies are used.');
    try { await apiFetch('/v1/health'); toast('Connected.'); } catch { toast('Could not reach that server.'); }
  },
  exportData() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reclaim-backup-${dayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  async clearMemories() { if (await ask('Clear all memories?', 'This cannot be undone.', 'Clear')) { S.memories = []; save(); toast('Memories cleared.'); } },
  async clearConvos() {
    if (!(await ask('Delete all conversations?', 'This cannot be undone.', 'Delete'))) return;
    if (S.prefs.apiUrl) S.convos.forEach(c => apiFetch(`/v1/conversations/${c.id}`, null, null, 'DELETE').catch(() => {}));
    S.convos = []; S.ui.convoId = null; save(); toast('Conversations deleted.');
  },
  async wipe() {
    if (!(await ask('Delete everything?', 'All journal streams, recordings, memories, people, projects and settings will be erased from this phone.', 'Delete everything'))) return;
    localStorage.removeItem(KEY); await idb.clear().catch(() => {}); location.replace(location.pathname);
  }
};

function shareText(title, text) {
  if (navigator.share) navigator.share({ title, text }).catch(() => {});
  else navigator.clipboard?.writeText(text).then(() => toast('Copied to clipboard.'));
}
function applyTheme() {
  const t = S.prefs.theme;
  t === 'system' ? document.documentElement.removeAttribute('data-theme') : (document.documentElement.dataset.theme = t);
}

/* ---------------- Global listeners ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  haptic(); fn(el.dataset.v, el, e);
});
const grow = t => { t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; };
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'thought') { grow(t); $('#composer').classList.toggle('typing', !!t.value.trim()); }
  if (t.id === 'chatInput') grow(t);
  if (t.id === 'streamSearch') { S.ui.q = t.value; $('#streamList').innerHTML = streamList(); }
  if (t.id === 'setName') { S.prefs.name = t.value.trim(); save(); }
  if (t.id === 'setApi') { S.prefs.apiUrl = t.value.trim(); save(); }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); A.sendChat(); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'importFile') return;
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.streams) || !d.prefs) throw 0;
    if (!(await ask('Replace your data with this backup?', 'Everything currently on this phone will be replaced.', 'Import', false))) return;
    S = { ...fresh(), ...d, prefs: { ...fresh().prefs, ...d.prefs }, ui: { ...fresh().ui, ...d.ui } }; save(); applyTheme(); refresh(); toast('Backup imported.');
  } catch { toast('That file is not a Reclaim backup.'); }
});
addEventListener('online', () => S.ui.tab === 'companion' && !screens.length && refresh());
addEventListener('offline', () => S.ui.tab === 'companion' && !screens.length && refresh());

// App open / close transitions.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { document.body.classList.add('leaving'); stopPlayer(); }
  else { document.body.classList.remove('leaving'); document.body.classList.remove('opening'); void document.body.offsetWidth; document.body.classList.add('opening'); }
});

/* ---------------- Boot ---------------- */
applyTheme();
S.ui.tab = 'today'; // every launch starts calm, on Today
history.replaceState({ n: 0 }, '');
fetch('activities.json').then(r => r.json()).then(d => { INTERESTS = d.topics; ACTIVITIES = d.activities; }).catch(() => {
  document.body.insertAdjacentHTML('beforeend', '<p class="empty">Could not load activities. Check your connection and reopen Reclaim.</p>');
}).finally(boot);
function boot() {
$('#app').innerHTML = render(); afterRender('none');
document.body.classList.add('opening');
setTimeout(() => {
  $('#splash').classList.add('gone');
  const goTo = new URLSearchParams(location.search).get('go');
  if (goTo && S.onboarded) { history.replaceState({ n: 0 }, '', location.pathname); goTo === 'pause' ? mindfulPause() : goTo === 'record' && A.quickRecord(); }
}, reduced ? 0 : 750);
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
