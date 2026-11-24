# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/tidy-puffin-8531/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/tidy-puffin-8531/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for protocols that record no token yet. It reads a frozen DefiLlama snapshot (758 protocols), prices a hypothetical launch for each pre-token protocol with a five-factor model — TVL × category multiple × damped 7-day growth × maturity (time tracked with no token on record) × chain reach — and renders a static dashboard: a ranked board of 226 protocols (the full 40-protocol watchlist plus 186 early finds below the $50M floor), search and chain/category/signal filters, a per-protocol detail view that recomputes its implied value from the same constants, and a concrete 7-step farm plan per protocol with capital, gas and time estimates. Protocols that already record a token are set aside at market value, never mixed into the ranking. No protocol name is special-cased anywhere: one function scores every row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node.js 22.18 or later, standard library only, no network. The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser to use the radar.

---

<sub>Entered on [make.fun](https://make.fun/?ref=s9gfzj9a&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
