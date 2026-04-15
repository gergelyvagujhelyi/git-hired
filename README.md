# git hired

> An endless runner through the tech hiring gauntlet.

A polished arcade game built from scratch in vanilla JavaScript — no frameworks,
no engine, no dependencies. Dodge rejections, collect skills, and chase the
$1M dream job offer.

**[▶ Play it live](https://gergelyvagujhelyi.github.io/git-hired/)** _(link works after deploying — see below)_

![screenshot placeholder — capture one after your first playthrough and drop it here]

## Why does this exist?

I'm job hunting. Instead of another PDF resume disappearing into an ATS, I
built something you can actually _play_ in 30 seconds. If you make it to $1M,
there's a message for you at the end.

## How it's made

- **~850 lines of vanilla JavaScript.** One file, zero dependencies.
- **HTML5 Canvas** for rendering, parallax backgrounds, particles, and the
  developer character sprite (drawn procedurally — no assets).
- **Web Audio API** for synthesized sound effects (no audio files).
- **CSS** with the Tokyo Night palette for UI and menus.
- **localStorage** for best-score persistence.

The only external dependency is a Google Font. It loads instantly from any
static host.

## Play it locally

Because it's just static files, any HTTP server works:

```bash
# pick your favourite
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

A workflow at `.github/workflows/pages.yml` ships this to Pages on every
push to `main`.

1. Push the repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The next push to `main` publishes the site. The workflow URL is
   visible in the Actions tab; the live site lands at
   `https://<user>.github.io/<repo>/`.

No build step, no dependencies — the job just uploads the directory and
tells Pages to serve it.

## Controls

| Input                     | Action                |
| ------------------------- | --------------------- |
| `Space` / `↑` / tap       | Jump (hold for higher)|
| `↓`                       | Duck                  |
| `P`                       | Pause                 |
| `M`                       | Mute                  |

Jump over bugs and walls. Duck under floating rejections. Collect skill
tiles and coffee. Coffee makes you invincible for a few seconds — and lets
you plow straight through obstacles.

## File layout

```
game/
├── index.html   # structure, menus, HUD
├── style.css    # Tokyo Night themed UI
├── game.js      # the whole game (~850 lines)
└── README.md    # this file
```

## License

MIT — do whatever you want with it. If you build something cool, I'd love to see it.
