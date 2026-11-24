// Token Radar radar-2 dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, chain/category/signal filters, a per-protocol detail drawer whose implied value it
// recomputes from the snapshot figures, and the live-token set aside. No network, no framework.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', signal: 'all', wl: false, growing: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd';
  }
  // The model, recomputed in the page: same constants data.js carries, same arithmetic as lib/model.ts.
  function catMult(row, m) {
    if (row.category === null || row.category === undefined) return m.category_none;
    var v = m.category_multiples[row.category];
    return v === undefined ? m.category_default : v;
  }
  function impliedOf(row, m) {
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d == null ? 0 : row.change_7d));
    var gm = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days == null ? m.unknown_age_days : row.age_days;
    var mm = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var cm = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_bonus_max_extra) * m.chain_bonus_per;
    return Math.max(1, Math.round(row.tvl_usd * catMult(row, m) * gm * mm * cm));
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  // Farm plan derivation: identical rules to lib/model.ts farmSteps (category, first chain, TVL, age).
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return { band: '$12-25 per transaction on Ethereum mainnet (cheaper on weekend mornings)', weekly: 15 };
    if (['solana', 'sui', 'stellar', 'tron', 'aptos', 'near'].indexOf(c) >= 0) return { band: 'under $0.10 per transaction', weekly: 1 };
    if (c === 'bitcoin') return { band: '$1-4 per transaction at typical fee rates', weekly: 3 };
    return { band: '$0.20-2 per transaction on this chain', weekly: 2 };
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500; if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 2.5e8) return 150; if (p.tvl_usd >= 5e7) return 100; return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60; if (age < 365) return 45; if (age < 730) return 35; return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and enable it as a borrow position.';
    if (c.indexOf('dex') >= 0) return 'Swap $' + Math.round(capital / 2) + ' into the main pair on ' + name + ' and provide $' + capital + ' of two-sided liquidity on ' + chain + '.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and trade one small hedged position a week.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then deposit the bridged funds in a destination app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the liquid receipt token.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('leveraged') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and leave auto-compounding on.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('launchpad') >= 0) return 'Register the wallet on ' + name + ' and join one $' + capital + ' allocation round on ' + chain + ' when one opens.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + name + "'s chain, then use two native apps there so the wallet has real activity.";
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + "'s main index basket on " + chain + ' and hold it untouched.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open and untouched.';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase(), name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow about 30% against the supplied collateral on ' + name + ' and redeposit it once, keeping health factor above 2.';
    if (c.indexOf('dex') >= 0) return 'Make three small swaps a week on ' + name + ' in different pairs, so volume as well as liquidity is recorded.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Also stake or vault any fee-share balance ' + name + ' offers, so margin and passive activity are both recorded.';
    if (c.indexOf('bridge') >= 0) return 'Bridge back a small amount once through ' + name + ', so the wallet shows round-trip use, not a one-way transfer.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate a small second amount through ' + name + ' to a different validator or vault if it offers one.';
    return 'Use one second feature of ' + name + ' on ' + chain + ' (a vote, a referral link, a small second deposit) so the wallet is not single-action.';
  }
  function stepText(s) {
    var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
    if (t.length > 600) t = t.slice(0, 596) + '...';
    if (t.length < 20) t += " Hold the position and check the protocol's own page.";
    return t;
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days), gas = gasFor(chain);
    var weeks = Math.max(4, Math.round(hold / 7)), weeklyTotal = gas.weekly * weeks;
    return [
      { text: 'Create a fresh wallet used only for ' + p.name + ', fund it from your main wallet in one transfer, and keep its seed phrase offline on paper.', cost: 'one funding transfer, ' + gas.band, time: '10 minutes' },
      { text: 'Open ' + p.name + ' only from its official site or its verified social profile, connect the wallet, and confirm the app is on ' + chain + ' before signing anything.', cost: 'nothing to check; never pay a site that asks for an approval fee', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital, plus gas at ' + gas.band, time: '20 minutes to set up' },
      { text: secondActionFor(p, chain), cost: 'gas at ' + gas.band + ', no extra capital beyond step 3', time: '15 minutes' },
      { text: 'Repeat one qualifying action every week for ' + weeks + ' weeks (a deposit top-up, a swap, a vote or a claim check), on the same weekday so none is missed.', cost: 'about $' + weeklyTotal + ' of gas in total over ' + weeks + ' weeks', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days; at day ' + Math.round(hold / 2) + " re-check the position, the protocol's points page and its TVL trend before deciding to add or exit.", cost: 'the $' + capital + ' from step 3 stays in the position', time: hold + ' days, with one 10-minute check halfway' },
      { text: 'When a launch or rewards claim is announced, claim only from the link ' + p.name + ' itself publishes, then log the wallet, dates, amounts and transaction hashes and unwind the position in two steps.', cost: 'claim gas at ' + gas.band + '; never pay anyone to claim for you', time: '20 minutes' }
    ].map(stepText);
  }
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var q = new URLSearchParams(h);
    if (q.get('q')) state.q = q.get('q');
    if (q.get('p')) state.selected = q.get('p');
    if (q.get('category')) state.category = q.get('category');
    if (q.get('signal')) state.signal = q.get('signal');
    if (q.get('chain')) state.chain = q.get('chain');
  }
  function writeHash() {
    var q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.category !== 'all') q.set('category', state.category);
    if (state.chain !== 'all') q.set('chain', state.chain);
    if (state.signal !== 'all') q.set('signal', state.signal);
    if (state.selected) q.set('p', state.selected);
    var s = q.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.signal !== 'all' && r.signal !== state.signal) return false;
      if (state.wl && !r.on_watchlist) return false;
      if (state.growing && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e18 : a.change_7d; bv = b.change_7d === null ? -1e18 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 1e18 : a.age_days; bv = b.age_days === null ? 1e18 : b.age_days; }
      else if (key === 'eff') { av = a.implied_value_usd / a.capital_usd; bv = b.implied_value_usd / b.capital_usd; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir; if (av > bv) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring' }), el('span', { text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' }, el('span', { text: 'Snapshot ' + DATA.as_of }), el('span', { text: 'DefiLlama index, frozen' }), el('span', { text: 'model ' + DATA.model_version })));
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', null, 'Every protocol below records ', el('b', { text: 'no token' }), ' on DefiLlama. The board prices the launch it could one day make — from its TVL, category, 7-day growth, age and chain reach — and gives the exact farm plan for each. Records are not proof: a protocol may have a token DefiLlama does not carry.')),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early finds below $50M' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))));
  }
  function podium() {
    var top = DATA.rows.slice(0, 3);
    return el('div', { class: 'podium' }, top.map(function (r) {
      return el('button', { class: 'pod', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('div', { class: 'rk', text: 'RANK #' + r.rank + ' — ' + r.signal.toUpperCase() }),
        el('div', { class: 'nm', text: r.name }),
        el('div', { class: 'vl', text: fmtUsd(r.implied_value_usd) }),
        el('div', { class: 'sb', text: (r.category || 'Other') + ' · TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) + ' · farm from $' + r.capital_usd }));
    }));
  }
  function selectField(id, label, values, current, onChange) {
    var sel = el('select', { id: id, 'aria-label': label }, values.map(function (v) {
      return el('option', { value: v[0], text: v[1], selected: v[0] === current ? 'selected' : null });
    }));
    sel.addEventListener('change', function () { onChange(sel.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoardOnly(); });
    var wl = el('input', { type: 'checkbox', checked: state.wl ? 'checked' : null });
    wl.addEventListener('change', function () { state.wl = wl.checked; render(); });
    var gr = el('input', { type: 'checkbox', checked: state.growing ? 'checked' : null });
    gr.addEventListener('change', function () { state.growing = gr.checked; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls', id: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(cats.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('signal', 'Signal', [['all', 'All signals'], ['momentum', 'Momentum'], ['established', 'Established'], ['early gem', 'Early gem'], ['steady', 'Steady'], ['cooling', 'Cooling']], state.signal, function (v) { state.signal = v; }),
      el('label', { class: 'check' }, wl, ' Watchlist only'),
      el('label', { class: 'check' }, gr, ' Growing 7d'),
      el('div', { class: 'field' }, el('span', { class: 'lb', text: 'View' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', id: 'rowcount', text: '' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; }
      render();
    } }, label + (state.sort === key ? (state.dir < 0 ? ' ↓' : ' ↑') : '')));
  }
  function boardTable() {
    var list = sortedRows(rows());
    var count = document.getElementById('rowcount');
    if (count) count.textContent = list.length + ' of ' + DATA.board_size + ' rows';
    if (!list.length) return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches those filters' }),
      el('p', { text: 'Loosen one filter — the board itself still holds ' + DATA.board_size + ' ranked protocols.' }),
      el('button', { class: 'button', type: 'button', text: 'Clear all filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.signal = 'all'; state.wl = false; state.growing = false; writeHash(); render(); } })));
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var sigClass = r.signal === 'momentum' ? 'momentum' : r.signal === 'cooling' ? 'cooling' : r.signal === 'early gem' ? 'gem' : '';
      tbody.appendChild(el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num', text: '#' + r.rank }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'unnamed chain') }),
          r.on_watchlist ? el('span', { class: 'wl', text: '◆ WATCHLIST' }) : null)),
        el('td', null, el('span', { class: 'pill ' + sigClass, text: r.signal })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num', text: '$' + r.capital_usd + ' / ' + r.hold_days + 'd' })));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'Pre-token protocols ranked by implied launch value. Select any row for its full model breakdown and farm plan.' }),
      el('thead', null, el('tr', null, sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), el('th', { scope: 'col', text: 'Signal' }), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'), sortHeader('eff', 'Farm from'))),
      tbody)));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 2).join(', ') || '') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'These protocols already record a token: their market cap is a fact, not a model, so they are set aside from the pre-token ranking.' }),
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
      tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    var cats = Object.keys(m.category_multiples).sort(function (a, b) { return m.category_multiples[b] - m.category_multiples[a]; }).slice(0, 8);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How radar-2 prices a launch that has not happened' }),
      el('div', { class: 'formula', text: 'implied = TVL × category multiple × (1 + clamp(7d growth, −50%, +100%) × 0.6) × (0.55 + 0.45 × age/4y) × (1 + 4% per extra chain, max 4)' }),
      el('p', { class: 'sub', text: 'One function scores every protocol; no name is special-cased. Category carries the multiple because fee-taking businesses sustain a higher value per $1 of TVL than passive ones. Growth is damped so one hot week cannot buy the top. Age is days tracked with no token on record. The detail view recomputes each row and shows every multiplier.' }),
      el('div', { class: 'cats' }, cats.map(function (c) { return el('span', { text: c + ' ×' + m.category_multiples[c] }); }), el('span', { text: 'other ×' + m.category_default })));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug; writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row), check = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null, el('span', { class: 'sub', text: 'Rank #' + row.rank + ' of ' + DATA.board_size + ' · ' + row.signal + (row.on_watchlist ? ' · watchlist' : ' · early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + ((row.chains || []).join(', ') || 'an unnamed chain') + ' · records no token' })),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { dialog.close(); } })));
    var eq = [['TVL (snapshot)', fmtUsd(row.tvl_usd)], ['Category multiple — ' + (row.category || 'uncategorised'), '×' + row.category_multiple],
      ['7-day growth ' + fmtPct(row.change_7d), '×' + row.growth_multiplier], ['Age with no token — ' + fmtAge(row.age_days), '×' + row.maturity_multiplier],
      ['Chain reach — ' + (row.chains || []).length + ' chain(s)', '×' + row.chain_multiplier]];
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Implied launch value' }),
      el('div', { class: 'equation' }, eq.map(function (p) { return el('div', null, el('span', { text: p[0] }), el('b', { text: p[1] })); }),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ' — identical to board.json, so board and code agree.' : ' — which differs from the board; treat the data as stale.') + ' An implied value is this model\u2019s claim, not a price prediction, and no launch date is implied.' })));
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Farm plan — $' + row.capital_usd + ' capital, ' + row.hold_days + ' days' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
      })),
      el('p', { class: 'note', text: 'Capital is sized from this protocol\u2019s TVL tier and gas from its first chain (' + chainOf(row) + '). Farming never guarantees an allocation; size every position so a zero outcome is affordable.' })));
    if (!dialog.isConnected) app.appendChild(dialog);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }
  var boardHost = null;
  function renderBoardOnly() { if (boardHost) { boardHost.textContent = ''; boardHost.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable()); } }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header()); shell.appendChild(lede()); shell.appendChild(podium()); shell.appendChild(controls());
    boardHost = el('div', { id: 'boardhost' });
    boardHost.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    shell.appendChild(boardHost);
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    var count = document.getElementById('rowcount');
    if (count && state.tab === 'pre-token') count.textContent = rows().length + ' of ' + DATA.board_size + ' rows';
    if (state.selected) openDetail(state.selected);
  }
  readHash(); render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
