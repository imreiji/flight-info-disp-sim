// United live data, no install needed: a bookmarklet runs inside the user's own united.com Flight Status
// tab, calls the same JSON endpoints that page uses (status, amenities, upgrade/standby lists), and opens
// the control page with the data in the URL hash. Nothing is sent anywhere else.
window.FIDS = window.FIDS || {};

(function (F) {
  // Runs on united.com (serialised into a javascript: bookmark). Keep it self-contained.
  function grabUnited(target) {
    var toast = function (msg) {
      var n = document.createElement('div');
      n.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0c2340;color:#fff;padding:14px 18px;border-radius:8px;font:15px/1.4 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:360px';
      n.textContent = msg; document.body.appendChild(n); return n;
    };
    var send = function (key, payload, note) {
      var url = target + '#' + key + '=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
      var w = window.open(url, 'fids-control');
      if (w) { note.textContent = 'Sent to the gate display.'; setTimeout(function () { note.remove(); }, 4000); return; }
      note.textContent = 'Data ready. ';                       // popup blocked: a real click on a link is always allowed
      var a = document.createElement('a');
      a.href = url; a.target = 'fids-control'; a.textContent = 'Send to gate display';
      a.style.cssText = 'color:#8fc1ff;font-weight:bold';
      a.onclick = function () { setTimeout(function () { note.remove(); }, 500); };
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
            '&equipmentCode=' + ((eq.Model && eq.Model.Key) || '') + '&tailNumber=' + (eq.TailNumber || '') + '&shipNumber=' + (eq.PseudoTailNumber || ''));
        } catch (e) {}
        try { upgrades = await get('/api/flightstatus/upgradeListExtended?flightNumber=' + num + '&flightDate=' + date + '&fromAirportCode=' + from); } catch (e) {}
        send('united', { fetchedAt: new Date().toISOString(), carrier: carrier, from: from, status: status, amenities: amenities, upgrades: upgrades }, note);
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

  // Control page: "#fv=..." from FlightView. Sets the next departure from this gate; returns { msg, ok }, or null.
  F.importFlightViewFromHash = function (s) {
    const d = fromHash('fv');
    if (!d) return null;
    const f = s.flight;
    if (d.airport !== (f.originCode || '').toUpperCase()) {
      return { ok: false, msg: 'Those are ' + d.airport + ' departures, but this flight leaves from ' + (f.originCode || '?') + '.' };
    }
    const deps = d.departures.map((x) => ({ ...x, t: x.date + 'T' + (x.upd || x.sch) }));
    const self = deps.find((x) => x.al === f.airline && String(x.no) === String(f.number));
    if (!f.gate && self && self.gate) f.gate = self.gate;       // FlightView knows our gate too
    if (!f.gate) return { ok: false, msg: 'This flight has no gate yet, so there is no next departure from its gate.' };
    const dep = f.est || f.sched;
    const next = deps.filter((x) => x.al === f.airline && F.sameGate(x.gate, f.gate) && x.t > dep && String(x.no) !== String(f.number))
      .sort((a, b) => a.t.localeCompare(b.t))[0];
    if (!next) return { ok: false, msg: 'FlightView lists no later ' + f.airline + ' departure from gate ' + f.gate + ' today.' };
    s.next = { dest: F.airportLabel(next.to, next.toName), flight: next.al + next.no, time: next.t,
               status: /delay/i.test(next.st) ? 'Delayed' : 'On Time' };
    return { ok: true, msg: 'Next departure from gate ' + f.gate + ': ' + next.al + next.no + ' to ' + s.next.dest + ' at ' + F.fmtTime(next.t) + ' (FlightView).' };
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
      x.aircraftInfo = {
        model: eqd.Model && eqd.Model.Description, cabins: eqd.Cabins && eqd.Cabins[0] && eqd.Cabins[0].Description,
        cruise: eqd.CruiseSpeed, wingspan: eqd.Wingspan,
      };
      x.amenityText = list.filter((a) => a.Value).map((a) => ({ name: a.Name, cabin: a.Cabin || (a.Type && a.Type.Description) || '', text: [].concat(a.Value).join(' ') }));
    }

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
