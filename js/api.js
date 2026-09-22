// AeroDataBox (via RapidAPI) client. Runs in the browser; the key is sent only to RapidAPI.
// Docs: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
window.FIDS = window.FIDS || {};

(function (F) {
  const HOST = 'aerodatabox.p.rapidapi.com';

  async function get(path, key) {
    if (!key) throw new Error('No API key set. Add your RapidAPI key on the control page.');
    const res = await fetch('https://' + HOST + path, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
    });
    if (res.status === 204) return [];
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j.message) msg += ': ' + j.message; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  // "2026-09-21 15:45-07:00" -> { local: '2026-09-21T15:45', offset: -420 }
  function parseTime(t) {
    if (!t || !t.local) return null;
    const m = t.local.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:([+-])(\d{2}):?(\d{2}))?/);
    if (!m) return null;
    const offset = m[3] ? (m[3] === '-' ? -1 : 1) * (+m[4] * 60 + +m[5]) : null;
    return { local: m[1] + 'T' + m[2], offset };
  }

  // Map one AeroDataBox flight into our flight shape.
  function normalize(x) {
    const dep = x.departure || {};
    const arr = x.arrival || {};
    const sched = parseTime(dep.scheduledTime);
    const rev = parseTime(dep.revisedTime) || parseTime(dep.predictedTime);
    const arrT = parseTime(arr.revisedTime) || parseTime(arr.predictedTime) || parseTime(arr.scheduledTime);
    const num = (x.number || '').replace(/\s+/g, ' ').trim();
    const [airline, number] = num.includes(' ') ? num.split(' ') : [num.slice(0, 2), num.slice(2)];
    const da = dep.airport || {}, aa = arr.airport || {};
    return {
      airline: (x.airline && x.airline.iata) || airline || '',
      number: number || '',
      originCode: da.iata || '',
      destCode: aa.iata || '',
      destLabel: F.airportLabel(aa.iata, aa.municipalityName || aa.shortName || aa.name),
      sched: sched ? sched.local : '',
      est: rev && sched && rev.local !== sched.local ? rev.local : '',
      arr: arrT ? arrT.local : '',
      gate: dep.gate || '',
      terminal: dep.terminal || '',
      aircraft: (x.aircraft && x.aircraft.model) || '',
      apiStatus: x.status || '',
      utcOffsetMin: sched && sched.offset != null ? sched.offset : undefined,
      updated: new Date().toISOString(),
    };
  }

  F.api = {
    // All legs of a flight number on a local date (YYYY-MM-DD).
    async byFlight(key, flight, date) {
      const num = flight.replace(/\s+/g, '').toUpperCase();
      const data = await get('/flights/number/' + encodeURIComponent(num) + '/' + date +
        '?withAircraftImage=false&withLocation=false&dateLocalRole=Departure', key);
      return (Array.isArray(data) ? data : [data]).map(normalize);
    },

    // Departures from an airport in a local time window (max 12 h), optionally filtered.
    async byAirport(key, airport, fromLocal, toLocal, filter) {
      const data = await get('/flights/airports/iata/' + encodeURIComponent(airport.toUpperCase()) +
        '/' + fromLocal + '/' + toLocal +
        '?withLeg=true&direction=Departure&withCancelled=true&withCodeshared=false' +
        '&withCargo=false&withPrivate=false&withLocation=false', key);
      let list = (data.departures || []).map((d) => {
        const n = normalize(d);
        if (!n.originCode) n.originCode = airport.toUpperCase();
        return n;
      });
      const f = filter || {};
      if (f.airline) list = list.filter((n) => n.airline.toUpperCase() === f.airline.toUpperCase());
      if (f.gate) list = list.filter((n) => n.gate.toUpperCase() === f.gate.toUpperCase());
      if (f.dest) list = list.filter((n) => n.destCode.toUpperCase() === f.dest.toUpperCase());
      return list.sort((a, b) => (a.est || a.sched).localeCompare(b.est || b.sched));
    },
  };

  // The next United departure from the same gate after the current flight, from a departures list.
  F.pickNext = function (s, list) {
    const f = s.flight, dep = f.est || f.sched;
    const gate = (f.gate || '').toUpperCase();
    return list.find((n) => n.gate.toUpperCase() === gate && (n.est || n.sched) > dep &&
      !(n.airline === f.airline && n.number === f.number)) || null;
  };

  F.applyNext = function (s, n) {
    if (!n) return;
    s.next.dest = n.destLabel;
    s.next.flight = n.airline + n.number;
    s.next.time = n.est || n.sched;
    s.next.status = /cancel/i.test(n.apiStatus) ? 'Cancelled' : n.est ? 'Delayed' : 'On Time';
  };

  // Refresh s.flight (and optionally s.next) from the API according to s.source.
  F.refreshFlight = async function (s, key) {
    const src = s.source;
    if (s.flight.lock || src.mode === 'manual' || !src.flight) return s;
    const legs = await F.api.byFlight(key, src.flight, src.date);
    if (!legs.length) throw new Error('No flight found for ' + src.flight + ' on ' + src.date);
    const leg = legs.find((l) => l.originCode === (src.airport || '').toUpperCase()) || legs[0];
    F.applyFlight(s, leg);
    if (src.lookupNext && s.flight.gate && s.flight.originCode) {
      const dep = s.flight.est || s.flight.sched;
      const list = await F.api.byAirport(key, s.flight.originCode, dep, F.shiftLocal(dep, 11 * 60), { airline: 'UA' });
      F.applyNext(s, F.pickNext(s, list));
    }
    return s;
  };

  F.applyFlight = function (s, leg) {
    for (const k of Object.keys(leg)) if (leg[k] !== undefined) s.flight[k] = leg[k];
  };
})(window.FIDS);
