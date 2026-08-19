/**
 * dsh-peak — DeepSeek API peak/off-peak pricing indicator.
 *
 * A dual-face bundle plugin:
 *   - Host half (`index.js`): registers the model-visible `dsh_peak_status`
 *     tool so the agent can warn about cost before long/expensive work.
 *   - Client half (`client.js`): a composer pill (red during peak, green
 *     off-peak) with a live countdown to the next switch, mounted in the
 *     `conversation.input.left` slot.
 *
 * Zero runtime dependencies: the host registers a raw `ctx.tools.register`
 * definition (no dsh-tools import), and the client bundle is plain ESM JS in
 * the module-loader format with only `react` as an external.
 *
 * Pricing windows (official, effective 2026-08-16 16:00 UTC): peak = UTC
 * 01:00-04:00 + 06:00-10:00 (Beijing 09:00-12:00 + 14:00-18:00); off-peak is
 * exactly half of peak.
 * @module dsh-peak
 */

/** Stable Cordis plugin name. */
export const name = 'dsh-peak'

/** Hard dependency: the tool registry. */
export const inject = ['tools']

/**
 * Peak windows (UTC hours, half-open): 01:00-04:00 and 06:00-10:00.
 * @param date - the instant to classify.
 * @returns true when peak pricing applies.
 */
function isPeak(date) {
  const h = date.getUTCHours()
  return (h >= 1 && h < 4) || (h >= 6 && h < 10)
}

/**
 * Next pricing-window boundary strictly after `date` (epoch ms). Boundary
 * hours already past today are skipped so the countdown never points into the
 * past (e.g. at 09:46 UTC the next switch is 10:00, not tomorrow 01:00).
 * @param date - the instant to search from.
 * @returns epoch ms of the next boundary.
 */
function nextBoundary(date) {
  const now = date.getTime()
  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  for (let i = 1; i <= 48; i++) {
    const t = base + i * 3600000
    if (t <= now) continue
    const h = new Date(t).getUTCHours()
    if (h === 1 || h === 4 || h === 6 || h === 10) return t
  }
  return base + 48 * 3600000
}

/**
 * Apply the plugin: register the pricing-window tool.
 * @param ctx - the Cordis context (provides `tools` via inject).
 */
export function apply(ctx) {
  ctx.tools.register({
    name: 'dsh_peak_status',
    description: 'Report the current DeepSeek API pricing window: peak vs off-peak, the current UTC time and Beijing time, and minutes until the next switch. Off-peak is half the peak rate; peak windows are UTC 01:00-04:00 and 06:00-10:00 (Beijing 09:00-12:00 and 14:00-18:00). Use it before suggesting or running long/expensive work.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          peak: { type: 'boolean' },
          utcHour: { type: 'integer' },
          utcMinute: { type: 'integer' },
          beijingHour: { type: 'integer' },
          nextSwitchUtc: { type: 'string' },
          nextSwitchInMinutes: { type: 'integer' },
        },
        required: ['ok', 'summary'],
      },
      render(_args, value) {
        return [{ type: 'text', text: value.summary }]
      },
    },
    async execute() {
      const now = new Date()
      const peak = isPeak(now)
      const next = nextBoundary(now)
      const mins = Math.max(0, Math.round((next - now.getTime()) / 60000))
      const bj = new Date(now.getTime() + 8 * 3600000)
      const pad = (n) => String(n).padStart(2, '0')
      const summary = [
        `DeepSeek API: ${peak ? 'PEAK pricing (2× off-peak rate)' : 'OFF-PEAK pricing (half of peak rate)'}`,
        `UTC ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} · Beijing ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`,
        peak
          ? `peak window ends in ${Math.floor(mins / 60)}h${pad(mins % 60)}m (next switch at ${new Date(next).toISOString()})`
          : `off-peak window ends in ${Math.floor(mins / 60)}h${pad(mins % 60)}m (next switch at ${new Date(next).toISOString()})`,
      ].join('\n')
      return {
        ok: true,
        summary,
        peak,
        utcHour: now.getUTCHours(),
        utcMinute: now.getUTCMinutes(),
        beijingHour: bj.getUTCHours(),
        nextSwitchUtc: new Date(next).toISOString(),
        nextSwitchInMinutes: mins,
      }
    },
  })
}
