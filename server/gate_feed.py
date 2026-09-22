"""
Optional local feed for the gate display: follows one gate and rolls over to the next flight.

Every cycle it starts your installed Chrome off-screen (not in automation mode), reads the airport's
departures from FlightView's own page, picks the flight currently using the gate, then reads that
flight's details from united.com's flight-status page: times and delay, boarding time, amenities,
cabins, and the upgrade/standby lists. It serves the result at http://127.0.0.1:8788/state for the
display and control pages to poll.

Run:   pip install playwright
       python server/gate_feed.py --airport EWR --gate C107
       python server/gate_feed.py --airport SFO --gate F5 --airline UA --every 120 --show

Then on the control page, tick "Follow a gate with the local feed" and leave the address as
http://127.0.0.1:8788. Nothing is uploaded anywhere: the pages fetch it from your own machine.

Personal, low-frequency use only. Automated access is against united.com's terms, and this breaks
whenever either site changes. Passenger names stay on your machine.
"""
import argparse
import json
import pathlib
import re
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = pathlib.Path(__file__).with_name(".chrome-profile")
FV_PAGE = "https://www.flightview.com/airport/{airport}/departures"
FV_API = "https://app-api.flightview.com/api/airport/{airport}/departures"
UA_PAGE = "https://www.united.com/en/us/flightstatus/details/{num}/{date}/{frm}/{to}/{carrier}"
GONE = re.compile(r"depart|in air|en route|arriv|landed|cancel", re.I)

state = {"fetchedAt": None, "flight": None, "fv": None, "united": None, "error": None, "log": []}
lock = threading.Lock()


def note(msg):
    line = time.strftime("%H:%M:%S") + "  " + msg
    print(line, flush=True)
    with lock:
        state["log"] = (state["log"] + [line])[-30:]


def norm_gate(g):
    return re.sub(r"[^A-Z0-9]", "", (g or "").upper().replace("GATE", ""))


def same_gate(a, b):
    a, b = norm_gate(a), norm_gate(b)
    if not a or not b:
        return False
    return a == b or re.sub(r"^[A-Z]+", "", a) == b or re.sub(r"^[A-Z]+", "", b) == a


class Chrome:
    """A normally-launched Chrome we attach to over the DevTools port."""

    def __init__(self, args):
        self.args = args
        self.proc = self.pw = self.br = None

    def __enter__(self):
        PROFILE.mkdir(exist_ok=True)
        pos = [] if self.args.show else ["--window-position=-2400,0"]
        self.proc = subprocess.Popen([
            self.args.chrome, f"--remote-debugging-port={self.args.cdp_port}", f"--user-data-dir={PROFILE}",
            "--no-first-run", "--no-default-browser-check", "--window-size=1300,900", *pos, "about:blank",
        ])
        self.pw = sync_playwright().start()
        for _ in range(40):
            try:
                self.br = self.pw.chromium.connect_over_cdp(f"http://127.0.0.1:{self.args.cdp_port}")
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError("could not attach to Chrome")
        ctx = self.br.contexts[0]
        return ctx.pages[0] if ctx.pages else ctx.new_page()

    def __exit__(self, *exc):
        try:
            if self.br and self.br.is_connected():
                self.br.new_browser_cdp_session().send("Browser.close")
        except Exception:
            pass
        try:
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.terminate()
        for fn in (lambda: self.br and self.br.close(), lambda: self.pw and self.pw.stop()):
            try:
                fn()
            except Exception:
                pass


