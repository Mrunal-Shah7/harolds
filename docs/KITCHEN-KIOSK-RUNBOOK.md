# Kitchen display kiosk runbook — Swan 1 Pro

Harold's Chicken Oak Lawn. Written so someone who has never configured the device can bring the board back during a rush.

**Device not on hand for this sprint.** These steps follow the iMin Swan 1 Pro (Android 13, 15.6″ 1920×1080) manuals plus standard Android Chrome PWA / screen-pinning practice. Confirm on the real unit before the first live service; do not treat this as a signed-off hardware test.

Kitchen URL (replace with the production host):

```
https://<store-host>/kitchen
```

Local development: `http://localhost:3000/kitchen`.

---

## 0. What this device is for

One tablet in the kitchen. Staff pick **Test Staff** (PIN `2468`) or **Test Manager** (PIN `1357`) — change those names and PINs before a live shift — then work the board. No customer should be able to walk up and tap orders through — that is what the PIN is for. Each PIN authenticates only its own account.

---

## 1. Bring a freshly reset or newly networked Swan 1 Pro up

### Power and network

1. Plug in the 24 V adapter. Power on.
2. Connect to the **store Wi-Fi** (Settings → Network & internet → Internet). Prefer 5 GHz if the kitchen AP supports it. Ethernet (RJ45 on the Swan) is better if a cable can reach the mount.
3. Confirm the tablet can open a public HTTPS page in Chrome (any page). If it cannot, the problem is the network, not the kitchen app — stop here and fix Wi-Fi/DNS/gateway.

### Chrome and the kitchen URL

4. Open **Chrome**.
5. Go to `https://<store-host>/kitchen`.
6. You should see **Sign in**, two test names, and a numeric pad. If you see a browser error:
   - **This site can’t be reached** → network or DNS. Ping the host from another device on the same LAN.
   - **Certificate warning** → the public TLS cert is wrong. The Swan will not be happy with a self-signed cert. Fix TLS on the server; do not tap through warnings on a kiosk.
   - **Blank / Next.js error** → the Node process behind the reverse proxy is down. See §4.

### Add to Home screen (full-screen PWA)

7. Chrome menu (⋮) → **Add to Home screen** / **Install app**. Name: `Kitchen`.
8. Open the installed icon, not the Chrome tab. It should launch without the address bar (`display: standalone` in the manifest).
9. If Install is missing: the page must be HTTPS (or localhost), and the manifest at `/kitchen/manifest.webmanifest` must load. Check that URL in Chrome.

### Keep the screen awake

10. Settings → Display → **Screen timeout** → the longest value, or Never if the firmware offers it.
11. Settings → Display → **Stay awake** / **Keep screen on while charging** if present (sometimes under Developer options). The kiosk should stay plugged in.
12. The PWA also requests the **Screen Wake Lock** API while the board is open. Chrome on Android releases that lock if the tab is backgrounded — that is why screen pinning (§2) matters. Wake Lock is best-effort; the Android timeout is the backstop.

### Unlock alert sound (required)

13. On the sign-in screen, **tap a name or any PIN key once** before you need an alert. Android Chrome will not play sound until a user gesture in that session. If you skip this, unacknowledged orders will flash red and stay silent. Worse than no alert at all, because it looks like the board is fine.

---

## 2. Stop the rest of Android from interfering

The Swan 1 Pro is Android 13. It does **not** ship a store-specific kiosk MDM in this project. Closest built-in equivalent:

### Screen pinning (pin windows)

1. Settings → Security (or Biometrics and security) → **Pin windows** / **App pinning** → On.
2. Turn on **Ask for PIN before unpinning**.
3. Open the installed Kitchen app.
4. Recents / Overview → tap the Kitchen icon → **Pin**.
5. To unpin later: hold **Back + Recents** (or the gesture the firmware shows), then enter the device PIN.

**What pinning does:** a stray touch is much less likely to dump the cook onto the launcher.

**What pinning does not do:** it is not MDM kiosk mode. Notifications can still peek in. The status bar may still be reachable on some firmware. A long-press of the power button still opens power-off. Be honest with whoever is mounting the device: pinning is the v1 control, not a locked kiosk.

### Notifications

- Settings → Notifications → disable or silence everything that is not Chrome / Kitchen.
- Do not sign the tablet into a personal Google account that receives mail and chat.

### Navigation chrome

- Use the **installed PWA**, not a Chrome tab, so the address bar is gone.
- Prefer 3-button navigation while pinning (easier to pin/unpin than gesture-only). Firmware menus differ; if Recents is missing, enable 3-button navigation under Settings → System → Gestures.

If a later sprint adds MDM (Android Management API `installType: KIOSK`), that will lock the device to this PWA across reboot. **Not done here.**

---

## 3. Restart the app without losing the shift

The session lasts **12 hours** and is stored on the device. Closing and reopening the Kitchen icon should return to the **board**, not the PIN pad, as long as the session was not signed out, expired, or revoked.

1. If the board is frozen: swipe it out of Recents and tap the Kitchen icon again.
2. If Chrome itself is wedged: Settings → Apps → Chrome → Force stop, then open the Kitchen icon (it still runs in the Chrome WebView/PWA container).
3. If you land on the PIN pad, the session is gone — sign in again. Orders on the server are unaffected.

---

## 4. When it is broken: network, device, or application

Work top to bottom. Do not skip.

| What you see | Likely cause | What to do |
|---|---|---|
| Board banner **Connection lost — showing last tickets** | Wi-Fi blip or server hiccup | Wait. Polling resumes on its own. Tickets stay on screen. |
| Banner never clears | Network or Node process | Phone hotspot test: if Kitchen loads on a phone on the same Wi-Fi, the tablet Wi-Fi is the problem. If nothing on the LAN can load `https://<host>/kitchen`, the server/proxy is down. |
| Sign-in then bounce back to PIN | Session rejected | Server clock wrong, session revoked, or staff account disabled. Check server time. Do not keep guessing PINs — five failures lock the account for five minutes with a countdown. |
| No sound on a red ticket | Audio never unlocked | Sign out, tap a PIN key or a name, sign in again. See §1.13. |
| Printer line in the header says **never** or a large age | Printer not polling | Use `docs/PRINT-RUNBOOK.md`. The kitchen board does **not** hide orders when print fails. |
| Android home screen | Pinning off, or a swipe to Recents | Re-pin (§2). |

Server checks (from a laptop, not the Swan):

```
curl -sS https://<store-host>/api/v1/health
```

Kitchen APIs are not public; they require a staff session. Health is enough to know Node is up.

---

## 5. Who to contact if this runbook does not resolve it

1. Whoever operates the Ubuntu host (Node process + PostgreSQL + reverse proxy + TLS).
2. Whoever holds the printer runbook (`docs/PRINT-RUNBOOK.md`) if tickets are the issue rather than the screen.
3. Do **not** call the chicken shop’s Square support for a kitchen-display outage — Square does not run this PWA.

---

## Limitations (read this; do not over-claim)

- Physical Swan 1 Pro was **not** used in Sprint 6. Desktop Chrome (including device-mode 1920×1080) was used for the PWA logic.
- Screen pinning ≠ MDM kiosk. Reboot may land on the Android launcher until someone taps Kitchen again.
- Wake Lock will not survive a backgrounded PWA; keep the device plugged in and pinned.
- Audio requires one tap per browser session. Documented because a silent red ticket is a false calm.
