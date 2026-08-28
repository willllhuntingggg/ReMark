# ReMark Chrome Web Store Assets

Editable, local-first promotional assets for the Chrome Web Store listing. This directory deliberately leaves the extension UI, side-panel behavior, text/video mark behavior, note behavior, onboarding flow, onboarding GIFs, and state logic unchanged.

## Deliverables

| Asset | Editable source | Final RGB PNG | Dimensions |
| --- | --- | --- | --- |
| Hero | `screenshots/01-hero.html` | `exports/01-hero.png` | 1280 × 800 |
| Text Mark | `screenshots/02-text-mark.html` | `exports/02-text-mark.png` | 1280 × 800 |
| Video Mark | `screenshots/03-video-mark.html` | `exports/03-video-mark.png` | 1280 × 800 |
| Note | `screenshots/04-note.html` | `exports/04-note.png` | 1280 × 800 |
| Find Your Way Back | `screenshots/05-find-way-back.html` | `exports/05-find-way-back.png` | 1280 × 800 |
| Small Promo | `promo/small-promo.html` | `exports/small-promo.png` | 440 × 280 |
| Marquee | `promo/marquee.html` | `exports/marquee.png` | 1400 × 560 |

## Design system

`shared/brand.css` is the reusable visual layer:

- **Colors** — Deep Forest Green `#204838`, Misty Harbor `#468282`, Trail Orange `#F5A623`, warm paper `#F8F4EC`.
- **Marker dots** — `.marker` (Trail Orange) and `.marker.forest`; the small dot is the recurring brand signature.
- **Trails** — `.path` renders organic, dotted SVG paths (thin, slightly imperfect, never literal hiking imagery); `assets/trail.svg` is a standalone reference element of the language.
- **Screenshot frames** — `.ui-frame` and `.panel-frame` hold the real product screenshots with a calm editorial shadow.
- **Type** — Georgia/serif headlines with a system sans body; no font files or CDNs required.

All product interface evidence comes from `assets/raw/`, captured from the current ReMark implementation:

| Raw asset | What it shows |
| --- | --- |
| `article-highlight.png` | A real article with the current `content/content.js` highlight rendering |
| `article-passage.png` | Tight crop of the highlighted passage |
| `sidepanel-text-note.png` | The real Side Panel (`sidepanel/sidepanel.html/css/js`) with a Text Mark, its Note, and a video Mark |
| `sidepanel-video-card.png` | The real video Mark card with the `1:07` timestamp |
| `youtube-video-mark.png` | A live YouTube watch page (Big Buck Bunny, Blender Foundation / CC-BY), captured in its cued-thumbnail state |

The promo HTML composes these screenshots only — no product interface is recreated in the layouts.

## Capture harness (why it exists)

`sources/` is a presentation-only harness:

- `reading-demo.html` — an editorial test article that loads the **real** `lib/i18n.js`, `lib/storage.js`, `content/content.css`, and `content/content.js`, plus a chrome-runtime mock and seeded storage.
- `sidepanel-demo.html` — generated from the **real** `sidepanel/sidepanel.html`; only resource paths and two adapter scripts are changed (see `scripts/build-demo-harness.mjs`).
- `mock-chrome.js` — fakes only the extension runtime APIs the product code calls.
- `demo-storage-bridge.js` — seeds `localStorage` with the exact Marks the screenshots need.

No production extension file is edited, copied into the layouts, or recreated.

## Re-export

Serve the repository root locally (e.g. `python3 -m http.server 4174 --bind 127.0.0.1`), then:

```bash
node store-assets/scripts/capture-real-ui.mjs     # optional: refresh raw screenshots
node store-assets/scripts/render-store-assets.mjs
python3 store-assets/scripts/validate-store-assets.py
```

`capture-real-ui.mjs` needs `playwright-core` and system Chrome; it captures the YouTube page over the network, so it is only re-run when the product UI changes. `render-store-assets.mjs` renders the seven layouts to exact-dimension RGB PNGs. The validator checks dimensions, RGB/no-alpha, required copy, and that no layout references remote resources.

If `python3 -m http.server` hangs on your machine, use any static server on another port and set `BASE_URL`.

## Validation status

All seven final PNGs are 8-bit RGB without alpha, match their required dimensions, contain the required store copy, and their layout sources reference only local files.