def fetch_departures(page, airport):
    """FlightView's own page, then its departures feed from inside that page (same origin)."""
    page.goto(FV_PAGE.format(airport=airport), wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(3000)
    return page.evaluate(
        """async (url) => {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) throw new Error('FlightView ' + r.status);
            return (await r.json()).map((x) => ({ al: x.airlineCode, no: x.flightNumber, date: x.flightDate,
                sch: x.scheduledTime, upd: x.updatedTime, gate: x.gate, to: x.airportCode, toName: x.airport,
                st: x.displayStatus }));
        }""",
        FV_API.format(airport=airport),
    )


def pick_flight(deps, gate, airline, grace):
    """The flight now using the gate: the earliest one that hasn't gone yet (plus a grace period)."""
    cutoff = (datetime.now() - timedelta(minutes=grace)).strftime("%Y-%m-%dT%H:%M")
    at_gate = [d for d in deps if same_gate(d["gate"], gate) and (not airline or d["al"] == airline)]
    for d in sorted(at_gate, key=lambda d: d["date"] + "T" + (d["upd"] or d["sch"])):
        t = d["date"] + "T" + (d["upd"] or d["sch"])
        if t >= cutoff and not GONE.search(d["st"] or ""):
            return d
    return None


def fetch_united(page, dep):
    """The same JSON united.com's own flight-status page loads."""
    page.goto(UA_PAGE.format(num=dep["no"], date=dep["date"], frm=dep["from"], to=dep["to"], carrier=dep["al"]),
              wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)
    return page.evaluate(
        """async ({num, date, frm, to, carrier}) => {
            const tok = await (await fetch('/api/auth/anonymous-token', { credentials: 'include' })).json();
            const t = (tok.data && tok.data.token && (tok.data.token.hash || tok.data.token)) || tok.token;
            const h = { 'x-authorization-api': 'bearer ' + t };
            const get = async (u) => { const r = await fetch(u, { credentials: 'include', headers: h });
                                       if (!r.ok) throw new Error(r.status + ' for ' + u.split('?')[0]); return r.json(); };
            const status = await get(`/api/flightstatus/status/${num}/${date}/${frm}/${to}?carrierCode=${carrier}&useLegDestDate=true`);
            const seg = ((status.data.flightLegs || [])[0].OperationalFlightSegments || [])[0] || {};
            const eq = seg.Equipment || {};
            let amenities = null, upgrades = null;
            try {
                amenities = await get(`/api/flightstatus/amenities/${num}/${date}/${frm}/${to}?ownerAirlineCode=${eq.OwnerAirlineCode || ''}` +
                    `&equipmentCode=${(eq.Model && eq.Model.Key) || ''}&tailNumber=${eq.TailNumber || ''}&shipNumber=${eq.PseudoTailNumber || eq.NoseNumber || ''}`);
            } catch (e) {}
            try { upgrades = await get(`/api/flightstatus/upgradeListExtended?flightNumber=${num}&flightDate=${date}&fromAirportCode=${frm}`); } catch (e) {}
            return { fetchedAt: new Date().toISOString(), carrier, from: frm, status, amenities, upgrades };
        }""",
        {"num": str(dep["no"]), "date": dep["date"], "frm": dep["from"], "to": dep["to"], "carrier": dep["al"]},
    )


def cycle(args):
    with Chrome(args) as page:
        deps = fetch_departures(page, args.airport)
        note(f"FlightView: {len(deps)} departures from {args.airport}")
        dep = pick_flight(deps, args.gate, args.airline, args.grace)
        if not dep:
            with lock:
                state.update(fetchedAt=datetime.now().isoformat(timespec="seconds"),
                             fv={"airport": args.airport, "departures": deps},
                             error=f"No upcoming {args.airline or ''} departure at gate {args.gate}.")
            note(state["error"])
            return
        dep = {**dep, "from": args.airport}
        prev = (state.get("flight") or {}).get("no")
        if prev and str(prev) != str(dep["no"]):
            note(f"Gate {args.gate} rolled over: {prev} -> {dep['no']}")
        note(f"Gate {args.gate}: {dep['al']}{dep['no']} to {dep['to']} at {dep['upd'] or dep['sch']} ({dep['st']})")
        united = fetch_united(page, dep)
        with lock:
            state.update(fetchedAt=datetime.now().isoformat(timespec="seconds"), flight=dep,
                         fv={"airport": args.airport, "departures": deps}, united=united, error=None)


def loop(args):
    while True:
        started = time.time()
        try:
            cycle(args)
        except Exception as e:
            with lock:
                state["error"] = str(e)
            note("Cycle failed: " + str(e)[:200])
        time.sleep(max(30, args.every - (time.time() - started)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--airport", required=True, help="origin airport, e.g. EWR")
    ap.add_argument("--gate", required=True, help="gate to follow, e.g. C107")
    ap.add_argument("--airline", default="UA", help="airline code to follow at that gate ('' for any)")
    ap.add_argument("--every", type=int, default=120, help="seconds between refreshes (min 30)")
    ap.add_argument("--grace", type=int, default=10, help="keep showing a flight this many minutes past departure")
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--cdp-port", type=int, default=9333)
    ap.add_argument("--chrome", default=CHROME)
    ap.add_argument("--show", action="store_true", help="show the Chrome window")
    args = ap.parse_args()

    class Handler(BaseHTTPRequestHandler):
        def cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")   # lets an https page reach localhost

        def do_OPTIONS(self):
            self.send_response(204); self.cors(); self.end_headers()

        def do_GET(self):
            with lock:
                body = json.dumps(state).encode()
            self.send_response(200 if self.path.startswith("/state") else 404)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    class Server(ThreadingHTTPServer):
        allow_reuse_address = False      # on Windows, reuse would let two feeds silently share the port

    try:
        srv = Server(("127.0.0.1", args.port), Handler)
    except OSError:
        raise SystemExit(f"Port {args.port} is already in use. Is another gate_feed.py running?")
    threading.Thread(target=loop, args=(args,), daemon=True).start()
    print(f"Gate feed for {args.airport} {args.gate} on http://127.0.0.1:{args.port}/state  (Ctrl+C to stop)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
