// United live data, no install needed: a bookmarklet runs inside the user's own united.com Flight Status
// tab, calls the same JSON endpoints that page uses (status, amenities, upgrade/standby lists), and opens
// the control page with the data in the URL hash. It then keeps refreshing while that tab stays open and
// posts each update to the control tab. Nothing is sent anywhere else.
window.FIDS = window.FIDS || {};

(function (F) {
  // Runs on united.com (serialised into a javascript: bookmark). Keep it self-contained.
  function grabUnited(target) {
    var toast = function (msg) {
      var n = document.createElement('div');
      n.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0c2340;color:#fff;padding:14px 18px;border-radius:8px;font:15px/1.4 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:360px';
      n.textContent = msg; document.body.appendChild(n); return n;
    };
    // onWin (optional) gets the control tab's window, so later updates can go to it with postMessage.
    var send = function (key, payload, note, onWin) {
      var url = target + '#' + key + '=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
      var w = window.open(url, 'fids-control');
      if (w) { if (onWin) onWin(w); note.textContent = 'Sent to the gate display.'; setTimeout(function () { note.remove(); }, 4000); return; }
      note.textContent = 'Data ready. ';                       // popup blocked: a real click on a link is always allowed
      var a = document.createElement('a');
      a.href = url; a.target = 'fids-control'; a.textContent = 'Send to gate display';
      a.style.cssText = 'color:#8fc1ff;font-weight:bold';
      a.onclick = function (e) {
        e.preventDefault();
        var w2 = window.open(url, 'fids-control');
        if (w2 && onWin) onWin(w2);
        setTimeout(function () { note.remove(); }, 500);
      };
      note.appendChild(a);
    };

    // FlightView airport departures page: send every departure with its gate (used for "Next departure").
    if (location.hostname.indexOf('flightview.com') >= 0) {
      var ap = location.pathname.match(/airport\/([A-Za-z]{3})/);
      if (!ap) { alert("Open an airport's Departures page on FlightView, then click this bookmark again."); return; }
      var code = ap[1].toUpperCase(), fvNote = toast('Grabbing ' + code + ' departures for the gate display...');
      fetch('https://app-api.flightview.com/api/airport/' + code + '/departures', { credentials: 'include' })
        .then(function (r) { if (!r.ok) throw new Error(r.status + ' from FlightView'); return r.json(); })
        .then(function (list) {
          send('fv', { airport: code, fetchedAt: new Date().toISOString(), departures: list.map(function (x) {
            return { al: x.airlineCode, no: x.flightNumber, date: x.flightDate, sch: x.scheduledTime, upd: x.updatedTime,
                     gate: x.gate, to: x.airportCode, toName: x.airport, st: x.displayStatus };
          }) }, fvNote);
        })
        .catch(function (e) { fvNote.textContent = 'Could not grab departures: ' + e.message; });
      return;
    }

    var m = location.pathname.match(/flightstatus\/details\/(\d+)\/(\d{4}-\d{2}-\d{2})\/([A-Za-z]{3})\/([A-Za-z]{3})(?:\/([A-Za-z0-9]{2}))?/);
    if (location.hostname.indexOf('united.com') < 0 || !m) {
      alert("Open a flight on united.com Flight Status (the flight details page), or an airport's departures on FlightView, then click this bookmark again.");
      return;
    }
    var num = m[1], date = m[2], from = m[3].toUpperCase(), to = m[4].toUpperCase(), carrier = (m[5] || 'UA').toUpperCase();
    var note = toast('Grabbing ' + carrier + num + ' for the gate display...');

    // Auto-refresh: this tab keeps clicking united.com's own "Refresh now" (the page never refreshes by itself),
    // reads the answers from the page's XHRs, and posts them to the control tab. State lives on the window,
    // so clicking the bookmark again only reconnects instead of starting a second loop.
    var EVERY_MIN = 5;
    var S = window.__fidsAuto || (window.__fidsAuto = { cap: {} });
    var hm = function () { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    var badge = function (msg) {
      if (!S.badge) {
        S.badge = toast('');
        S.badge.style.top = 'auto'; S.badge.style.bottom = '16px'; S.badge.style.fontSize = '13px';
        S.badge.appendChild(document.createElement('span'));
        var stop = document.createElement('a');
        stop.href = '#'; stop.textContent = ' Stop'; stop.style.cssText = 'color:#8fc1ff;font-weight:bold;margin-left:6px';
        stop.onclick = function (e) { e.preventDefault(); clearInterval(S.timer); S.timer = null; S.badge.remove(); S.badge = null; };
        S.badge.appendChild(stop);
      }
      S.badge.firstChild.textContent = 'Gate display: ' + msg;
    };
    if (!S.hooked) {
      S.hooked = true;
      var xopen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        var x = this, u = String(url);
        var k = /flightstatus\/status\//.test(u) ? 'status' : /flightstatus\/amenities\//.test(u) ? 'amenities' : /upgradeListExtended/.test(u) ? 'upgrades' : '';
        if (k) x.addEventListener('load', function () {
          if (x.status < 200 || x.status >= 300) return;
          try { S.cap[k] = { at: Date.now(), data: x.response && typeof x.response === 'object' ? x.response : JSON.parse(x.responseText) }; } catch (e) {}
        });
        return xopen.apply(this, arguments);
      };
    }
    var tick = function () {
      if (!S.win || S.win.closed) return badge('the control page was closed. Click the bookmark to reconnect.');
      var p = location.pathname.match(/flightstatus\/details\/(\d+)\/(\d{4}-\d{2}-\d{2})\/([A-Za-z]{3})\/([A-Za-z]{3})(?:\/([A-Za-z0-9]{2}))?/);
      if (!p) return badge('paused. Open a flight details page to keep refreshing.');
      var btn = [].filter.call(document.querySelectorAll('a,button'), function (e) { return /^\s*refresh now\s*$/i.test(e.textContent); })[0];
      if (!btn) return badge('could not find "Refresh now" on this page.');
      var t0 = Date.now();
      btn.click();
      setTimeout(function () {
        var c = S.cap;
        if (!c.status || c.status.at < t0) return badge('united.com sent no new data at ' + hm() + '. Trying again in ' + EVERY_MIN + ' min.');
        S.win.postMessage({ type: 'fids-united', payload: { fetchedAt: new Date(c.status.at).toISOString(), carrier: (p[5] || 'UA').toUpperCase(), from: p[3].toUpperCase(), auto: true,
          status: c.status.data, amenities: c.amenities ? c.amenities.data : null, upgrades: c.upgrades ? c.upgrades.data : null } }, new URL(target).origin);
        badge('refreshed at ' + hm() + '. Next in ' + EVERY_MIN + ' min. Keep this tab open.');
      }, 8000);
    };
    var connect = function (w) {
      S.win = w;
      if (!S.timer) S.timer = setInterval(tick, EVERY_MIN * 60000);
      badge('auto-refresh every ' + EVERY_MIN + ' min. Keep this tab open.');
    };

    (async function () {
      try {
        var tok = await (await fetch('/api/auth/anonymous-token', { credentials: 'include' })).json();
        var t = (tok.data && tok.data.token && (tok.data.token.hash || tok.data.token)) || tok.token;
        var h = { 'x-authorization-api': 'bearer ' + t };
        var get = async function (u) {
          var r = await fetch(u, { credentials: 'include', headers: h });
          if (!r.ok) throw new Error(r.status + ' for ' + u.split('?')[0]);
          return r.json();
        };
        var status = await get('/api/flightstatus/status/' + num + '/' + date + '/' + from + '/' + to + '?carrierCode=' + carrier + '&useLegDestDate=true');
        var seg = ((status.data.flightLegs || [])[0].OperationalFlightSegments || [])[0] || {};
        var eq = seg.Equipment || {};
        var amenities = null, upgrades = null;
        try {
          amenities = await get('/api/flightstatus/amenities/' + num + '/' + date + '/' + from + '/' + to + '?ownerAirlineCode=' + (eq.OwnerAirlineCode || '') +
            '&equipmentCode=' + ((eq.Model && eq.Model.Key) || '') + '&tailNumber=' + (eq.TailNumber || '') + '&shipNumber=' + (eq.PseudoTailNumber || eq.NoseNumber || ''));
        } catch (e) {}
        try { upgrades = await get('/api/flightstatus/upgradeListExtended?flightNumber=' + num + '&flightDate=' + date + '&fromAirportCode=' + from); } catch (e) {}
        var now = Date.now();
        S.cap = { status: { at: now, data: status } };
        if (amenities) S.cap.amenities = { at: now, data: amenities };
        if (upgrades) S.cap.upgrades = { at: now, data: upgrades };
        send('united', { fetchedAt: new Date(now).toISOString(), carrier: carrier, from: from, auto: true, status: status, amenities: amenities, upgrades: upgrades }, note, connect);
      } catch (e) {
        note.textContent = 'Could not grab flight data: ' + e.message;
        setTimeout(function () { note.remove(); }, 8000);
      }
    })();
  }

  // javascript: URL for the bookmark; `target` is this site's control page.
  F.bookmarklet = function (target) {
    return 'javascript:' + encodeURIComponent('(' + grabUnited.toString() + ')(' + JSON.stringify(target) + ')');
  };

  const fromHash = (key) => {
    const m = location.hash.match(new RegExp('(?:^#|&)' + key + '=([^&]+)'));
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);  // keep data out of the address bar
    return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
  };

  // Control page: apply data handed over in "#united=...". Returns the decoded payload, or null.
  F.importUnitedFromHash = function (s) {
    const data = fromHash('united');
    if (data) F.applyUnited(s, data);
    return data;
  };

  // Pick a FlightView departure as the flight to show (then the United bookmark fills in the rest).
  F.useFlightViewDeparture = function (s, dep, airport) {
    const f = s.flight;
    const incoming = { airline: dep.al, number: String(dep.no), sched: dep.date + 'T' + dep.sch, originCode: airport };
    if (F.flightKey(incoming) !== F.flightKey(f)) F.resetFlightData(s);
    f.airline = dep.al;
    f.number = String(dep.no);
    f.originCode = airport;
    f.destCode = dep.to;
    f.destLabel = F.airportLabel(dep.to, dep.toName);
    f.sched = dep.date + 'T' + dep.sch;
    f.est = dep.upd && dep.upd !== dep.sch ? dep.date + 'T' + dep.upd : '';
    f.gate = dep.gate || '';
    f.apiStatus = /delay/i.test(dep.st) ? 'Delayed' : dep.st || '';
    f.lock = false;
  };

  // Control page: "#fv=..." from FlightView. Sets the next departure from this gate; returns { msg, ok }, or null.
  F.importFlightViewFromHash = function (s) {
    const d = fromHash('fv');
    if (!d) return null;
    return F.applyFlightView(s, d);
  };

  // Departures from FlightView: set "next departure from this gate" (and keep them for the picker).
  F.applyFlightView = function (s, d) {
    F.lastFlightView = d;
    const f = s.flight;
    if (d.airport !== (f.originCode || '').toUpperCase()) {
      return { ok: false, picker: true, msg: 'Loaded ' + d.departures.length + ' departures from ' + d.airport +
        '. This flight leaves from ' + (f.originCode || '?') + ', so pick one below to switch.' };
    }
    const deps = d.departures.map((x) => ({ ...x, t: x.date + 'T' + (x.upd || x.sch) }));
    const self = deps.find((x) => x.al === f.airline && String(x.no) === String(f.number));
    if (!f.gate && self && self.gate) f.gate = self.gate;       // FlightView knows our gate too
    if (!f.gate) return { ok: false, msg: 'This flight has no gate yet, so there is no next departure from its gate.' };
    const dep = f.est || f.sched;
    const next = deps.filter((x) => x.al === f.airline && F.sameGate(x.gate, f.gate) && x.t > dep && String(x.no) !== String(f.number))
      .sort((a, b) => a.t.localeCompare(b.t))[0];
    if (!next) return { ok: false, picker: true, msg: 'FlightView lists no later ' + f.airline + ' departure from gate ' + f.gate + ' today.' };
    s.next = { dest: F.airportLabel(next.to, next.toName), flight: next.al + next.no, time: next.t,
               status: /delay/i.test(next.st) ? 'Delayed' : 'On Time' };
    return { ok: true, picker: true, msg: 'Next departure from gate ' + f.gate + ': ' + next.al + next.no + ' to ' + s.next.dest + ' at ' + F.fmtTime(next.t) + ' (FlightView).' };
  };

  const hhmm = (t) => (t || '').slice(0, 16);                          // "2026-09-22T10:59:00" -> local wall clock
  const minsBetween = (a, b) => Math.round((Date.parse(a + ':00Z') - Date.parse(b + ':00Z')) / 60000);
  const name = (p) => (p.lastName + ', ' + p.firstName + '.').toUpperCase();

  function pickSegment(status, from) {
    const legs = (status && status.data && status.data.flightLegs) || [];
    for (const leg of legs) {
      for (const seg of leg.OperationalFlightSegments || []) {
        if (!from || (seg.DepartureAirport && (seg.DepartureAirport.IATACode || seg.DepartureAirport) === from)) return seg;
      }
    }
    return legs[0] && legs[0].OperationalFlightSegments && legs[0].OperationalFlightSegments[0];
  }
  const code = (a) => (a && (a.IATACode || a.Code)) || (typeof a === 'string' ? a : '');
  // "Halifax, NS, CA (YHZ)" -> "Halifax, NS (YHZ)"; known codes use our gate-screen names.
  const label = (a) => {
    const c = code(a);
    if (F.AIRPORTS[c]) return F.airportLabel(c);
    const n = (a && a.Name) || '';
    return n.replace(/,\s*[A-Z]{2,3}\s*(\([A-Z]{3}\))$/, ' $1') || c;
  };

  F.applyUnited = function (s, d) {
    const f = s.flight, x = { updated: d.fetchedAt || new Date().toISOString() };
    const seg = pickSegment(d.status, d.from || f.originCode);
    if (seg) {
      const incoming = { airline: d.carrier || f.airline, number: seg.FlightNumber, sched: hhmm(seg.DepartureDateTime), originCode: code(seg.DepartureAirport) };
      if (F.flightKey(incoming) !== F.flightKey(f)) F.resetFlightData(s);
    }
    if (d.carrier) f.airline = d.carrier;

    // ---- times, gate, status ----
    if (seg) {
      const sched = hhmm(seg.DepartureDateTime);
      const delay = +seg.EstimatedDepartureDelayMinutes || 0;
      const statuses = seg.FlightStatuses || [];
      const byType = (t) => (statuses.find((st) => st.StatusType === t) || {}).Description || '';
      const leg = byType('LegStatus'), dep = byType('DepartureStatus');
      const all = statuses.map((st) => st.Description).join(' ');

      if (seg.FlightNumber) f.number = String(seg.FlightNumber);
      if (code(seg.DepartureAirport)) f.originCode = code(seg.DepartureAirport);
      f.sched = sched;
      f.est = delay > 0 ? hhmm(seg.EstimatedDepartureTime) : '';
      f.arr = hhmm(seg.EstimatedArrivalTime) || hhmm(seg.ArrivalDateTime);
      if (seg.DepartureGate) f.gate = seg.DepartureGate;
      if (seg.DepartureTerminal) f.terminal = seg.DepartureTerminal;
      if (seg.DepartureUTCDateTime) f.utcOffsetMin = minsBetween(sched, hhmm(seg.DepartureUTCDateTime));
      const dest = code(seg.ArrivalAirport);
      if (dest) { f.destCode = dest; f.destLabel = label(seg.ArrivalAirport); }
      x.originLabel = label(seg.DepartureAirport);
      const eq = seg.Equipment || {};
      if (eq.Model && eq.Model.Description) f.aircraft = eq.Model.Description;
      if (eq.TailNumber) f.tail = eq.TailNumber;
      // United's own boarding time sets how early boarding starts.
      if (seg.BoardTime) {
        const lead = minsBetween(sched, sched.slice(0, 11) + seg.BoardTime.slice(0, 5));
        if (lead > 0 && lead < 120) s.boarding.leadMin = lead;
      }
      f.apiStatus = /cancel/i.test(all) ? 'Canceled'
        : /^(departed|in flight|arrived|landed)/i.test(leg) ? 'Departed'
        : dep || leg;
      x.delayMin = delay;
      x.reason = (statuses.find((st) => st.StatusType === 'FlightStatus') || {}).Description || '';
      x.arrSched = hhmm(seg.ArrivalDateTime);
      x.arrGate = seg.ArrivalGate || '';
      x.arrTerminal = seg.ArrivalTerminal || '';
      x.baggage = seg.BaggageClaim || '';
      x.arrDelayMin = +seg.EstimatedArrivalDelayMinutes || 0;
      x.international = /true/i.test(seg.IsInternational);
      x.delayCause = ((seg.ReasonStatuses || []).find((r) => r.IsDelayEffective) || {}).CustomerFacingDescription || '';
      const sched0 = (((d.status.data.flightLegs || [])[0] || {}).ScheduledFlightSegments || [])[0] || {};
      // Save the reason: "Late aircraft", else the detail in "Estimated Departure 51 Minutes Late (Awaiting aircraft)".
      const detail = (x.reason.match(/\(([^)]+)\)/) || [])[1] || '';
      f.delayReason = delay > 0 ? (x.delayCause || detail) : '';
      x.codeshares = (sched0.MarketedFlightSegment || []).map((m) => m.MarketingAirlineCode + m.FlightNumber);
      x.arrStatus = byType('ArrivalStatus');
      x.depStatus = dep;
      x.operator = (seg.OperatingAirline && (seg.OperatingAirline.Name || seg.OperatingAirline.IATACode)) || '';
      const ib = seg.InboundFlightSegment;
      if (ib && ib.FlightNumber) {
        x.inbound = { flight: (ib.CarrierCode || '') + ib.FlightNumber, from: ib.DepartureAirport, fromName: ib.DepartureAirportName,
                      dep: hhmm(ib.DepartureDate), arr: hhmm(ib.ArrivalDate) };
      }
      const wx = (d.status.data.currentWeather || []).find((w) => w.AirportCode === f.destCode);
      if (wx) x.weather = { tempF: wx.Temperature && wx.Temperature.Farenheit, tempC: wx.Temperature && wx.Temperature.Celsius, cond: wx.WeatherCondition };
    }

    // ---- amenities ----
    const am = Array.isArray(d.amenities) ? d.amenities[0] : null;
    let cabinNames = [];
    if (am) {
      const list = am.Amenities || [];
      const val = (n) => list.filter((a) => a.Name === n).map((a) => [].concat(a.Value || []).join(' ')).join(' ');
      const ent = val('Entertainment');
      const power = val('InseatPower');
      const rows = power.match(/rows?\s+(\d+)\s+(?:through|to|-)\s+(\d+)/i);
      const econMeal = list.filter((a) => a.Name === 'Meal').pop();
      s.amenities = {
        wifi: /yes/i.test(val('Wifi')) ? (/wi-?fi[^.]*free/i.test(ent) && !/purchase/i.test(ent) ? '(Free)' : '($)') : '',
        power: rows ? 'Rows ' + rows[1] + '-' + rows[2] : /every|all/i.test(power) ? 'All rows' : power ? 'Available' : '',
        entertainment: /yes/i.test(val('AVOD')) || /yes/i.test(val('Streaming')) || /entertainment is offered/i.test(ent),
        food: econMeal ? (/purchase/i.test(econMeal.Description + ' ' + [].concat(econMeal.Value || []).join(' ')) ? '($)' : '(Free)') : '',
        beverages: list.some((a) => a.Name === 'Beverages'),
      };
      cabinNames = list.filter((a) => a.Name === 'Seating' && a.Cabin).map((a) => a.Cabin);
      const eqd = am.Equipment || {};
      // Widebodies often have no Seating entries, but the capacity line always names the cabins, front to back:
      // "64 United Polaris® business, 35 United Premium Plus®, 123 United Economy®"
      const capLine = (eqd.Cabins && eqd.Cabins[0] && eqd.Cabins[0].Description) || '';
      if (!cabinNames.length && capLine) cabinNames = capLine.split(',').map((c) => c.replace(/^\s*\d+\s*/, '').trim()).filter(Boolean);
      x.aircraftInfo = {
        model: eqd.Model && eqd.Model.Description, cabins: eqd.Cabins && eqd.Cabins[0] && eqd.Cabins[0].Description,
        cruise: eqd.CruiseSpeed, wingspan: eqd.Wingspan,
      };
      x.amenityText = list.filter((a) => a.Value).map((a) => ({ name: a.Name, cabin: a.Cabin || (a.Type && a.Type.Description) || '', text: [].concat(a.Value).join(' ') }));
    }

    // ---- per-cabin details in the status response: always present, names every cabin front to back ----
    const eqs = (seg && seg.Equipment) || {};
    const lca = eqs.ListOfCabinsAmenities || [];
    if (lca.length) {
      cabinNames = lca.map((c) => c.CabinHeader).filter(Boolean);        // "United Polaris® business", ...
      const val = (c, n) => ((c.Amenities || []).find((a) => a.Name === n) || {}).Value || '';
      const offered = (v) => !!v && !/not offered|not available/i.test(v);
      const econ = lca[lca.length - 1];
      const a = s.amenities;
      if (!am) {                                                          // amenities call failed: fill in from here
        a.power = offered(val(econ, 'InseatPower')) ? 'All rows'
          : lca.some((c) => offered(val(c, 'InseatPower'))) ? (lca[0].CabinHeader || 'Front cabin') : '';
        a.entertainment = lca.some((c) => /entertainment/i.test(val(c, 'Entertainment')));
        a.beverages = true;
      }
      const wifi = lca.map((c) => val(c, 'WiFi')).filter(offered);
      a.wifi = wifi.length ? (wifi.some((w) => /free/i.test(w)) ? '(Free)' : '($)') : '';
      x.wifiText = val(econ, 'WiFi') || val(lca[0], 'WiFi');             // "Internet by Starlink, free for MileagePlus® members"
      x.cabinAmenities = lca.map((c) => ({
        cabin: c.CabinHeader,
        items: (c.Amenities || []).filter((i) => i.Name !== 'Aircraft specs').map((i) => ({ name: i.Name, text: i.Value })),
      }));
    }
    x.wifiProvider = (eqs.Amenities && eqs.Amenities.WifiPrvdr) || '';   // "Starlink", "Panasonic", ...
    s.amenities.wifiProvider = x.wifiProvider;

    // ---- upgrade / standby lists with capacity ----
    const up = d.upgrades;
    if (up && up.pbts) {
      const order = ['Front', 'Middle', 'Rear'];
      const pbts = order.map((c) => up.pbts.find((p) => p.cabin === c)).filter(Boolean);
      const cabinName = (c) => {
        const i = pbts.findIndex((p) => p.cabin === c);
        if (cabinNames[i]) return cabinNames[i];
        // United's data often leaves widebody cabins unnamed: use United's branding rules.
        const threeCabin = pbts.some((p) => p.cabin === 'Middle');
        const front = x.international ? (threeCabin ? 'United Polaris® business' : 'United Business®') : 'United First®';
        return { Front: front, Middle: 'United Premium Plus℠', Rear: 'United Economy®' }[c];
      };
      const front = up.pbts.find((p) => p.cabin === 'Front') || {};
      const ciFront = (up.checkInSummaries || []).find((c) => c.cabin === 'Front') || {};
      const full = (p) => p.booked >= (p.authorized || p.capacity);
      const people = (sec) => [
        ...((sec && sec.cleared) || []).map((p) => ({ name: name(p), ci: !!p.isCheckedIn, seat: p.seatNumber || '--' })),
        ...((sec && sec.standby) || []).map((p) => ({ name: name(p), ci: !!p.isCheckedIn, seat: '' })),
      ];
      s.upgrades = {
        cabin: cabinName('Front'),
        capacity: front.capacity != null ? front.capacity : '',
        booked: front.booked != null ? (full(front) ? 'Full' : front.booked) : '',
        checkedIn: ciFront.total != null ? ciFront.total : '',
        list: people(up.front),
      };
      s.standby = {
        cabins: pbts.map((p) => cabinName(p.cabin) + ' = ' + (full(p) ? 'Full' : 'Available')).join('\n'),
        list: [...people(up.middle), ...people(up.rear)],
      };
    }

    s.united = { ...s.united, ...x, error: '' };
  };
})(window.FIDS);
