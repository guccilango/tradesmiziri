/* Trade Ledger — app.js */
(() => {
'use strict';
const CFG = window.TRADE_CONFIG || {};
const ONLINE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (n, d = 2) => isFinite(n) ? (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('pt-BR', { maximumFractionDigits: d }) : '—';
const sgn = n => (n > 0 ? '+' : '') + fmt(n);
const cls = n => n > 0.0001 ? 'pos' : n < -0.0001 ? 'neg' : 'mut';
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
}

/* ---------- default items ---------- */
const BASE = 'bait', LC = 'lc', MC = 'mc';
const DEFAULT_ITEMS = () => [
  { id: BASE, name: 'Legendary Fish Bait', short: 'Leg Bait', emoji: '🎣', img: '', base: true, buy: { amt: 1, ref: BASE }, sell: { amt: 1, ref: BASE } },
  { id: LC, name: 'Legendary Fruit Chest', short: 'LC', emoji: '📦', img: '', buy: { amt: 75, ref: BASE }, sell: { amt: 100, ref: BASE } },
  { id: MC, name: 'Mythical Fruit Chest', short: 'MC', emoji: '🎁', img: '', buy: { amt: 10, ref: LC }, sell: { amt: 10, ref: LC } },
  { id: 'pika', name: 'Pika', short: 'Pika', emoji: '⚡', img: '', buy: { amt: 150, ref: BASE }, sell: { amt: 2.5, ref: LC } },
];

/* ---------- economy ---------- */
// Valor unitário de um item em Leg Bait. side: 'buy' | 'sell'. A referência usa o MESMO lado.
function unitValue(items, id, side, seen = new Set()) {
  const it = items.find(i => i.id === id);
  if (!it) return NaN;
  if (it.base) return 1;
  if (seen.has(id)) return NaN;               // ciclo
  const p = it[side];
  if (!p || !p.ref) return NaN;
  const s = new Set(seen); s.add(id);
  return Number(p.amt) * unitValue(items, p.ref, side, s);
}
// Converte um valor em Leg Bait para as 3 unidades (pelo lado)
function conv(items, v, side) {
  const lc = unitValue(items, LC, side);
  const LCv = v / lc;
  return { bait: v, lc: LCv, mc: LCv / 10 };
}
function chips(items, v, side) {
  if (!isFinite(v)) return '<span class="chip">valor inválido</span>';
  const c = conv(items, v, side);
  return `<span class="chip"><b>${fmt(c.bait)}</b> Leg Bait</span><span class="chip"><b>${fmt(c.lc)}</b> LC</span><span class="chip"><b>${fmt(c.mc, 3)}</b> MC</span>`;
}
function iconHTML(it, sm) {
  return `<div class="ico ${sm ? 'sm' : ''}">${it.img ? `<img src="${esc(it.img)}" alt="">` : esc(it.emoji || '🎲')}</div>`;
}
// Avalia uma trade: recebe = preço de VENDA (o que realizo), dá = preço de COMPRA (o que custa repor)
function evalTrade(items, give, recv) {
  const gv = Object.entries(give).reduce((a, [id, q]) => a + q * unitValue(items, id, 'buy'), 0);
  const rv = Object.entries(recv).reduce((a, [id, q]) => a + q * unitValue(items, id, 'sell'), 0);
  const profit = rv - gv;
  return { give: gv, recv: rv, profit, margin: gv > 0 ? profit / gv : (rv > 0 ? 1 : 0) };
}

/* ---------- data layer ---------- */
const hash = async (u, p) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tl:' + u.toLowerCase() + ':' + p));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };

const LocalAPI = {
  mode: 'local',
  async session() { const s = LS.get('tl_session', null); return s && LS.get('tl_users', {})[s] ? { id: s, name: s } : null; },
  async signup(u, p) {
    const users = LS.get('tl_users', {}); const k = u.toLowerCase();
    if (users[k]) throw new Error('Esse usuário já existe.');
    users[k] = await hash(u, p); LS.set('tl_users', users); LS.set('tl_session', k); return { id: k, name: k };
  },
  async login(u, p) {
    const users = LS.get('tl_users', {}); const k = u.toLowerCase();
    if (!users[k] || users[k] !== await hash(u, p)) throw new Error('Usuário ou senha incorretos.');
    LS.set('tl_session', k); return { id: k, name: k };
  },
  async logout() { localStorage.removeItem('tl_session'); },
  async listItems() { let i = LS.get('tl_items', null); if (!i) { i = DEFAULT_ITEMS(); LS.set('tl_items', i); } return i; },
  async saveItem(it) { const l = await this.listItems(); const i = l.findIndex(x => x.id === it.id); i >= 0 ? l[i] = it : l.push(it); LS.set('tl_items', l); },
  async deleteItem(id) { LS.set('tl_items', (await this.listItems()).filter(x => x.id !== id)); },
  async listTrades(user) { return LS.get('tl_trades', []).filter(t => t.user === user.id).sort((a, b) => b.ts - a.ts); },
  async addTrade(t) { const l = LS.get('tl_trades', []); l.push(t); LS.set('tl_trades', l); },
  async deleteTrade(id) { LS.set('tl_trades', LS.get('tl_trades', []).filter(t => t.id !== id)); },
  async exportAll() { return { items: await this.listItems(), trades: LS.get('tl_trades', []) }; },
  async importAll(d, user) {
    if (d.items) LS.set('tl_items', d.items);
    if (d.trades) { const keep = LS.get('tl_trades', []).filter(t => t.user !== user.id); LS.set('tl_trades', keep.concat(d.trades.map(t => ({ ...t, user: user.id })))); }
  },
};

let sb = null;
const mail = u => `${u.toLowerCase()}@tradeledger.app`;
const OnlineAPI = {
  mode: 'online',
  async init() {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'; s.onload = res; s.onerror = () => rej(new Error('Não consegui carregar o Supabase.')); document.head.appendChild(s); });
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  },
  _u(user) { return user ? { id: user.id, name: user.user_metadata?.username || (user.email || '').split('@')[0] } : null; },
  async session() { const { data } = await sb.auth.getSession(); return this._u(data.session?.user); },
  async signup(u, p) {
    const { data, error } = await sb.auth.signUp({ email: mail(u), password: p, options: { data: { username: u } } });
    if (error) throw new Error(error.message); if (!data.session) throw new Error('Desligue "Confirm email" no Supabase (veja README).');
    return this._u(data.user);
  },
  async login(u, p) { const { data, error } = await sb.auth.signInWithPassword({ email: mail(u), password: p }); if (error) throw new Error('Usuário ou senha incorretos.'); return this._u(data.user); },
  async logout() { await sb.auth.signOut(); },
  async listItems() {
    const { data, error } = await sb.from('items').select('data'); if (error) throw error;
    if (!data.length) { const d = DEFAULT_ITEMS(); await sb.from('items').upsert(d.map(x => ({ id: x.id, data: x }))); return d; }
    return data.map(r => r.data);
  },
  async saveItem(it) { const { error } = await sb.from('items').upsert({ id: it.id, data: it, updated_at: new Date().toISOString() }); if (error) throw error; },
  async deleteItem(id) { const { error } = await sb.from('items').delete().eq('id', id); if (error) throw error; },
  async listTrades() { const { data, error } = await sb.from('trades').select('data').order('ts', { ascending: false }); if (error) throw error; return data.map(r => r.data); },
  async addTrade(t) { const { error } = await sb.from('trades').insert({ id: t.id, ts: new Date(t.ts).toISOString(), data: t }); if (error) throw error; },
  async deleteTrade(id) { const { error } = await sb.from('trades').delete().eq('id', id); if (error) throw error; },
  async exportAll() { return { items: await this.listItems(), trades: await this.listTrades() }; },
  async importAll(d) {
    if (d.items) await sb.from('items').upsert(d.items.map(x => ({ id: x.id, data: x })));
    if (d.trades) for (const t of d.trades) await sb.from('trades').upsert({ id: t.id, ts: new Date(t.ts).toISOString(), data: t });
  },
};
let API = LocalAPI;

/* ---------- state ---------- */
const S = { user: null, items: [], trades: [], view: 'dash', range: '7', q: '', give: {}, recv: {}, partner: '', note: '', hq: '' };
const item = id => S.items.find(i => i.id === id);
const nm = it => it ? it.name : '(item removido)';

async function reload() {
  S.items = await API.listItems();
  S.trades = await API.listTrades(S.user);
}

/* ---------- render ---------- */
const root = $('#app');
function render() {
  if (!S.user) return renderAuth();
  const tabs = [['dash', '📊 Dashboard'], ['trade', '⚔️ Nova Trade'], ['hist', '📜 Histórico'], ['items', '🎒 Itens'], ['cfg', '⚙️ Config']];
  root.innerHTML = `<div class="shell">
    <div class="top">
      <div class="brand">⚔️ <i>Trade Ledger</i></div>
      <div class="nav">${tabs.map(([k, l]) => `<button data-act="nav" data-v="${k}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="sp"></div>
      <span class="badge ${ONLINE ? 'online' : ''}">${ONLINE ? '● online' : 'modo local'}</span>
      <div class="userbox"><div class="avatar">${esc(S.user.name[0].toUpperCase())}</div><b>${esc(S.user.name)}</b><button class="btn sm" data-act="logout">Sair</button></div>
    </div>
    <div id="view"></div></div>`;
  renderView();
}
function renderView() {
  const v = $('#view'); if (!v) return;
  ({ dash: viewDash, trade: viewTrade, hist: viewHist, items: viewItems, cfg: viewCfg })[S.view](v);
}

/* ----- auth ----- */
let authMode = 'login';
function renderAuth(err = '') {
  root.innerHTML = `<div class="auth"><div class="card authbox">
    <div class="logo">⚔️</div><h1>Trade Ledger</h1>
    <p class="mut" style="text-align:center;margin:0 0 16px">Seu caderno de trades — tudo convertido em Leg Bait, LC e MC.</p>
    <div class="seg" style="width:100%;margin-bottom:14px"><button style="flex:1" data-act="authmode" data-v="login" class="${authMode === 'login' ? 'on' : ''}">Entrar</button><button style="flex:1" data-act="authmode" data-v="signup" class="${authMode === 'signup' ? 'on' : ''}">Criar conta</button></div>
    <form id="authform">
      <div class="field"><label>Usuário</label><input name="u" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.\\-]+" title="Letras, números, _ . -"></div>
      <div class="field"><label>Senha</label><input name="p" type="password" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required minlength="6"></div>
      <div class="neg" id="autherr" style="min-height:18px;margin-bottom:8px">${esc(err)}</div>
      <button class="btn pri" style="width:100%">${authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
    </form>
    <p class="mut" style="text-align:center;font-size:12px;margin:14px 0 0">${ONLINE ? 'Conta online: seus dados ficam salvos na nuvem.' : 'Modo local: contas e dados ficam neste navegador.'}</p>
  </div></div>`;
}

/* ----- dashboard ----- */
function rangeTrades() {
  if (S.range === 'all') return S.trades;
  const days = +S.range; const start = new Date(); start.setHours(0, 0, 0, 0);
  if (days > 1) start.setDate(start.getDate() - (days - 1));
  return S.trades.filter(t => t.ts >= start.getTime());
}
function viewDash(v) {
  const inR = rangeTrades(), today = S.trades.filter(t => dayKey(t.ts) === dayKey(Date.now()));
  const sum = a => a.reduce((x, t) => x + t.profit, 0);
  const pr = sum(inR), pt = sum(today), wins = inR.filter(t => t.profit > 0).length;
  const best = inR.reduce((b, t) => (!b || t.profit > b.profit ? t : b), null);
  const k = (lbl, big, sub, c = '') => `<div class="card stat"><div class="lbl">${lbl}</div><div class="big ${c}">${big}</div><div class="sub">${sub}</div></div>`;
  const cv = x => { const c = conv(S.items, x, 'sell'); return `${fmt(c.lc)} LC · ${fmt(c.mc, 3)} MC`; };
  // chart: últimos N dias
  const n = S.range === '1' ? 7 : S.range === 'all' ? 14 : Math.max(+S.range, 7), days = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
  const by = Object.fromEntries(days.map(d => [d, 0])); S.trades.forEach(t => { const d = dayKey(t.ts); if (d in by) by[d] += t.profit; });
  const mx = Math.max(1, ...days.map(d => Math.abs(by[d])));
  const bars = days.map(d => { const val = by[d], h = Math.abs(val) / mx * 100; return `<div class="col"><div class="tip">${d.slice(5).replace('-', '/')}: ${sgn(val)}</div>
    <div class="pos-half">${val > 0 ? `<div class="bar" style="height:${h}%;background:linear-gradient(var(--ok),#10b98166)"></div>` : ''}</div>
    <div class="neg-half">${val < 0 ? `<div class="bar" style="height:${h}%;background:linear-gradient(#f8717166,var(--bad))"></div>` : ''}</div>
    ${n <= 14 ? `<span class="d">${d.slice(8)}</span>` : ''}</div>`; }).join('');
  // top items (por frequência recebida)
  const cnt = {}; inR.forEach(t => t.recv.forEach(r => cnt[r.id] = (cnt[r.id] || 0) + r.qty));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  v.innerHTML = `
  <div class="row wrap" style="margin-bottom:14px"><h2>Dashboard</h2><div class="sp"></div>
    <div class="seg">${[['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['all', 'Tudo']].map(([r, l]) => `<button data-act="range" data-v="${r}" class="${S.range === r ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button class="btn pri" data-act="nav" data-v="trade">+ Nova trade</button></div>
  <div class="grid g4">
    ${k('Lucro hoje', sgn(pt) + ' <small class="mut" style="font-size:13px">Leg Bait</small>', cv(pt) + ` · ${today.length} trade(s)`, cls(pt))}
    ${k('Lucro no período', sgn(pr) + ' <small class="mut" style="font-size:13px">Leg Bait</small>', cv(pr), cls(pr))}
    ${k('Trades no período', inR.length, inR.length ? `${fmt(wins / inR.length * 100, 0)}% positivas (${wins}/${inR.length})` : 'nenhuma ainda')}
    ${k('Melhor trade', best ? sgn(best.profit) : '—', best ? `${esc(best.partner || 'sem parceiro')} · ${new Date(best.ts).toLocaleDateString('pt-BR')}` : '', best ? cls(best.profit) : '')}
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>📈 Lucro por dia <span class="mut" style="font-weight:400">(Leg Bait)</span></h3><div class="chart" style="margin-bottom:18px">${bars}</div></div>
    <div class="card"><h3>🏆 Itens mais recebidos</h3>${top.length ? top.map(([id, q]) => `<div class="line">${iconHTML(item(id) || {}, true)}<div class="grow"><b>${esc(nm(item(id)))}</b></div><span class="chip"><b>${fmt(q, 2)}</b> un</span></div>`).join('') : '<div class="empty">Registre trades para ver estatísticas.</div>'}</div>
  </div>
  <div class="card" style="margin-top:14px"><h3>🕒 Últimas trades</h3>${tradeTable(S.trades.slice(0, 6), false)}</div>`;
}

/* ----- trade builder ----- */
function viewTrade(v) {
  v.innerHTML = `<div class="grid g2" style="grid-template-columns:1fr 1.15fr">
    <div class="card"><h3>🎒 Escolha os itens <span class="mut" style="font-weight:400">(clique)</span></h3>
      <input id="pq" placeholder="Buscar item…" value="${esc(S.q)}" style="margin-bottom:10px">
      <div class="pick" id="pick"></div></div>
    <div class="grid" style="align-content:start">
      <div class="grid g21">
        <div class="side give"><h3 class="neg">⬆ Eu DOU</h3><div id="give"></div></div>
        <div class="side recv"><h3 class="pos">⬇ Eu RECEBO</h3><div id="recv"></div></div>
      </div>
      <div id="verdict"></div>
      <div class="card"><div class="grid g21"><div><label>Com quem? (opcional)</label><input id="partner" value="${esc(S.partner)}" placeholder="nick do jogador"></div>
      <div><label>Nota (opcional)</label><input id="note" value="${esc(S.note)}" placeholder="ex: trade rápida"></div></div>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="clear">Limpar</button><div class="sp"></div><button class="btn ok" id="savetrade" data-act="savetrade">✔ Registrar trade</button></div></div>
    </div></div>`;
  fillPick(); fillSides();
}
function fillPick() {
  const q = S.q.toLowerCase(); const el = $('#pick'); if (!el) return;
  const l = S.items.filter(i => !q || (i.name + ' ' + (i.short || '')).toLowerCase().includes(q));
  el.innerHTML = l.map(i => `<div class="pk"><div class="nm">${iconHTML(i, true)}<span>${esc(i.short || i.name)}</span></div>
    <div class="mut" style="font-size:11px">compra ${fmt(unitValue(S.items, i.id, 'buy'))} · venda ${fmt(unitValue(S.items, i.id, 'sell'))}</div>
    <div class="two"><button class="give" data-act="add" data-side="give" data-id="${i.id}">⬆ Dou</button><button class="recv" data-act="add" data-side="recv" data-id="${i.id}">⬇ Recebo</button></div></div>`).join('') || '<div class="empty">Nenhum item.</div>';
}
function sideHTML(side) {
  const e = Object.entries(S[side]);
  if (!e.length) return '<div class="empty" style="padding:14px">Clique em “' + (side === 'give' ? 'Dou' : 'Recebo') + '” num item</div>';
  return e.map(([id, q]) => { const it = item(id), uv = unitValue(S.items, id, side === 'give' ? 'buy' : 'sell'); return `<div class="line">${iconHTML(it || {}, true)}
    <div class="grow"><b>${esc(nm(it))}</b><span class="mut" style="font-size:11px">${fmt(uv)} cada = ${fmt(uv * q)}</span></div>
    <div class="qty"><button data-act="qty" data-side="${side}" data-id="${id}" data-d="-1">−</button><input type="number" min="0" step="any" value="${q}" data-qty="${side}|${id}"><button data-act="qty" data-side="${side}" data-id="${id}" data-d="1">+</button></div>
    <button class="btn sm danger" data-act="rm" data-side="${side}" data-id="${id}">✕</button></div>`; }).join('');
}
function fillSides() { const g = $('#give'); if (!g) return; g.innerHTML = sideHTML('give'); $('#recv').innerHTML = sideHTML('recv'); fillVerdict(); }
function fillVerdict() {
  const el = $('#verdict'); if (!el) return;
  const hasG = Object.keys(S.give).length, hasR = Object.keys(S.recv).length;
  const btn = $('#savetrade'); if (btn) btn.disabled = !(hasG && hasR);
  if (!hasG && !hasR) { el.innerHTML = '<div class="verdict none">Adicione itens dos dois lados para ver se a trade vale a pena.</div>'; return; }
  const e = evalTrade(S.items, S.give, S.recv);
  if (!isFinite(e.profit)) { el.innerHTML = '<div class="verdict bad">Algum item tem preço inválido (referência circular ou item removido). Edite em 🎒 Itens.</div>'; return; }
  const m = e.margin * 100, c = !hasG || !hasR ? 'none' : m >= 10 ? 'good' : m > 0.5 ? 'good' : m >= -0.5 ? 'mid' : 'bad';
  const label = !hasG || !hasR ? 'Falta um lado' : m >= 10 ? '🔥 Vale MUITO a pena' : m > 0.5 ? '✅ Vale a pena' : m >= -0.5 ? '😐 Empate' : '❌ Não vale a pena';
  const brk = conv(S.items, e.give, 'sell');
  el.innerHTML = `<div class="verdict ${c}"><div style="font-weight:700;margin-bottom:4px">${label}</div>
    <div class="big ${cls(e.profit)}">${sgn(e.profit)} Leg Bait</div>
    <div class="mut">${fmt(conv(S.items, e.profit, 'sell').lc)} LC · ${fmt(conv(S.items, e.profit, 'sell').mc, 3)} MC · margem ${sgn(m).replace('.', ',')}%</div>
    <div class="grid g21" style="margin-top:12px;text-align:left"><div class="preview">Custo do que dou (preço compra)<br><b class="neg">${fmt(e.give)}</b> Leg Bait<div class="chips" style="margin-top:5px">${chips(S.items, e.give, 'buy')}</div></div>
    <div class="preview">Valor do que recebo (preço venda)<br><b class="pos">${fmt(e.recv)}</b> Leg Bait<div class="chips" style="margin-top:5px">${chips(S.items, e.recv, 'sell')}</div></div></div>
    ${hasG && e.profit < 0 ? `<div class="mut" style="margin-top:10px;font-size:12px">Para empatar, peça pelo menos <b>${fmt(e.give)}</b> Leg Bait (≈ ${fmt(brk.lc)} LC) em valor de venda.</div>` : ''}</div>`;
}

/* ----- history ----- */
function tradeTable(list, withDel = true) {
  if (!list.length) return '<div class="empty">Nenhuma trade registrada ainda.</div>';
  const side = a => `<div class="tlist">${a.map(x => `<span>${fmt(x.qty, 2)}× ${esc(x.name)}</span>`).join('')}</div>`;
  return `<div style="overflow:auto"><table><thead><tr><th>Quando</th><th>Dei</th><th>Recebi</th><th>Lucro</th><th>Com</th>${withDel ? '<th></th>' : ''}</tr></thead><tbody>
  ${list.map(t => { const d = new Date(t.ts); return `<tr><td style="white-space:nowrap">${d.toLocaleDateString('pt-BR')}<br><span class="mut">${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></td>
    <td>${side(t.give)}<div class="mut" style="font-size:11px">custo ${fmt(t.giveValue)}</div></td><td>${side(t.recv)}<div class="mut" style="font-size:11px">valor ${fmt(t.recvValue)}</div></td>
    <td><b class="${cls(t.profit)}">${sgn(t.profit)}</b><div class="mut" style="font-size:11px">${fmt(t.profit / (unitValue(S.items, LC, 'sell') || 100))} LC</div></td>
    <td>${esc(t.partner || '—')}${t.note ? `<div class="mut" style="font-size:11px">${esc(t.note)}</div>` : ''}</td>
    ${withDel ? `<td><button class="btn sm danger" data-act="deltrade" data-id="${t.id}" title="Apagar">🗑</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
}
function viewHist(v) {
  const q = S.hq.toLowerCase();
  const l = S.trades.filter(t => !q || JSON.stringify([t.partner, t.note, t.give.map(x => x.name), t.recv.map(x => x.name)]).toLowerCase().includes(q));
  const tot = l.reduce((a, t) => a + t.profit, 0);
  // agrupa por dia
  const days = {}; l.forEach(t => (days[dayKey(t.ts)] ||= []).push(t));
  v.innerHTML = `<div class="row wrap" style="margin-bottom:14px"><h2>Histórico</h2><div class="sp"></div><input id="hq" placeholder="Buscar por item, parceiro, nota…" value="${esc(S.hq)}" style="max-width:300px"></div>
  <div class="card" style="margin-bottom:14px"><span class="mut">${l.length} trade(s) · lucro total </span><b class="${cls(tot)}">${sgn(tot)} Leg Bait</b></div>
  ${Object.keys(days).length ? Object.entries(days).map(([d, ts]) => { const s = ts.reduce((a, t) => a + t.profit, 0);
    return `<div class="card" style="margin-bottom:14px"><h3>${new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}<span class="sp"></span><span class="${cls(s)}">${sgn(s)} Leg Bait · ${ts.length} trade(s)</span></h3>${tradeTable(ts)}</div>`; }).join('') : '<div class="card empty">Nada por aqui.</div>'}`;
}

/* ----- items ----- */
function viewItems(v) {
  v.innerHTML = `<div class="row wrap" style="margin-bottom:6px"><h2>Itens <span class="badge">lista global</span></h2><div class="sp"></div><button class="btn pri" data-act="newitem">+ Novo item</button></div>
  <p class="mut" style="margin:0 0 14px">Cada preço pode ser escrito em <b>qualquer item</b> como referência. <b>Compra</b> = quanto custa pra você obter · <b>Venda</b> = quanto você consegue por ele. Tudo é convertido em Leg Bait, LC e MC (1 MC = 10 LC).</p>
  <div class="items">${S.items.map(i => { const b = unitValue(S.items, i.id, 'buy'), s = unitValue(S.items, i.id, 'sell'); const rb = item(i.buy?.ref), rs = item(i.sell?.ref);
    return `<div class="item"><div class="row">${iconHTML(i)}<div class="grow" style="flex:1"><h4>${esc(i.name)}</h4><span class="mut" style="font-size:12px">${i.base ? 'item base (1 Leg Bait)' : ''}</span></div>
      <button class="btn sm" data-act="edititem" data-id="${i.id}">✏️ Editar</button></div>
      <div class="price"><span class="k">🛒 COMPRO por ${i.base ? '' : `<span class="gold">${fmt(i.buy.amt, 3)} ${esc(rb?.short || rb?.name || '?')}</span>`}</span><div class="chips">${chips(S.items, b, 'buy')}</div></div>
      <div class="price"><span class="k">💰 VENDO por ${i.base ? '' : `<span class="gold">${fmt(i.sell.amt, 3)} ${esc(rs?.short || rs?.name || '?')}</span>`}</span><div class="chips">${chips(S.items, s, 'sell')}</div></div>
      <div class="mut" style="font-size:12px">Spread: <b class="${cls(s - b)}">${sgn(s - b)}</b> Leg Bait por unidade</div></div>`; }).join('')}</div>`;
}
let editing = null;
function openItemModal(id) {
  const base = id ? item(id) : { id: uid(), name: '', short: '', emoji: '🎲', img: '', buy: { amt: 1, ref: BASE }, sell: { amt: 1, ref: BASE } };
  editing = JSON.parse(JSON.stringify(base)); editing._new = !id;
  const opts = sel => S.items.filter(i => i.id !== editing.id).map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  const priceBlock = (side, label) => editing.base ? '' : `<div class="field"><label>${label}</label><div class="priceedit"><input type="number" step="any" min="0" id="m-${side}-amt" value="${editing[side].amt}"><select id="m-${side}-ref">${opts(editing[side].ref)}</select></div><div class="preview" id="m-${side}-prev"></div></div>`;
  $('#modal-root').innerHTML = `<div class="overlay" data-act="closemodal"><div class="modal">
    <h2>${editing._new ? 'Novo item' : 'Editar item'}</h2>
    <div class="row" style="align-items:flex-start;margin-bottom:12px"><div id="m-ico">${iconHTML(editing)}</div>
      <div style="flex:1"><div class="priceedit" style="grid-template-columns:1fr 110px"><div><label>Nome</label><input id="m-name" value="${esc(editing.name)}" placeholder="ex: Pika"></div><div><label>Sigla</label><input id="m-short" value="${esc(editing.short)}" placeholder="ex: Pika" maxlength="12"></div></div>
      <div class="row wrap" style="margin-top:8px"><label class="btn sm" style="margin:0;cursor:pointer">📷 Enviar imagem<input type="file" id="m-file" accept="image/*" class="hidden"></label><input id="m-emoji" value="${esc(editing.emoji)}" style="width:70px" maxlength="4" title="emoji"><button class="btn sm danger ${editing.img ? '' : 'hidden'}" id="m-rmimg" data-act="rmimg">remover imagem</button></div></div></div>
    ${priceBlock('buy', '🛒 Preço de COMPRA (quanto custa pra eu obter)')}${priceBlock('sell', '💰 Preço de VENDA (quanto eu consigo por ele)')}
    ${editing.base ? '<p class="mut">Item base: sempre vale 1 Leg Bait. Todo o resto é calculado a partir dele.</p>' : ''}
    <div class="row" style="margin-top:16px">${!editing._new && !editing.base ? '<button class="btn danger" data-act="delitem">Excluir</button>' : ''}<div class="sp"></div><button class="btn" data-act="closemodal">Cancelar</button><button class="btn pri" data-act="saveitem">Salvar</button></div>
  </div></div>`;
  ['buy', 'sell'].forEach(s => modalPreview(s));
}
function readModal() {
  editing.name = $('#m-name').value.trim(); editing.short = $('#m-short').value.trim() || editing.name; editing.emoji = $('#m-emoji').value.trim() || '🎲';
  if (!editing.base) ['buy', 'sell'].forEach(s => { editing[s] = { amt: parseFloat($(`#m-${s}-amt`).value) || 0, ref: $(`#m-${s}-ref`).value }; });
}
function modalPreview(side) {
  const el = $(`#m-${side}-prev`); if (!el) return; readModal();
  const list = S.items.filter(i => i.id !== editing.id).concat([editing]);
  const v = unitValue(list, editing.id, side);
  el.innerHTML = isFinite(v) ? `= <div class="chips" style="display:inline-flex;vertical-align:middle">${chips(list, v, side)}</div>` : '<span class="neg">Referência circular — escolha outro item.</span>';
  $('#m-ico').innerHTML = iconHTML(editing);
}
function resizeImage(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; r.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => {
    const s = 96, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); const k = Math.max(s / im.width, s / im.height);
    x.drawImage(im, (s - im.width * k) / 2, (s - im.height * k) / 2, im.width * k, im.height * k); res(c.toDataURL('image/webp', .85)); }; im.src = r.result; }; r.readAsDataURL(file); });
}

/* ----- config ----- */
function viewCfg(v) {
  v.innerHTML = `<h2 style="margin-bottom:14px">Config</h2><div class="grid g21">
  <div class="card"><h3>💾 Backup</h3><p class="mut">Exporta a lista de itens e suas trades em um arquivo .json.</p><div class="row wrap"><button class="btn" data-act="export">⬇ Exportar</button><label class="btn" style="margin:0;cursor:pointer">⬆ Importar<input type="file" id="imp" accept=".json" class="hidden"></label></div></div>
  <div class="card"><h3>ℹ️ Sobre o cálculo</h3><p class="mut" style="margin:0">Lucro da trade = <b>valor do que recebo</b> (preços de <i>venda</i>) − <b>custo do que dou</b> (preços de <i>compra</i>). O histórico guarda uma foto dos valores da hora, então editar preços depois não muda trades antigas.</p></div>
  <div class="card"><h3>♻️ Restaurar itens padrão</h3><p class="mut">Recria Leg Bait, LC, MC e Pika com os preços iniciais (não apaga itens seus).</p><button class="btn" data-act="resetitems">Restaurar</button></div>
  </div>`;
}

/* ---------- actions ---------- */
async function guard(fn) { try { await fn(); } catch (e) { console.error(e); toast(e.message || 'Erro', 'err'); } }
const actions = {
  nav: el => { S.view = el.dataset.v; render(); },
  range: el => { S.range = el.dataset.v; renderView(); },
  authmode: el => { authMode = el.dataset.v; renderAuth(); },
  logout: () => guard(async () => { await API.logout(); S.user = null; render(); }),
  add: el => { const { side, id } = el.dataset; S[side][id] = (S[side][id] || 0) + 1; fillSides(); },
  qty: el => { const { side, id, d } = el.dataset; const q = (S[side][id] || 0) + +d; q <= 0 ? delete S[side][id] : S[side][id] = q; fillSides(); },
  rm: el => { delete S[el.dataset.side][el.dataset.id]; fillSides(); },
  clear: () => { S.give = {}; S.recv = {}; S.partner = ''; S.note = ''; renderView(); },
  savetrade: () => guard(async () => {
    const e = evalTrade(S.items, S.give, S.recv); if (!isFinite(e.profit)) throw new Error('Preço inválido em algum item.');
    const line = side => Object.entries(S[side]).map(([id, qty]) => ({ id, qty, name: nm(item(id)), unit: unitValue(S.items, id, side === 'give' ? 'buy' : 'sell') }));
    const t = { id: uid(), user: S.user.id, ts: Date.now(), give: line('give'), recv: line('recv'), giveValue: e.give, recvValue: e.recv, profit: e.profit, partner: S.partner.trim(), note: S.note.trim() };
    await API.addTrade(t); S.trades.unshift(t); S.give = {}; S.recv = {}; S.partner = ''; S.note = '';
    toast(`Trade registrada: ${sgn(t.profit)} Leg Bait`, t.profit >= 0 ? 'ok' : ''); S.view = 'dash'; render();
  }),
  deltrade: el => guard(async () => { if (!confirm('Apagar esta trade?')) return; await API.deleteTrade(el.dataset.id); S.trades = S.trades.filter(t => t.id !== el.dataset.id); renderView(); toast('Trade apagada'); }),
  newitem: () => openItemModal(null),
  edititem: el => openItemModal(el.dataset.id),
  closemodal: () => { $('#modal-root').innerHTML = ''; editing = null; },
  rmimg: () => { editing.img = ''; $('#m-rmimg').classList.add('hidden'); modalPreview('buy'); if (editing.base) $('#m-ico').innerHTML = iconHTML(editing); },
  saveitem: () => guard(async () => {
    readModal(); if (!editing.name) throw new Error('Dê um nome ao item.');
    const list = S.items.filter(i => i.id !== editing.id).concat([editing]);
    if (!editing.base && (!isFinite(unitValue(list, editing.id, 'buy')) || !isFinite(unitValue(list, editing.id, 'sell')))) throw new Error('Preço inválido ou referência circular.');
    const { _new, ...clean } = editing; await API.saveItem(clean);
    const i = S.items.findIndex(x => x.id === clean.id); i >= 0 ? S.items[i] = clean : S.items.push(clean);
    actions.closemodal(); renderView(); toast('Item salvo', 'ok');
  }),
  delitem: () => guard(async () => {
    const id = editing.id; const users = S.items.filter(i => i.id !== id && (i.buy?.ref === id || i.sell?.ref === id));
    if (users.length) throw new Error('Usado como referência por: ' + users.map(u => u.name).join(', '));
    if (!confirm('Excluir este item? Trades antigas continuam no histórico.')) return;
    await API.deleteItem(id); S.items = S.items.filter(i => i.id !== id); delete S.give[id]; delete S.recv[id]; actions.closemodal(); renderView(); toast('Item excluído');
  }),
  export: () => guard(async () => { const d = await API.exportAll(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })); a.download = `trade-ledger-${dayKey(Date.now())}.json`; a.click(); }),
  resetitems: () => guard(async () => { for (const d of DEFAULT_ITEMS()) await API.saveItem(d); await reload(); renderView(); toast('Itens padrão restaurados', 'ok'); }),
};

document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || (el.classList.contains('overlay') && e.target !== el)) return; actions[el.dataset.act]?.(el, e); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'pq') { S.q = t.value; fillPick(); }
  else if (t.id === 'hq') { S.hq = t.value; const pos = t.selectionStart; renderView(); const n = $('#hq'); n.focus(); n.setSelectionRange(pos, pos); }
  else if (t.id === 'partner') S.partner = t.value;
  else if (t.id === 'note') S.note = t.value;
  else if (t.dataset.qty) { const [side, id] = t.dataset.qty.split('|'); const q = parseFloat(t.value); if (q > 0) { S[side][id] = q; fillVerdict(); } }
  else if (t.id?.startsWith('m-') && editing) { modalPreview('buy'); modalPreview('sell'); if (editing.base) $('#m-ico').innerHTML = iconHTML((readModal(), editing)); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.qty) { const [side, id] = t.dataset.qty.split('|'); if (!(parseFloat(t.value) > 0)) delete S[side][id]; fillSides(); }
  else if (t.id === 'm-file' && t.files[0]) guard(async () => { readModal(); editing.img = await resizeImage(t.files[0]); $('#m-rmimg').classList.remove('hidden'); $('#m-ico').innerHTML = iconHTML(editing); });
  else if (t.id === 'imp' && t.files[0]) guard(async () => { const d = JSON.parse(await t.files[0].text()); await API.importAll(d, S.user); await reload(); renderView(); toast('Backup importado', 'ok'); });
  else if (t.id?.startsWith('m-') && editing) { modalPreview('buy'); modalPreview('sell'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) actions.closemodal(); });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'authform') return; e.preventDefault();
  const f = new FormData(e.target), u = f.get('u').trim(), p = f.get('p');
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try { S.user = authMode === 'login' ? await API.login(u, p) : await API.signup(u, p); await reload(); S.view = 'dash'; render(); }
  catch (err) { renderAuth(err.message); }
});

/* ---------- boot ---------- */
(async () => {
  root.innerHTML = '<div class="auth"><div class="mut">Carregando…</div></div>';
  try {
    if (ONLINE) { await OnlineAPI.init(); API = OnlineAPI; }
    S.user = await API.session(); if (S.user) await reload();
  } catch (e) { console.error(e); toast(e.message, 'err'); }
  render();
})();
})();
