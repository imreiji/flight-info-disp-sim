# Gate Information Display Simulator

> **Amateur hobby project.** This is a fan-made imitation of United Airlines gate screens, built from a few photos. It is not nearly as accurate as the real thing: layouts, colors, fonts, wording and boarding logic are all approximations. It is not affiliated with, endorsed by, or connected to United Airlines or Star Alliance, and it must not be used for real airport operations or travel decisions. Always check the airline's official app or website for real flight information.

A static web app that looks like an airline boarding gate screen. It can pull live flight data (times, gate, aircraft, status) and lets you set the rest by hand: boarding groups, status, upgrade and standby lists, amenities, and promos.

It has no backend, so it runs on GitHub Pages.

- `index.html`: the display, a 1920x1080 layout scaled to fit any screen. Double-click or press `F` for fullscreen. `←` / `→` change the boarding group.
- `control.html`: the config and control page.

## Running it

**Locally:** serve the folder over HTTP (so localStorage and fetch behave), for example:

```sh
python -m http.server 8000
# open http://localhost:8000/control.html
```

**GitHub Pages:** push the repo, then go to Settings → Pages → Deploy from branch → `main` / root.
Then open `https://<user>.github.io/<repo>/control.html`.

## Live data

Flight data comes from [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) on RapidAPI, called directly from the browser. Subscribe to the free tier and paste your RapidAPI key into the control page. The key is stored only in your browser's localStorage and is never committed.

- **By flight number:** looks up a flight number and date. For multi-leg flights, set the origin airport.
- **By airport / gate:** lists United departures from an airport for the next ~12 hours, optionally filtered by gate or destination, and shows the next one.
- **Manual only:** no API calls; you type everything in.

Auto-refresh re-pulls the selected flight every N minutes. If both the control page and the display are open, only one of them makes each request. Tick **Freeze details** to stop a refresh from overwriting your manual edits. The quick-delay buttons tick it for you.

The upgrade and standby lists and the boarding progress are not in any public API, so they are always entered by hand.

## How the pages sync

Pages on the **same browser** share state through localStorage, so edits on `control.html` show up on the display right away (for example, a laptop driving a TV over HDMI).

For a **different device**, use **Copy link for another device**. It puts a snapshot of the current state in the URL. Later edits won't reach that device. You can optionally include the API key so the device keeps refreshing flight times on its own.

## Assets

- `assets/united-lockup.png` and `assets/star-alliance.png`: header logos (trimmed, resized, and the star lightened to white). They are trademarks of their owners and are used here only for this non-commercial fan project. **Logo image** on the control page overrides the whole header lockup.
- `assets/qr-assistance.png`: the "Need assistance?" QR code on the Flight tab, also used on the app promo. If it's missing, the Flight tab shows the estimated arrival instead.

Reference photos go in `ref/` (ignored by git). Colors and sizes are CSS variables at the top of `css/display.css`.
