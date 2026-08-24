/**
 * dsh-peak smoke tests: verify the host tool registers with a well-formed
 * schema, and that the client bundle materializes into a plugin registering
 * the composer pill. No harness is required.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { name, inject, apply } from '../index.js'

/** Minimal stub: a tool registry plus the optional-service getter. */
function stubContext() {
  const tools = []
  return {
    tools: {
      register: (definition) => {
        tools.push(definition)
        return () => {}
      },
    },
    get: () => undefined,
    _tools: tools,
  }
}

test('host plugin exposes the expected identity', () => {
  assert.equal(name, 'dsh-peak')
  assert.deepEqual(inject, ['tools'])
})

test('apply registers exactly the dsh_peak_status tool', () => {
  const ctx = stubContext()
  apply(ctx)
  assert.deepEqual(ctx._tools.map((tool) => tool.name), ['dsh_peak_status'])
  const tool = ctx._tools[0]
  assert.ok(tool.description.length > 0)
  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.output.render, 'function')
})

/** Freeze `new Date()` to a fixed instant while real Date parses stay real. */
function withFrozenNow(iso, fn) {
  const RealDate = Date
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(iso)
      else super(...args)
    }
    static now() { return new RealDate(iso).getTime() }
  }
  globalThis.Date = FakeDate
  try {
    return fn()
  } finally {
    globalThis.Date = RealDate
  }
}

test('dsh_peak_status execute reports the correct window and next switch', async () => {
  const ctx = stubContext()
  apply(ctx)
  const tool = ctx._tools[0]
  // 2026-08-19T09:46:00Z is inside the 06:00-10:00 peak window.
  const result = await withFrozenNow('2026-08-19T09:46:00Z', () => tool.execute({}))
  assert.equal(result.ok, true)
  assert.equal(result.peak, true)
  assert.equal(result.utcHour, 9)
  assert.equal(result.beijingHour, 17)
  assert.ok(result.nextSwitchUtc.startsWith('2026-08-19T10:00:00'))
  assert.equal(result.nextSwitchInMinutes, 14)
})

test('off-peak classification at 05:00 UTC (weekday, before weekend rule)', async () => {
  const ctx = stubContext()
  apply(ctx)
  const tool = ctx._tools[0]
  // 05:00 UTC on a weekday (Wed 2026-08-19) is between the two peak windows (off-peak).
  const result = await withFrozenNow('2026-08-19T05:00:00Z', () => tool.execute({}))
  assert.equal(result.peak, false)
  assert.ok(result.nextSwitchUtc.startsWith('2026-08-19T06:00:00'))
  assert.equal(result.nextSwitchInMinutes, 60)
})

test('weekend (Sat+Sun Beijing) is off-peak all day under the new rule', async () => {
  const ctx = stubContext()
  apply(ctx)
  const tool = ctx._tools[0]
  // 2026-08-29 is a Saturday in Beijing (after the 2026-08-23 rule start);
  // 08:00 UTC would be peak on a weekday (inside 06:00-10:00), but the
  // weekend rule makes it off-peak.
  const result = await withFrozenNow('2026-08-29T08:00:00Z', () => tool.execute({}))
  assert.equal(result.peak, false)
  // Next switch: Monday 01:00 UTC (2026-08-31) — the first weekday peak window.
  assert.ok(result.nextSwitchUtc.startsWith('2026-08-31T01:00:00'), `got ${result.nextSwitchUtc}`)
})

test('Sunday Beijing is off-peak all day', async () => {
  const ctx = stubContext()
  apply(ctx)
  const tool = ctx._tools[0]
  // 2026-08-30 is a Sunday in Beijing; 02:00 UTC would be peak on a weekday.
  const result = await withFrozenNow('2026-08-30T02:00:00Z', () => tool.execute({}))
  assert.equal(result.peak, false)
})

test('Saturday before the rule start keeps the old windows', async () => {
  const ctx = stubContext()
  apply(ctx)
  const tool = ctx._tools[0]
  // 2026-08-22 is a Saturday in Beijing but BEFORE 2026-08-23 00:00 Beijing
  // (the rule start = 2026-08-22T16:00:00Z); 08:00 UTC is inside the weekday
  // 06:00-10:00 window, so it is still peak.
  const result = await withFrozenNow('2026-08-22T08:00:00Z', () => tool.execute({}))
  assert.equal(result.peak, true)
})

test('client bundle registers a factory that mounts the pill', () => {
  const captured = []
  const window = { __ModuleLoader__: { load: (handoff) => captured.push(handoff) } }
  const doc = {
    createElement: (tag) => {
      const el = { tagName: tag, attrs: {}, textContent: '' }
      el.setAttribute = (k, v) => { el.attrs[k] = v }
      return el
    },
    head: { append: () => {} },
    querySelectorAll: () => [],
  }

  const moduleSource = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
  const sandbox = { window, document: doc, Symbol, Object }
  vm.createContext(sandbox)
  vm.runInContext(moduleSource, sandbox)

  assert.equal(captured.length, 1)
  const handoff = captured[0]
  assert.equal(handoff.id, 'dsh-peak')
  assert.equal(typeof handoff.factory, 'function')

  // Materialize: the factory requires react and returns the plugin exports.
  const fakeReact = {
    createElement: () => ({ type: 'span' }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
  }
  const plugin = handoff.factory((spec) => {
    assert.equal(spec, 'react')
    return fakeReact
  })

  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(Array.from(plugin.inject), ['slots'])

  // Applying against a stub ctx registers the pill in the input-left slot.
  // The bundle reads the DECLARED injected property `ctx.slots` (the client
  // runtime exposes declared injections as properties, not via ctx.get).
  const registrations = []
  const slots = {
    inject: (key, cb) => { assert.equal(key, 'conversation.input.left'); registrations.push(cb()) },
    register: (opts, render) => { registrations.push({ opts, render }); return () => {} },
  }
  const ctx = { slots, get: () => undefined }
  plugin.apply(ctx)
  const reg = registrations.find((r) => r.opts !== undefined && r.opts.id === 'dsh-peak')
  assert.ok(reg, 'pill registered with id dsh-peak')
  assert.equal(reg.opts.name, 'conversation.input.left')
  assert.equal(reg.opts.order, 200)
  assert.equal(typeof reg.render, 'function')
})
