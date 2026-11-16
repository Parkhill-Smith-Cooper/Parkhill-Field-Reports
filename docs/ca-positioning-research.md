# CA Field Reports — positioning and tracking research

**Status:** research only. The Site Route tab's **Start Tracking** button is a
disabled, labelled placeholder. No location is read, stored or sent anywhere
in the app.

**What Site Route does today:** it rebuilds the order of a site walk from the
pins the engineer placed and the times photos were taken at each pin. Both are
exact. The dashed line shows the **order** of stops, not the path walked, and
the screen says so.

**Why this note exists:** the request was for a "Start Tracking" option that
records an engineer's route. Whether that can be done reliably depends on the
building, the device and the type of app. This note sets out the options and
their limits so the decision is made with eyes open. Platform behaviour
changes, so re-check the specifics against current Apple, Google and W3C
documentation before committing to an approach.

---

## The constraints that decide most of this

1. **GPS does not work reliably indoors.** Satellite signals are weakened or
   blocked by roofs, floors, concrete and steel. Phones fall back to Wi-Fi and
   cell positioning, which indoors is often off by **10–50 m or more**, jumps
   around, and has **no floor level**. On a construction site, with
   partly-built structure, temporary power and few or no Wi-Fi access points
   yet, it is usually worse. The app must never treat a GPS fix as indoor
   location.
2. **A web app cannot track in the background.** In a browser, or an
   installed home-screen app, the Geolocation API delivers positions only
   while the page is open and visible. When the screen locks or the engineer
   switches apps, iOS and Android stop it. Neither platform offers web apps
   background location. Background Sync and Periodic Background Sync are not
   available on iOS, and carry no location anyway.
3. **Most accurate indoor options need hardware on site, a native app, or
   both.** That is a large change for a temporary, constantly changing
   construction site.

## Options

| Approach | Typical indoor accuracy | Works in this web app? | Needs | Fit for active construction sites |
| --- | --- | --- | --- | --- |
| **Manual pins + photo times** (built) | Exact (engineer places the pin) | Yes, offline too | Nothing | **Good.** Reliable, no hardware, a genuine record |
| **Browser Geolocation** (GPS / Wi-Fi / cell) | Outdoors 3–10 m; indoors 10–50 m+, no floor | Foreground only | Location permission, HTTPS | Poor indoors. Usable for **exterior/site-level** context only |
| **Pedestrian dead reckoning** (motion sensors) | Drifts; errors grow with distance walked | Partly: DeviceMotion/Orientation in the foreground; iOS needs an explicit permission tap | Known start point, frequent correction | Poor alone. Steel and rebar disturb the compass. Could work between pins as a hint, never as a record |
| **Wi-Fi RTT** (802.11mc round-trip time) | ~1–2 m with compatible access points | **No.** Android native API only; no iOS API | RTT-capable access points installed and surveyed | Unlikely. Sites rarely have suitable Wi-Fi during construction |
| **Bluetooth LE beacons** | ~1–5 m (zone level) | **No** on iOS (no Web Bluetooth); experimental at best on Android Chrome | Native app; beacons placed and mapped per floor | Possible for long projects, but beacons must be moved as the site changes |
| **Ultra-wideband (UWB)** | ~10–30 cm | **No.** Native only (e.g. Apple Nearby Interaction) | UWB anchors on site; UWB-capable phones | High accuracy, high cost and setup. Specialist |
| **Geomagnetic / vendor indoor SDKs** | ~1–3 m after mapping | **No.** Native SDKs | Survey walk to map each floor's magnetic field | Weak. The field changes as steel goes in, so maps go stale |
| **Visual / AR positioning** (ARKit / ARCore) | Good relative tracking over short spans | **No** on iOS Safari (no WebXR AR) | Native app; anchors aligned to the drawing | Promising long-term for "where am I on this sheet", but a separate project |

## Recommendation

1. **Keep manual pins + photo-time route as the record** (built). It is exact,
   works offline, needs no hardware, and already gives the order of the walk.
2. **If more is wanted soon**, the only option that fits *this web app* is an
   opt-in **foreground breadcrumb**: while Site Route is open and tracking is
   on, sample `navigator.geolocation.watchPosition`, store each point with its
   reported `accuracy`, and show it as an uncertainty trail.
   - It should be labelled "approximate, outdoor/site-level". Points with poor
     accuracy should be discarded, and it should never be described as a
     route.
   - It stops when the screen locks. That has to be stated in the UI.
3. **For true indoor tracking**, the decision is mainly about the type of app,
   not the code:
   - It needs a native or wrapped app (e.g. Capacitor) for background
     location and Bluetooth/UWB/AR.
   - For room-level accuracy it needs site hardware (beacons or UWB anchors)
     or AR anchoring against the drawing.
   - Pilot it on one long-duration project before committing.
4. **Privacy, whichever option is chosen:** tracking an employee's movement
   needs explicit opt-in, a visible "tracking on" indicator, a clear stop
   control, a retention limit, and HR and legal review of the policy.

## What would change in the app

The data model already has everything Site Route needs: pins have positions
on sheets, and photos have timestamps. A future tracking feature would add:

- a `CaTrackPoint` record: `{ projectNumber, sessionId, t, lat?, lng?,
  accuracy?, sheetId?, x?, y?, source }`;
- a sync path through the existing outbox, with the same idempotent PUT
  pattern;
- for an indoor option, a calibration step that ties positions to the sheet's
  `x`/`y` fractions (e.g. two or three known points on the drawing).

Until a decision is made, **Start Tracking stays a disabled placeholder.**
