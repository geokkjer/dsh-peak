/**
 * dsh-peak client bundle — the composer pricing pill, in the module-loader
 * format. This file is served as /plugins/dsh-peak/client.js and executed in
 * the browser: it registers a lazy factory with window.__ModuleLoader__.load,
 * and the factory materializes into a Cordis client plugin (apply/inject
 * exports) whose externals resolve through the loader's module table.
 *
 * The stylesheet is injected as a <style data-plugin="dsh-peak"> tag during
 * materialization; the client module loader claims and removes plugin-owned
 * tags on unload.
 */
window.__ModuleLoader__.load({
  id: 'dsh-peak',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    // ── plugin-owned stylesheet (loader claims + removes on unload) ──────────
    var style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-peak')
    style.textContent = [
      '.dsh-peak-pill {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 5px;',
      '  height: 20px;',
      '  padding: 0 8px;',
      '  border-radius: 999px;',
      '  border: 1px solid var(--dsw-alias-border-l1);',
      '  background: var(--dsw-alias-bg-layer-1);',
      '  font-size: 11px;',
      '  line-height: 1;',
      '  cursor: default;',
      '  user-select: none;',
      '  white-space: nowrap;',
      '}',
      '.dsh-peak-pill .dsh-peak-dot { width: 7px; height: 7px; border-radius: 50%; }',
      '.dsh-peak-pill.dsh-peak-on { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }',
      '.dsh-peak-pill.dsh-peak-on .dsh-peak-dot { background: var(--dsw-alias-state-error-primary); }',
      '.dsh-peak-pill.dsh-peak-off { color: var(--dsw-alias-state-success-primary); }',
      '.dsh-peak-pill.dsh-peak-off .dsh-peak-dot { background: var(--dsw-alias-state-success-primary); }',
      '.dsh-peak-pill .dsh-peak-label { font-weight: 600; letter-spacing: 0.02em; }',
      '.dsh-peak-pill .dsh-peak-next { color: var(--dsw-alias-label-secondary); font-weight: 400; }',
      '',
    ].join('\n')
    document.head.append(style)

    // Weekend off-peak rule, effective 2026-08-23 00:00 Beijing time
    // (2026-08-22T16:00:00Z): Sat+Sun (Beijing) are off-peak all day; the
    // weekday peak windows below apply Mon-Fri only.
    var WEEKEND_OFFPEAK_START = Date.UTC(2026, 7, 22, 16, 0, 0)

    // Peak windows (UTC hours, half-open): 01:00-04:00 and 06:00-10:00.
    function isPeak(date) {
      const t = date.getTime()
      if (t >= WEEKEND_OFFPEAK_START) {
        const bj = new Date(t + 8 * 3600000)
        const bjDay = bj.getUTCDay()
        if (bjDay === 0 || bjDay === 6) return false
      }
      const h = date.getUTCHours()
      return (h >= 1 && h < 4) || (h >= 6 && h < 10)
    }

    // Next instant (epoch ms) where isPeak flips: scan whole UTC hours (all
    // boundaries are at exact hours) until the state changes.
    function nextBoundary(date) {
      const now = date.getTime()
      let t = Math.ceil(now / 3600000) * 3600000
      for (let i = 0; i < 24 * 8; i++) {
        const before = new Date(t - 1000)
        const after = new Date(t)
        if (isPeak(before) !== isPeak(after)) return t
        t += 3600000
      }
      return t
    }

    const pad = (n) => String(n).padStart(2, '0')

    function PeakPill(props) {
      const timer = props.timer
      const [now, setNow] = React.useState(() => new Date())
      React.useEffect(() => {
        if (timer === undefined) return undefined
        return timer.interval(() => setNow(new Date()), 30000)
      }, [timer])
      const peak = isPeak(now)
      const next = nextBoundary(now)
      const mins = Math.max(0, Math.round((next - now.getTime()) / 60000))
      const hh = Math.floor(mins / 60)
      const mm = mins % 60
      const nextLabel = `${hh}h${pad(mm)}m`
      const bj = new Date(now.getTime() + 8 * 3600000)
      const bjDay = bj.getUTCDay()
      const weekend = bjDay === 0 || bjDay === 6
      const title = [
        'DeepSeek API pricing',
        weekend ? 'OFF-PEAK all weekend (Sat+Sun Beijing)' : (peak ? 'PEAK — 2× the off-peak rate' : 'OFF-PEAK — half of the peak rate'),
        `UTC ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} · Beijing ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())} (${weekend ? 'weekend' : 'weekday'})`,
        'Weekday peak windows (UTC): 01:00-04:00 + 06:00-10:00',
        'Weekends (Sat+Sun Beijing): off-peak all day',
        `Next switch in ${nextLabel}`,
      ].join('\n')
      return React.createElement('span', {
        className: peak ? 'dsh-peak-pill dsh-peak-on' : 'dsh-peak-pill dsh-peak-off',
        title,
        role: 'status',
      },
        React.createElement('span', { className: 'dsh-peak-dot' }),
        React.createElement('span', { className: 'dsh-peak-label' }, peak ? 'PEAK' : 'OFF-PEAK'),
        React.createElement('span', { className: 'dsh-peak-next' }, `→ ${nextLabel}`),
      )
    }

    // Required services for the pill: the slot system (hard) and the timer
    // service (optional — without it the pill renders without live updates).
    exports.inject = ['slots']

    function apply(ctx) {
      const slots = ctx.slots
      const timer = ctx.get('timer')
      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: 'dsh-peak', order: 200, label: 'DeepSeek pricing' },
        () => React.createElement(PeakPill, { timer }),
      ))
    }
    exports.apply = apply

    return module.exports
  },
})
