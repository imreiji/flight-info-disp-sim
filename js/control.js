(function (F) {
  const $ = (id) => document.getElementById(id);
  let state = F.load();

  // ---- generic binding: <input data-path="a.b"> <-> state.a.b ----
  function getPath(p) { return p.split('.').reduce((o, k) => o[k], state); }
  function setPath(p, v) {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((o, k) => o[k], state)[last] = v;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function fillForm() {
    document.querySelectorAll('[data-path]').forEach((el) => {
      const v = getPath(el.dataset.path);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = el.value === v;
      else if (document.activeElement !== el) el.value = v == null ? '' : v;
    });
    document.querySelectorAll('[data-show]').forEach((el) => {
      el.hidden = !el.dataset.show.split(' ').includes(state.source.mode);
    });
    $('updated').textContent = state.flight.updated
      ? 'Last fetched ' + new Date(state.flight.updated).toLocaleTimeString() : '';
    $('keyState').textContent = F.getKey() ? 'saved' : 'not set';
    renderBoarding();
    listEditors.forEach((ed) => ed.render());
  }

  function commit() { F.save(state); }

  document.querySelectorAll('[data-path]').forEach((el) => {
    const ev = el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
      else if (el.type === 'number') v = el.value === '' ? '' : Number(el.value);
      else v = el.value;
      setPath(el.dataset.path, v);
      commit();
      if (el.type === 'radio' || el.tagName === 'SELECT') fillForm();
    });
  });

  // Typing a destination code fills in the display name when we know it.
  $('destCode').addEventListener('change', () => {
    const code = state.flight.destCode.toUpperCase();
    state.flight.destCode = code;
    if (F.AIRPORTS[code]) state.flight.destLabel = F.airportLabel(code);
    commit(); fillForm();
  });

  // ---- boarding ----
  $('pillSel').innerHTML = Object.entries(F.PILLS)
    .map(([k, v]) => '<option value="' + k + '">' + (k === 'auto' ? 'Auto (delay / cancel from data)' : v) + '</option>').join('');

  function renderBoarding() {
    const d = F.derive(state), b = state.boarding;
    $('phaseBtns').innerHTML = Object.entries(F.PHASES).filter(([k]) => k !== 'boarding').map(([k, v]) =>
      '<button data-phase="' + k + '" class="' + (b.phase === k ? 'current' : '') + '">' + v +
      (k === 'auto' && b.phase === 'auto' ? ' <small>(now: ' + F.PHASES[d.phase] + ')</small>' : '') + '</button>').join('');
    $('groupBtns').innerHTML = F.GROUPS.map((g, i) => {
      const cls = d.phase === 'boarding' ? (i < d.group ? 'done' : i === d.group ? 'current' : '') : '';
      return '<button data-g="' + i + '" class="' + cls + '">' + g + '</button>';
    }).join('');
  }
  $('phaseBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-phase]');
    if (!btn) return;
    state.boarding.phase = btn.dataset.phase;
    commit(); fillForm();
  });
  $('groupBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-g]');
    if (btn) setGroup(+btn.dataset.g);
  });
  function setGroup(i) {
    const b = state.boarding;
    if (i > F.LAST_GROUP) { b.phase = 'final'; }
    else { b.phase = 'boarding'; b.group = Math.max(0, i); }
    commit(); fillForm();
  }
  const curGroup = () => { const d = F.derive(state); return d.phase === 'boarding' ? d.group : -1; };
  $('prevGroup').onclick = () => setGroup(curGroup() - 1);
  $('nextGroup').onclick = () => setGroup(curGroup() + 1);

  document.querySelectorAll('[data-delay]').forEach((b) => b.addEventListener('click', () => {
    const m = +b.dataset.delay;
    state.flight.est = m ? F.shiftLocal(state.flight.sched, m) : '';
    state.flight.lock = true;
    commit(); fillForm();
  }));

  // ---- upgrade / standby list editors ----
  function ListEditor(el, getList) {
    this.render = function () {
      if (el.contains(document.activeElement)) return;  // don't clobber typing
      const list = getList();
      el.innerHTML =
        '<table><thead><tr><th></th><th>Name</th><th>Checked in</th><th>Seat (= cleared)</th><th></th></tr></thead><tbody>' +
        list.map((p, i) => '<tr data-i="' + i + '"><td class="muted">' + (i + 1) + '</td>' +
          '<td><input data-f="name" value="' + esc(p.name) + '"></td>' +
          '<td><input type="checkbox" data-f="ci"' + (p.ci ? ' checked' : '') + '></td>' +
          '<td><input data-f="seat" class="tiny" value="' + esc(p.seat) + '" placeholder="--"></td>' +
          '<td class="act"><button data-a="up" title="Move up">&uarr;</button><button data-a="down" title="Move down">&darr;</button>' +
          '<button data-a="del" title="Remove">&times;</button></td></tr>').join('') +
        '</tbody></table>' +
        '<div class="row"><textarea rows="2" placeholder="Add names, one per line: SMITH, J.   (add a seat to mark cleared: SMITH, J. 3A)"></textarea>' +
        '<button data-a="add">Add</button><button data-a="clear" class="danger">Clear list</button></div>';
    };
    el.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-i]'), f = e.target.dataset.f;
      if (!tr || !f) return;
      const p = getList()[+tr.dataset.i];
      p[f] = f === 'ci' ? e.target.checked : f === 'seat' ? e.target.value.toUpperCase() : e.target.value.toUpperCase();
      commit();
    });
    el.addEventListener('focusout', () => setTimeout(() => this.render(), 0));
    el.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (!a) return;
      const list = getList();
      const tr = e.target.closest('tr[data-i]'), i = tr ? +tr.dataset.i : -1;
      if (a === 'up' && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
      if (a === 'down' && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
      if (a === 'del') list.splice(i, 1);
      if (a === 'add') { const ta = el.querySelector('textarea'); list.push(...F.parseNames(ta.value)); ta.value = ''; }
      if (a === 'clear' && confirm('Remove everyone from this list?')) list.length = 0;
      commit();
      document.activeElement.blur();
      this.render();
    });
  }
  const listEditors = [
    new ListEditor($('upgradeEd'), () => state.upgrades.list),
    new ListEditor($('standbyEd'), () => state.standby.list),
  ];

  // ---- API key ----
  $('apiKey').value = F.getKey();
  $('saveKey').onclick = () => { F.setKey($('apiKey').value.trim()); fillForm(); msg('Key saved.'); };
  $('clearKey').onclick = () => { F.setKey(''); $('apiKey').value = ''; fillForm(); };

  // ---- fetching ----
  function msg(t, err) { $('fetchMsg').textContent = t; $('fetchMsg').className = 'msg' + (err ? ' err' : ''); }

  function localStamp(offsetMin, addMin) {
    return new Date(Date.now() + (offsetMin + addMin) * 60000).toISOString().slice(0, 16);
  }

  let lastList = [];
  function showResults(list) {
    lastList = list;
    if (!list.length) { $('results').hidden = true; return; }
    const c24 = state.display.clock24;
    $('results').innerHTML = '<table><thead><tr><th>Flight</th><th>To</th><th>Departs</th><th>Gate</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map((f, i) => '<tr><td>' + esc(f.airline + ' ' + f.number) + '</td><td>' + esc(f.destLabel) +
        '</td><td>' + F.fmtTime(f.est || f.sched, c24) + (f.est ? ' <span class="muted">(sch ' + F.fmtTime(f.sched, c24) + ')</span>' : '') +
        '</td><td>' + esc(f.gate) + '</td><td>' + esc(f.apiStatus) + '</td><td><button data-pick="' + i + '">Use</button></td></tr>').join('') +
      '</tbody></table>';
    $('results').hidden = false;
  }
  $('results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) pick(lastList[+b.dataset.pick], lastList);
  });

  function pick(f, list) {
    F.applyFlight(state, f);
    state.flight.lock = false;
    state.source.flight = f.airline + f.number;
    state.source.date = (f.sched || '').slice(0, 10) || state.source.date;
    state.source.airport = f.originCode || state.source.airport;
    if (list) F.applyNext(state, F.pickNext(state, list));
    commit(); fillForm();
    msg('Showing ' + f.airline + ' ' + f.number + ' to ' + f.destLabel + '.');
  }

  $('fetchBtn').onclick = async () => {
    const key = F.getKey(), src = state.source;
    msg('Fetching...');
    $('results').hidden = true;
    try {
      if (src.mode === 'flight') {
        const legs = await F.api.byFlight(key, src.flight, src.date);
        if (!legs.length) return msg('No flight found.', true);
        const match = legs.find((l) => l.originCode === (src.airport || '').toUpperCase());
        if (legs.length > 1 && !match) { showResults(legs); return msg('Multiple legs: pick one.'); }
        pick(match || legs[0]);
        if (src.lookupNext) { await F.refreshFlight(state, key); commit(); fillForm(); }
      } else {
        const ap = src.airport.toUpperCase();
        const off = state.flight.originCode === ap ? state.flight.utcOffsetMin : -new Date().getTimezoneOffset();
        const all = await F.api.byAirport(key, ap, localStamp(off, -30), localStamp(off, 690), { airline: src.airline });
        let list = all;
        if (src.gate) list = list.filter((n) => n.gate.toUpperCase() === src.gate.toUpperCase());
        if (src.dest) list = list.filter((n) => n.destCode.toUpperCase() === src.dest.toUpperCase());
        showResults(list);
        const next = list.find((f) => !/departed|canceled|cancelled|enroute|arrived/i.test(f.apiStatus));
        if (next) pick(next, all);
        else msg(list.length ? 'No upcoming flights, pick one below.' : 'No matching ' + (src.airline || '') + ' departures in the next 12 hours.', !list.length);
      }
    } catch (e) {
      msg(e.message, true);
    }
  };

  // ---- United bookmarklet ----
  function unitedMsg(t, err) { $('unitedMsg').textContent = t; $('unitedMsg').className = 'msg' + (err ? ' err' : ''); }
  const bm = $('bookmarklet');
  bm.href = F.bookmarklet(location.origin + location.pathname);
  bm.addEventListener('click', (e) => { e.preventDefault(); alert('Drag this button to your bookmarks bar, then click it while viewing a flight on united.com.'); });
  try {
    if (F.importUnitedFromHash(state)) {
      commit();
      const u = state.united;
      unitedMsg('Loaded ' + state.flight.airline + state.flight.number + ' from united.com at ' + new Date(u.updated).toLocaleTimeString() +
        (u.delayMin ? ' · delayed ' + u.delayMin + ' min' + (u.delayCause ? ' (' + u.delayCause + ')' : '') : '') +
        ' · ' + state.upgrades.list.length + ' on upgrade list, ' + state.standby.list.length + ' on standby.');
    }
  } catch (e) {
    unitedMsg('Could not read the United data: ' + e.message, true);
  }

  // Auto-refresh from the control page too (a shared lock stops the display double-fetching).
  setInterval(async () => {
    const src = state.source;
    if (!src.autoRefresh || src.mode === 'manual' || state.flight.lock || !F.getKey()) return;
    if (!F.claimFetch(Math.max(1, src.refreshMin) * 60000)) return;
    try { await F.refreshFlight(state, F.getKey()); commit(); fillForm(); msg('Auto-refreshed ' + new Date().toLocaleTimeString() + '.'); }
    catch (e) { msg('Auto-refresh failed: ' + e.message, true); }
  }, 30000);

  // ---- top bar ----
  $('openDisplay').onclick = () => window.open('index.html', 'fids-display');
  $('copyLink').onclick = async () => {
    const withKey = F.getKey() && confirm('Include your API key in the link so that device can auto-refresh?\n\nOnly do this for devices you trust.');
    const url = new URL('index.html', location.href);
    const snap = JSON.parse(JSON.stringify(state));
    snap.upgrades.list = []; snap.standby.list = [];
    url.hash = 's=' + encodeURIComponent(F.encodeState(snap)) + (withKey ? '&k=' + encodeURIComponent(F.getKey()) : '');
    try { await navigator.clipboard.writeText(url.href); alert('Link copied. It is a snapshot without passenger names: later edits here will not reach that device.'); }
    catch (e) { prompt('Copy this link:', url.href); }
  };
  $('reset').onclick = () => {
    if (!confirm('Reset everything to the demo flight? (Your API key is kept.)')) return;
    state = F.defaultState(); commit(); fillForm(); $('results').hidden = true; msg('');
  };

  F.onChange((s) => { state = s; fillForm(); });   // e.g. arrow keys pressed on the display
  setInterval(renderBoarding, 5000);                 // keep the auto-phase readout current
  fillForm();
})(window.FIDS);
