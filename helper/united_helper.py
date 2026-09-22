"""
Local helper that reads United's public flight-status data for the gate display.

It starts your installed Chrome normally (not in automation mode), attaches to it over the
DevTools port, opens the united.com flight-status page for the requested flight, and records
the JSON the page itself loads: status, amenities, and the upgrade/standby lists.

Run:   python helper/united_helper.py              (opens Chrome off-screen for each fetch, then closes it)
       python helper/united_helper.py --show       (visible window, handy for debugging)
       python helper/united_helper.py --keep-open  (leave Chrome running between fetches; faster)

Then the control page / display call  http://127.0.0.1:8787/united?flight=3513&date=2026-09-22&from=EWR&to=YHZ

Personal, low-frequency use only. Automated access is against united.com's terms, and this will
break whenever the site changes. Results are cached for --ttl seconds (default 120).
"""
import argparse
import json
import pathlib
import queue
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = pathlib.Path(__file__).with_name(".chrome-profile")
DETAILS = "https://www.united.com/en/us/flightstatus/details/{flight}/{date}/{frm}/{to}/{carrier}"
WANTED = {
    "status": "/api/flightstatus/status/",
    "amenities": "/api/flightstatus/amenities/",
    "upgrades": "/api/flightstatus/upgradeListExtended",
}


class Browser:
    """Owns Chrome + Playwright. Only ever touched from the worker thread."""

    def __init__(self, args):
        self.args = args
        self.proc = self.pw = self.br = None

    def ensure(self):
        if self.proc and self.proc.poll() is None and self.br and self.br.is_connected():
            return
        self.close()
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
                return
            except Exception:
                time.sleep(0.25)
        raise RuntimeError("Could not attach to Chrome on port %d" % self.args.cdp_port)

    def fetch(self, flight, date, frm, to, carrier):
        self.ensure()
        ctx = self.br.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        got = {}

        def on_resp(r):
            for key, frag in WANTED.items():
                if frag in r.url and key not in got and r.status == 200:
                    try:
                        got[key] = r.json()
                    except Exception:
                        pass

        page.on("response", on_resp)
        try:
            page.goto(DETAILS.format(flight=flight, date=date, frm=frm, to=to, carrier=carrier),
                      wait_until="domcontentloaded", timeout=60000)
            deadline = time.time() + self.args.wait
            status_at = None
            while time.time() < deadline:
                page.wait_for_timeout(500)
                if "status" in got and status_at is None:
                    status_at = time.time()
                if len(got) == len(WANTED):
                    break
                # The lists and amenities normally follow within seconds of the status call.
                if status_at and time.time() - status_at > 10:
                    break
        finally:
            page.remove_listener("response", on_resp)
            page.goto("about:blank")
        if "status" not in got:
            raise RuntimeError("united.com did not return flight status (blocked, or wrong flight/route/date)")
        return got

    def close(self):
        # Ask Chrome to quit cleanly (no "restore pages" prompt next time), then make sure it's gone.
        try:
            if self.br and self.br.is_connected():
                self.br.new_browser_cdp_session().send("Browser.close")
        except Exception:
            pass
        try:
            if self.proc:
                self.proc.wait(timeout=5)
        except Exception:
            self.proc.terminate()
        for fn in (lambda: self.br and self.br.close(), lambda: self.pw and self.pw.stop()):
            try:
                fn()
            except Exception:
                pass
        self.proc = self.pw = self.br = None


def worker(args, jobs):
    b = Browser(args)
    while True:
        params, reply = jobs.get()
        try:
            reply.put(("ok", b.fetch(*params)))
        except Exception as e:
            reply.put(("err", str(e)))
            b.close()          # start clean next time
        if not args.keep_open:
            b.close()          # close the Chrome window once the data is in


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--cdp-port", type=int, default=9333)
    ap.add_argument("--chrome", default=CHROME)
    ap.add_argument("--ttl", type=int, default=120, help="cache seconds per flight")
    ap.add_argument("--wait", type=int, default=45, help="max seconds to wait for the page's data")
    ap.add_argument("--show", action="store_true", help="show the Chrome window")
    ap.add_argument("--keep-open", action="store_true", help="keep Chrome running between fetches")
    args = ap.parse_args()

    jobs = queue.Queue()
    threading.Thread(target=worker, args=(args, jobs), daemon=True).start()
    cache, lock = {}, threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            # Lets an https page (e.g. GitHub Pages) call this localhost server in Chrome.
            self.send_header("Access-Control-Allow-Private-Network", "true")

        def send_json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/health":
                return self.send_json(200, {"ok": True})
            if u.path != "/united":
                return self.send_json(404, {"error": "not found"})
            q = {k: v[0].strip() for k, v in parse_qs(u.query).items()}
            try:
                params = (q["flight"].upper().lstrip("UA"), q["date"], q["from"].upper(), q["to"].upper(),
                          q.get("carrier", "UA").upper())
            except KeyError:
                return self.send_json(400, {"error": "need flight, date, from, to"})
            with lock:
                hit = cache.get(params)
            if hit and time.time() - hit["t"] < args.ttl and q.get("force") != "1":
                return self.send_json(200, hit["data"])
            reply = queue.Queue()
            jobs.put((params, reply))
            kind, val = reply.get()
            if kind == "err":
                return self.send_json(502, {"error": val})
            data = {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), **val}
            with lock:
                cache[params] = {"t": time.time(), "data": data}
            self.send_json(200, data)

        def log_message(self, fmt, *a):
            print("%s  %s" % (time.strftime("%H:%M:%S"), fmt % a))

    class Server(ThreadingHTTPServer):
        allow_reuse_address = False   # on Windows, reuse would let two helpers silently share the port

    try:
        server = Server(("127.0.0.1", args.port), Handler)
    except OSError:
        raise SystemExit(f"Port {args.port} is already in use. Is another united_helper.py running?")
    print(f"United helper on http://127.0.0.1:{args.port}  (Ctrl+C to stop)")
    server.serve_forever()


if __name__ == "__main__":
    main()
