// Client for the optional local helper (helper/united_helper.py), which reads united.com's own
// flight-status data: live times/delays, amenities, and the upgrade/standby lists with capacity.
window.FIDS = window.FIDS || {};

(function (F) {
  const LOCK = 'fids.lastUnited';

  F.fetchUnited = async function (s, force) {
    const f = s.flight, u = s.united;
    if (!f.number || !f.originCode || !f.destCode || !f.sched) throw new Error('Need flight number, origin, destination and date first.');
    const q = new URLSearchParams({
      flight: f.number, date: f.sched.slice(0, 10), from: f.originCode, to: f.destCode, carrier: f.airline || 'UA',
    });
    if (force) q.set('force', '1');
    let res;
    try {
      res = await fetch(u.url.replace(/\/$/, '') + '/united?' + q);
    } catch (e) {
      throw new Error('Helper not reachable at ' + u.url + '. Is united_helper.py running?');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status + ' from helper');
    return data;
  };

  // Scheduled refresh shared by the display and control pages (one fetch per interval).
  F.refreshUnited = async function (s, force) {
    const data = await F.fetchUnited(s, force);
    F.applyUnited(s, data);
    return s;
  };
  F.claimUnited = function (ms) {
    try {
      const last = +localStorage.getItem(LOCK) || 0;
      if (Date.now() - last < ms) return false;
      localStorage.setItem(LOCK, String(Date.now()));
    } catch (e) {}
    return true;
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
    const seg = pickSegment(d.status, f.originCode);

    // ---- times, gate, status ----
    if (seg) {
      const sched = hhmm(seg.DepartureDateTime);
      const delay = +seg.EstimatedDepartureDelayMinutes || 0;
      const statuses = seg.FlightStatuses || [];
      const byType = (t) => (statuses.find((st) => st.StatusType === t) || {}).Description || '';
      const leg = byType('LegStatus'), dep = byType('DepartureStatus');
      const all = statuses.map((st) => st.Description).join(' ');

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
        return cabinNames[i] || { Front: 'United First®', Middle: 'United Premium Plus℠', Rear: 'United Economy®' }[c];
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
