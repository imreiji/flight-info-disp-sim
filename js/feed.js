// Optional local feed (server/gate_feed.py): follows one gate, rolls over to the next flight after
// departure, and serves United + FlightView data on localhost. Pages poll it; nothing is uploaded.
window.FIDS = window.FIDS || {};

(function (F) {
  const LOCK = 'fids.lastFeed';

  F.fetchFeed = async function (s) {
    const url = (s.feed.url || '').replace(/\/$/, '') + '/state';
    let res;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      throw new Error('Feed not reachable at ' + s.feed.url + '. Is gate_feed.py running?');
    }
    if (!res.ok) throw new Error(res.status + ' from the feed');
    return res.json();
  };

  // Apply one feed reading. Returns a short status message.
  F.applyFeed = function (s, d) {
    if (!d || (!d.united && !d.fv)) throw new Error(d && d.error ? d.error : 'The feed has no data yet.');
    let msg = '';
    if (d.flight && d.fv) {
      // The server picked which flight is at the gate; follow it even before United's data lands.
      F.useFlightViewDeparture(s, d.flight, d.fv.airport);
    }
    if (d.united) F.applyUnited(s, d.united);
    if (d.fv) {
      const r = F.applyFlightView(s, d.fv);
      msg = (r && r.ok ? ' · ' + r.msg : '');
    }
    s.feed = { ...s.feed, updated: d.fetchedAt || new Date().toISOString(), error: d.error || '' };
    return (s.flight.airline + s.flight.number) + ' at gate ' + (s.flight.gate || '?') +
      ' from the local feed' + (d.error ? ' (' + d.error + ')' : '') + msg;
  };

  F.refreshFeed = async function (s) {
    return F.applyFeed(s, await F.fetchFeed(s));
  };

  // One page per interval does the fetching; the others follow through shared storage.
  F.claimFeed = function (ms) {
    try {
      const last = +localStorage.getItem(LOCK) || 0;
      if (Date.now() - last < ms) return false;
      localStorage.setItem(LOCK, String(Date.now()));
    } catch (e) {}
    return true;
  };

  // Poll loop shared by the display and control pages.
  F.startFeedPolling = function (getState, onUpdate, onError) {
    const tick = async () => {
      const s = getState();
      if (!s.feed.enabled || !s.feed.url) return;
      const every = Math.max(15, +s.feed.sec || 60) * 1000;
      if (!F.isSnapshot() && !F.claimFeed(every)) return;
      if (F.isSnapshot()) {
        if (Date.now() - (tick.last || 0) < every) return;
        tick.last = Date.now();
      }
      try {
        onUpdate(await F.refreshFeed(s));
      } catch (e) {
        onError(e.message);
      }
    };
    setInterval(tick, 10000);
    tick();
  };
})(window.FIDS);
