// Flight status page: the same shared state as the gate display, laid out like an airline status page.
(function (F) {
  const I = F.icon;
  let state = F.load();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  const t = (local) => F.fmtTime(local, state.display.clock24);
  const cityOf = (label) => (label || '').replace(/\s*\([A-Z]{3}\)$/, '').split(',')[0];

  function dayWord(local) {
    if (!local) return '';
    const today = F.airportNow(state.flight.utcOffsetMin).toISOString().slice(0, 10);
    const d = local.slice(0, 10);
    if (d === today) return 'Today';
    const dt = new Date(d + 'T00:00:00Z');
    return F.fmtDate(dt);
  }

  const AMEN = {
    Beverages: ['cup', 'Beverages'], InseatPower: ['power', 'In-seat power'], Entertainment: ['movie', 'Entertainment and Wi-Fi'],
    Seating: ['seat', 'Seating'], Meal: ['food', 'Food'],
  };

  function amenities(s) {
    const u = s.united || {};
    if (u.amenityText && u.amenityText.length) {
      return u.amenityText.filter((a) => AMEN[a.name]).map((a) =>
        '<li>' + I(AMEN[a.name][0]) + '<div><b>' + AMEN[a.name][1] + (a.cabin && a.cabin.length > 1 ? ' · ' + esc(a.cabin) : '') +
        '</b>' + esc(a.text) + '</div></li>').join('');
    }
    const a = s.amenities, out = [];
    if (a.wifi) out.push(['wifi', 'Wi-Fi', a.wifi === '(Free)' ? 'Free' : 'Available for purchase']);
    if (a.power) out.push(['power', 'In-seat power', a.power]);
    if (a.entertainment) out.push(['movie', 'Entertainment', 'Personal device entertainment']);
    if (a.food) out.push(['food', 'Food', a.food === '(Free)' ? 'Complimentary' : 'Available for purchase']);
    if (a.beverages) out.push(['cup', 'Beverages', 'Complimentary non-alcoholic beverages']);
    return out.map(([ic, n, d]) => '<li>' + I(ic) + '<div><b>' + n + '</b>' + esc(d) + '</div></li>').join('');
  }

  function peopleTable(list, clearedLabel) {
    const cleared = list.filter((p) => p.seat), waiting = list.filter((p) => !p.seat);
    const conf = cleared.length
      ? '<table><tr><th>Name</th><th>Seat</th></tr>' + cleared.map((p) => '<tr class="cleared"><td>' + esc(p.name) + '</td><td>' + esc(p.seat) + '</td></tr>').join('') + '</table>'
      : '<p class="empty">No confirmed customers</p>';
    const wait = waiting.length
      ? '<table><tr><th>Name</th><th>Checked in</th></tr>' + waiting.map((p, i) =>
          '<tr><td>' + (i + 1) + '. ' + esc(p.name) + '</td><td class="' + (p.ci ? 'ok' : '') + '">' + (p.ci ? I('check') : 'Not checked in') + '</td></tr>').join('') + '</table>'
      : '<p class="empty">Nobody standing by</p>';
    return '<h3>' + clearedLabel + '</h3>' + conf + '<h3>Standing by</h3>' + wait;
  }

  function render() {
    const s = state, f = s.flight, u = s.united || {}, d = F.derive(s);
    const origin = u.originLabel || F.airportLabel(f.originCode);
    const dest = f.destLabel || F.airportLabel(f.destCode);
    const late = d.pill === 'delayed' && f.est;
    const delay = u.delayMin || d.delayMin;
    const chip = (txt, cls) => '<span class="chip ' + cls + '">' + esc(txt) + '</span>';
    const departed = /departed|enroute|in flight|arrived|landed|approaching/i.test(f.apiStatus);
    const pillCls = departed ? 'departed' : d.pill;
    const pillTxt = departed ? 'Departed' : F.PILLS[d.pill];

    let banner = '';
    if (d.pill === 'cancelled') {
      banner = '<div class="banner cancel">' + I('delay') + '<div><b>This flight has been cancelled</b>Check the United app for rebooking options.</div></div>';
    } else if (late) {
      banner = '<div class="banner delay">' + I('delay') + '<div><b>We apologize for the delay</b>' +
        esc(u.reason || 'Estimated departure ' + delay + ' minutes late') + (f.delayReason ? ' · ' + esc(f.delayReason) : '') + '</div></div>';
    }

    const depTimes = late
      ? '<div class="big late">Estimated: ' + t(f.est) + '</div><div>Scheduled: <s>' + t(f.sched) + '</s> · ' + delay + ' mins late</div>'
      : '<div class="big">Scheduled: ' + t(f.sched) + '</div>';
    const arrLate = (u.arrDelayMin || 0) > 0 && u.arrSched;
    const arrTimes = arrLate
      ? '<div class="big late">Estimated: ' + t(f.arr) + '</div><div>Scheduled: <s>' + t(u.arrSched) + '</s> · ' + u.arrDelayMin + ' mins late</div>'
      : f.arr ? '<div class="big">' + (u.arrSched ? 'Scheduled: ' : 'Estimated: ') + t(f.arr) + '</div>' : '';
    const progress = departed ? (/arriv|landed/i.test(f.apiStatus) ? 100 : 50) : 0;

    const ai = u.aircraftInfo || {};
    const ib = u.inbound;
    const up = s.upgrades;
    const cabins = F.parseCabins(s.standby.cabins);
    const updated = u.updated || f.updated;

    document.getElementById('app').innerHTML =
      '<h1>' + esc(cityOf(origin)) + ' to ' + esc(cityOf(dest)) + '<small>' + dayWord(f.sched) + '</small></h1>' +
      banner +
      '<section class="card">' +
        '<div class="fl-head"><span class="fl-no">' + I('planeRight') + esc((f.airline || '') + ' ' + (f.number || '')) + '</span>' +
        '<span class="muted">' + (u.operator ? 'Operated by ' + esc(u.operator) : '') +
        (u.codeshares && u.codeshares.length ? ' · Also sold as ' + esc(u.codeshares.join(', ')) : '') + '</span></div>' +
        '<div class="legs">' +
          '<div class="leg"><div class="lbl">' + I('takeoff') + 'DEPARTURE</div>' + chip(u.depStatus || pillTxt, pillCls) +
            '<div class="code">' + esc(f.originCode) + '</div><div class="city">' + esc(origin) + '</div>' +
            '<div class="times">' + depTimes + '</div>' +
            '<div class="facts"><div><span>Terminal</span><b>' + esc(f.terminal || '--') + '</b></div><div><span>Gate</span><b>' + esc(f.gate || '--') + '</b></div>' +
            '<div><span>Boarding</span><b>' + t(d.boardLocal) + '</b></div></div></div>' +
          '<div class="leg"><div class="lbl">' + I('land') + 'ARRIVAL</div>' + chip(u.arrStatus || pillTxt, u.arrStatus && /delay/i.test(u.arrStatus) ? 'delayed' : pillCls) +
            '<div class="code">' + esc(f.destCode) + '</div><div class="city">' + esc(dest) + '</div>' +
            '<div class="times">' + arrTimes + '</div>' +
            '<div class="facts"><div><span>Terminal</span><b>' + esc(u.arrTerminal || '--') + '</b></div><div><span>Gate</span><b>' + esc(u.arrGate || '--') + '</b></div>' +
            '<div><span>Baggage claim</span><b>' + esc(u.baggage || '--') + '</b></div></div></div>' +
        '</div>' +
        '<div class="track">' + esc(f.originCode) + '<i><b style="width:' + progress + '%"></b></i>' + I('planeRight') + '<i></i>' + esc(f.destCode) + '</div>' +
        (updated ? '<p class="note">Last refreshed ' + esc(new Date(updated).toLocaleString()) + '</p>' : '') +
      '</section>' +

      '<div class="grid2">' +
        '<section class="card"><h2>Aircraft</h2><dl>' +
          '<dt>Aircraft</dt><dd>' + esc(ai.model || f.aircraft || '--') + (f.tail ? ' | #' + esc(f.tail) : '') + '</dd>' +
          (ai.cabins ? '<dt>Capacity</dt><dd>' + esc(ai.cabins) + '</dd>' : '') +
          (ai.cruise ? '<dt>Cruise speed</dt><dd>' + esc(ai.cruise) + '</dd>' : '') +
          (ai.wingspan ? '<dt>Wingspan</dt><dd>' + esc(ai.wingspan) + '</dd>' : '') +
          '</dl>' +
          (ib ? '<div class="inbound"><b>Where’s this aircraft coming from?</b><br>' + esc(ib.flight) + ' from ' + esc(ib.fromName || ib.from) +
                '<br><span class="muted">Departs ' + t(ib.dep) + ' · arrives ' + t(ib.arr) + '</span></div>' : '') +
        '</section>' +
        '<section class="card"><h2>Weather in ' + esc(cityOf(dest)) + '</h2>' +
          (u.weather ? '<div class="wx">' + I('weather') + '<div><b>' + esc(u.weather.tempF) + '°F</b> <span class="muted">' + esc(u.weather.tempC) + '°C</span><br>' + esc(u.weather.cond) + '</div></div>'
                     : '<p class="empty">Weather appears after loading the flight with the United bookmark.</p>') +
        '</section>' +
      '</div>' +

      '<section class="card"><h2>Inflight amenities</h2><ul class="amen">' + (amenities(s) || '<li class="empty">No amenity information</li>') + '</ul></section>' +

      '<div class="grid2">' +
        '<section class="card"><h2>Standby list</h2><div class="avail">' +
          cabins.map((c) => '<span>' + esc(c.cabin) + ' = <span class="' + (/full/i.test(c.status) ? 'full' : 'open') + '">' + esc(c.status) + '</span></span>').join('') +
          '</div>' + peopleTable(s.standby.list, 'Confirmed seats') + '</section>' +
        '<section class="card"><h2>Upgrade list</h2><div class="muted">' + esc(up.cabin) + ' availability</div>' +
          '<div class="stats"><div><span>Total seats</span><b>' + esc(up.capacity) + '</b></div><div><span>Booked</span><b>' + esc(up.booked) +
          '</b></div><div><span>Checked in</span><b>' + esc(up.checkedIn) + '</b></div></div>' +
          peopleTable(up.list, 'Upgraded to ' + esc(up.cabin)) +
          '<p class="note">This list updates as customers check in.</p></section>' +
      '</div>';
    document.title = (f.airline || '') + (f.number || '') + ' flight status';
  }

  F.onChange((s) => { state = s; render(); });
  render();
  setInterval(render, 30000);
})(window.FIDS);
