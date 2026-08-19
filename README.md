# dsh-peak

A live **peak/off-peak pricing indicator** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), shipped as an installable dual-face bundle.

DeepSeek's API moved to peak/off-peak pricing on **2026-08-16 16:00 UTC**: during peak windows the rate is **2× the off-peak rate**, and the windows line up almost exactly with Chinese work hours. This plugin makes that visible:

- **Composer pill** (browser): a small always-visible control at the left of the input row — **red "PEAK"** during peak windows, **green "OFF-PEAK"** otherwise, with a live countdown to the next switch and a hover tooltip showing UTC + Beijing times.
- **`dsh_peak_status` tool** (host): the agent can call it before suggesting or running long/expensive work, so it can warn you when you're about to pay the peak rate.

## Pricing windows

| Window | UTC | Beijing |
|---|---|---|
| Peak 1 | 01:00–04:00 | 09:00–12:00 |
| Peak 2 | 06:00–10:00 | 14:00–18:00 |
| Off-peak | everything else | — (half of peak) |

## Requirements

- A DeepSeek Harness **web profile** (the pill mounts in the browser; the tool registers host-side)
- No runtime dependencies — the host half uses a raw `ctx.tools.register` definition and the client bundle's only external is `react`

## Install

```sh
dsh plugin --profile web add dsh-peak            # once published to npm
dsh plugin --profile web add github:geokkjer/dsh-peak   # or straight from this repo
```

Or from a local checkout of this repo:

```sh
cd /path/to/dsh-peak
dsh plugin --profile web add .
```

`dsh plugin` runs `pnpm add` in the profile directory and registers the package as a bundle layer (`dsh.bundle.patch` → `cordis.patch.yml`). After the next `dsh web` restart, both halves activate: the host row registers `dsh_peak_status`, and the `dsh.client` declaration makes the browser roster serve `/plugins/dsh-peak/client.js`, mounting the pill in every session.

## Usage

Ask the agent:

- *"is it peak pricing right now?"* → calls `dsh_peak_status`
- *"run this long job off-peak"* → the agent checks `dsh_peak_status` first and reports the window

The pill itself needs no interaction: it self-updates every 30s and flips color at each window boundary.

## Development

The repo is deliberately build-free: `index.js` (host tool) and `client.js` (browser bundle in the module-loader format) are committed plain ESM, so `pnpm add` works with no `prepare` step.

```sh
npm test
```

Runs the smoke suite: host identity + tool registration, window classification at known instants (09:46 UTC → peak, next switch 10:00; 05:00 UTC → off-peak), and client bundle materialization against a stubbed module loader + React.

## License

[MIT](LICENSE)
