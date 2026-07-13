# Calcura — All-in-One Calculator (PWA)

## What's in this build
Fully working, offline-first calculator app:

- **Basic + Scientific calculator** — brackets, %, ^, √, ∛, sin/cos/tan (DEG/RAD), log, ln, π, n!, memory (M+/M−/MR/MC), backspace, keyboard support, safe expression engine (no `eval`, no third-party libraries).
- **16 finance/utility tools**: Percentage, GST (add/remove), EMI, Loan, Age, BMI, Discount, Tip, Date Difference, Time Calculator, Fuel Cost, Profit & Loss, Simple Interest, Compound Interest, Unit Converter (length/weight/volume/temperature), Currency Converter.
- **History** — every calculation and tool result is saved, searchable, favoritable, exportable as CSV, and exportable as PDF (via the browser's print dialog — no PDF library needed).
- **Copy / Share** on every result (uses the native Share Sheet on Android/iOS, falls back to copy).
- **Voice input** (Web Speech API) and **voice result read-back** — works on Chrome/Android; not supported on all browsers, and gracefully tells the person if it isn't.
- **Haptic feedback** on key presses (`navigator.vibrate`).
- **Dark/light mode + 4 accent themes**, glassmorphism cards, ripple effect on every key.
- **English / Hindi** toggle for the app's chrome (nav labels, settings, buttons). Tool field labels are currently English-only — happy to translate those too in a follow-up if you want full Hindi coverage.
- **PWA**: installable, works offline via `service-worker.js` app-shell caching. Currency rates specifically go network-first with an offline fallback (cached last-known rates, or built-in reference rates if it's your first time offline).

## Files
```
index.html
style.css
script.js
manifest.json
service-worker.js
icons/icon-192.png
icons/icon-512.png
icons/icon-maskable-512.png
```

## Deploying (same drag-and-drop flow you've used before)
Drag the whole `calc-app` folder onto **drop.new** (Vercel), or `vercel --prod` from inside the folder. No build step — it's plain HTML/CSS/JS.

## Currency converter note
It calls the free `open.er-api.com` endpoint (no API key needed) and caches the result for 6 hours in `localStorage`. If there's no internet the first time it's opened, it shows built-in reference rates and says so on screen — replace `FALLBACK_RATES` in `script.js` with more current numbers whenever you update the app.

## Turning this into an Android APK
Two realistic paths, both need a laptop with Android Studio installed (can't be done from a phone):

1. **Capacitor (recommended, fastest)**
   ```
   npm install -g @capacitor/cli
   npx cap init calcura com.mirashyam.calcura
   npx cap add android
   npx cap copy
   npx cap open android
   ```
   Then build/sign the APK from Android Studio. Capacitor will use this `index.html` as the app's webview content as-is.

2. **PWABuilder** (no local Android Studio needed for a first pass): go to pwabuilder.com, enter your deployed URL, and it packages a signed Android App Bundle from the manifest + service worker already in this build.

Either way, the manifest already has the icons, standalone display mode, and portrait orientation Android packaging expects. A splash screen is generated automatically by Capacitor/PWABuilder from the 512×512 icon.

## What I intentionally kept lighter-weight
- Hindi translation is chrome-only, not every tool's field labels yet.
- Voice input does simple word-to-symbol parsing ("plus", "into", "divided by") — good for quick basic-calculator dictation, not a full NLP parser.
- No backup/restore-to-file yet (history/settings persist in the browser via `localStorage`, which survives reinstalls of the PWA but not a fresh browser profile).

Let me know which of these you want built out next, and I'll do it as a focused update.
