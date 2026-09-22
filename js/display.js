(function (F) {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const I = F.icon;
  const TABS = ['flight', 'upgrades', 'standbys'];
  let state = F.load();
  let qr = { url: null, ok: false };

  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  // Escape, then lift ® and ℠ into superscripts like the real screens.
  function mark(s) { return esc(s).replace(/([®℠])/g, '<sup>$1</sup>'); }

  function set(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; }

  // Check once per URL whether the QR image exists, so a missing file falls back cleanly.
  function checkQr(url) {
    if (qr.url === url) return;
    qr = { url, ok: false };
    if (!url) return;
    const img = new Image();
    img.onload = () => { if (qr.url === url) { qr.ok = true; render(); } };
    img.src = url;
  }

  // Slot index that changes every `sec` seconds; time-based so every screen rotates in step.
  function slot(sec, n) { return Math.floor(Date.now() / (Math.max(2, +sec || 8) * 1000)) % n; }

  // ---------- header + band ----------

  function renderTop(s, d, c24) {
    const f = s.flight;
    set('dest', esc(f.destLabel || F.airportLabel(f.destCode)));
    set('brand', s.display.logoUrl
      ? '<img src="' + esc(s.display.logoUrl) + '" alt="">'
      : '<img class="ua" src="assets/united-lockup.png" alt="United">' +
        '<span class="sep"></span><img class="sa" src="assets/star-alliance.png" alt="Star Alliance">');
    set('gate', esc(f.gate || '--'));
    set('fno', I('planeRight') + esc((f.airline || '') + (f.number || '')));

    const cell = (icon, lbl, val, cls) => val
      ? '<div class="cell"><span class="lbl">' + I(icon) + lbl + '</span><span class="val ' + (cls || '') + '">' + val + '</span></div>' : '';
    const arr = F.fmtTime(f.arr, c24);
    let cells;
    if (d.pill === 'delayed' && f.est) {
      cells = cell('takeoff', 'Est. departure', F.fmtTime(f.est, c24)) +
              cell('clock', 'Orig. departure', F.fmtTime(f.sched, c24), 'struck') +
              cell('land', 'Est. arrival', arr);
    } else {
      cells = cell('clock', 'Boarding time', F.fmtTime(d.boardLocal, c24)) +
              cell('takeoff', 'Est. departure', F.fmtTime(d.depLocal, c24)) +
              cell('land', 'Est. arrival', arr);
    }
    set('cells', cells);

    const pill = $('pill');
    const txt = F.PILLS[d.pill];
    if (pill.textContent !== txt) pill.textContent = txt;
    pill.className = 'pill ' + d.pill;
  }

  // ---------- left panel ----------

  function amenity(icon, label, sub) {
    return '<div class="am">' + I(icon) + '<div>' + esc(label) + (sub ? '<small>(' + esc(sub) + ')</small>' : '') + '</div></div>';
  }

  function flightPanel(s, c24) {
    const a = s.amenities, f = s.flight;
    const col1 = [], col2 = [];
    if (a.wifi) col1.push(amenity('wifi', 'Wi-Fi ' + a.wifi));
    if (a.power) col1.push(amenity('power', 'In-seat power', a.power));
    if (a.entertainment) col2.push(amenity('movie', 'Entertainment'));
    if (a.food) col2.push(amenity('food', 'Food ' + a.food));
    if (a.beverages) col2.push(amenity('cup', 'Beverages'));
    const foot = qr.ok
      ? '<div class="p-foot"><img src="' + esc(qr.url) + '" alt=""><div><b>Need assistance?</b><span>Scan the QR code to view your flight options, talk to an agent and more.</span></div></div>'
      : f.arr ? '<div class="arrival">' + I('land') + 'Est. arrival<b>' + F.fmtTime(f.arr, c24) + '</b></div>' : '';
    return '<div class="p-title">Inflight amenities</div>' +
      '<div class="amen"><div>' + col1.join('') + '</div><div>' + col2.join('') + '</div></div>' + foot;
  }

  // Cleared passengers first (green, unnumbered), then the waiting list numbered from 1. Two columns of 6.
  function nameTable(list) {
    const cleared = list.filter((p) => p.seat), waiting = list.filter((p) => !p.seat);
    const rows = cleared.map((p) =>
      '<div class="tr cl"><span class="nm">' + esc(p.name) + '</span><span>' + (p.ci ? I('check') : '') + '</span><span>' + esc(p.seat) + '</span></div>');
    waiting.forEach((p, i) => rows.push(
      '<div class="tr"><span class="nm"><span class="badge">' + (i + 1) + '</span>' + esc(p.name) + '</span><span>' +
      (p.ci ? I('check') : '') + '</span><span>--</span></div>'));
    const per = 6;
    while (rows.length < per * 2) rows.push('<div class="tr"></div>');
    const head = '<div class="th"><span>Name</span><span>Checked-In</span><span>Seat</span></div>';
    return '<div class="tbl"><div>' + head + rows.slice(0, per).join('') + '</div><div>' + head + rows.slice(per, per * 2).join('') + '</div></div>';
  }

  function upgradesPanel(s) {
    const u = s.upgrades;
    const booked = /full/i.test(String(u.booked)) ? '<span class="full">' + esc(u.booked) + '</span>' : esc(u.booked);
    return '<div class="p-title">' + mark(u.cabin) + '</div>' +
      '<div class="counts"><span>Capacity = ' + esc(u.capacity) + '</span><span>Booked = ' + booked + '</span><span>Checked In = ' + esc(u.checkedIn) + '</span></div>' +
      nameTable(u.list) +
      '<div class="legend"><span><i></i>= Upgraded</span><small>See United app for full upgrades list.</small></div>';
  }

  function standbysPanel(s) {
    const cabins = F.parseCabins(s.standby.cabins).map((c) => {
      const cls = /full/i.test(c.status) ? 'full' : /avail/i.test(c.status) ? 'avail' : '';
      return '<div>' + mark(c.cabin) + (c.status ? ' = <span class="' + cls + '">' + esc(c.status) + '</span>' : '') + '</div>';
    }).join('');
    return '<div class="p-title">Standby List</div><div class="cabins">' + cabins + '</div>' +
      nameTable(s.standby.list) +
      '<div class="legend"><span><i></i>= Cleared</span><small>See United app for full standby list.</small></div>';
  }

  // Tab changes cross-fade: fade the panel out, swap content and highlight, fade back in.
  const FADE_MS = 350;
  let shownTab = null, fading = false;
  function renderLeft(s, c24) {
    const mode = s.display.tabMode;
    const tab = TABS.includes(mode) ? mode : TABS[slot(s.display.tabSec, TABS.length)];
    const paint = () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === shownTab));
      set('panel', shownTab === 'flight' ? flightPanel(s, c24) : shownTab === 'upgrades' ? upgradesPanel(s) : standbysPanel(s));
    };
    if (fading) return;
    if (shownTab === null || tab === shownTab) { shownTab = tab; paint(); return; }
    fading = true;
    $('panel').classList.add('out');
    setTimeout(() => {
      shownTab = tab;
      paint();
      $('panel').classList.remove('out');
      fading = false;
    }, FADE_MS);
  }

  // ---------- right panel ----------

  function promos(s, c24) {
    const d = s.display, out = [];
    if (d.promoApp) out.push('<div class="rp promo">' + (qr.ok ? '<img class="qr" src="' + esc(qr.url) + '" alt="">' : '') +
      '<div class="center"><h2>Download the<br>United app now</h2><ul><li>Get Wi-Fi and entertainment</li><li>Buy snacks and drinks</li><li>Check your flight status</li></ul></div></div>');
    if (d.promoWifi) out.push('<div class="rp promo"><div class="center"><h2>Buy Wi-Fi for<br>your flight</h2><div class="prices">' +
      '<div class="price"><b>' + esc(d.wifiMember) + '</b><span>MileagePlus members</span></div>' +
      '<div class="price"><b>' + esc(d.wifiNonMember) + '</b><span>Non-members</span></div></div></div></div>');
    if (d.promoPass) out.push('<div class="rp promo"><div class="center"><h2>Find your group<br>on your boarding pass</h2>' +
      '<div class="pass"><span class="route">' + esc(s.flight.originCode) + ' ' + I('planeRight') + ' ' + esc(s.flight.destCode) +
      '</span><span class="circ"><small>Seat</small><b>10F</b></span><span class="circ"><small>Group</small><b>2</b></span></div></div></div>');
    return out;
  }

  // Blue tile: Group 1 (or Pre-boarding). Green tile: every later group called so far ("2", "2-3", "2-4"...).
  function groupTile(label, num, green) {
    const inner = num == null
      ? '<span class="t-word">' + label + '</span>'
      : '<span class="t-lbl">' + label + '</span><span class="t-num">' + num + '</span>';
    return '<div class="tile' + (green ? ' next' : '') + '">' + inner + '<span class="t-sub">' + (green ? 'LINE UP NOW' : '') + '</span></div>';
  }

  function renderRight(s, d, c24) {
    let html;
    const sec = s.display.panelSec;
    switch (d.phase) {
      case 'promo': {
        const list = promos(s, c24);
        if (list.length) { html = list[slot(sec, list.length)]; break; }
      } // fall through to the countdown when no promos are enabled
      case 'countdown':
        html = '<div class="rp countdown"><div class="center"><div class="l1">Boarding in</div><div class="l2">' + d.minsToBoard +
          '</div><div class="l3">' + (d.minsToBoard === 1 ? 'minute' : 'minutes') + '</div></div></div>';
        break;
      case 'soon':
        html = '<div class="rp soon"><div class="center"><div class="big">Boarding soon</div><div class="sub">Please remain seated until your group is called</div></div></div>';
        break;
      case 'boarding': {
        const g = d.group;
        if (g === 0) { html = preboardSlide(); break; }
        // While groups 1 and 2 board, alternate with the "Groups 3-6 have a seat" view.
        if ((g === 1 || g === 2) && slot(sec, 2) === 1) {
          html = '<div class="rp seatview"><div class="bar"></div><div class="center"><div class="big">Groups 3-' + F.LAST_GROUP +
            '</div><div class="sub">Have a seat until<br>your group is called</div>' + F.seated + '</div><div class="bar"></div></div>';
        } else {
          const blue = g === 0 ? groupTile('Pre-boarding', null, false) : groupTile('GROUP', 1, false);
          const green = g >= 2 ? (g === 2 ? groupTile('GROUP', 2, true) : groupTile('GROUPS', '2-' + g, true)) : '';
          html = '<div class="rp"><div class="strip">Boarding Now</div><div class="tiles' + (green ? '' : ' one') + '">' +
            blue + green + '</div><div class="strip bottom">Watch for your group number</div></div>';
        }
        break;
      }
      case 'final':
        html = '<div class="rp final"><div class="strip">Boarding now</div><div class="inner"><div class="center"><div class="big">All groups</div>' +
          '<div class="sub">Final boarding</div></div><div class="stripes"><i></i><i></i></div></div></div>';
        break;
      case 'closed':
        html = '<div class="rp closed"><div class="center"><div class="big">Boarding closed</div></div></div>';
        break;
      default:
        html = '';
    }
    set('right', html);
  }

  // ---------- footer ----------

  function renderFooter(s, c24) {
    const n = s.next;
    set('next', n.dest
      ? '<span>' + I('arrow') + 'Next departure: ' + esc(n.dest) + '</span>' +
        (n.flight ? '<span>' + I('planeRight') + esc(n.flight) + '</span>' : '') +
        (n.time ? '<span>' + I('takeoff') + F.fmtTime(n.time, c24) + '</span>' : '') +
        (n.status ? '<span class="op">' + esc(n.status) + '</span>' : '')
      : '');
    const now = F.airportNow(s.flight.utcOffsetMin);
    set('date', F.fmtDate(now));
    set('time', F.fmtTime(now, c24));
  }

  function render() {
    const s = state, d = F.derive(s), c24 = s.display.clock24;
    checkQr(s.display.qrUrl);
    renderTop(s, d, c24);
    renderLeft(s, c24);
    renderRight(s, d, c24);
    renderFooter(s, c24);
  }

  async function autoRefresh() {
    const src = state.source;
    if (!src.autoRefresh || src.mode === 'manual' || state.flight.lock) return;
    const key = F.getKey();
    if (!key) return;
    const interval = Math.max(1, src.refreshMin) * 60000;
    if (F.isSnapshot()) {
      if (Date.now() - (autoRefresh.last || 0) < interval) return;
      autoRefresh.last = Date.now();
    } else if (!F.claimFetch(interval)) return;
    try {
      await F.refreshFlight(state, key);
      F.save(state);
      $('err').hidden = true;
      render();
    } catch (e) {
      $('err').textContent = 'Refresh failed: ' + e.message;
      $('err').hidden = false;
    }
  }

  // Keyboard: arrows step through boarding groups, F toggles fullscreen.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const b = state.boarding, fwd = e.key === 'ArrowRight';
      const d = F.derive(state);
      if (d.phase !== 'boarding') { b.phase = 'boarding'; b.group = fwd ? 0 : F.LAST_GROUP; }
      else if (fwd && b.group >= F.LAST_GROUP) b.phase = 'final';
      else b.group = Math.max(0, Math.min(F.LAST_GROUP, d.group + (fwd ? 1 : -1)));
      F.save(state);
      render();
    }
  });
  stage.addEventListener('dblclick', toggleFullscreen);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  F.onChange((s) => {
    if (F.isSnapshot()) return;
    state = s;
    render();
  });
  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', () => { state = F.load(); render(); });

  fit();
  render();
  setInterval(render, 1000);
  setInterval(autoRefresh, 30000);
  autoRefresh();
})(window.FIDS);
