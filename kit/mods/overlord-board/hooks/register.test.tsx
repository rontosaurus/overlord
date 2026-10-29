import { test, expect, mock } from 'claude-code/testing'

import { alarms, compose, cut, distil, flatten, rule } from './register'

// a sample of the board.json shape (agents/bin/board --json); rendered_epoch far in the future = fresh
const FRESH = 4_000_000_000
const sample = (over: Record<string, unknown> = {}) => JSON.stringify({
  rendered: '1999-12-31T19:59:44', rendered_epoch: FRESH,
  last_wake: 'quiet night, nothing to do',
  asks_open: 2,
  tick: { finished: '1999-12-31T06:04:14Z', mode: 'propose', subtype: 'success' },
  ceiling: { usd_used: 1.0665, usd_ceiling: 10, spent: false },
  limits: { wip_initiatives: 5, ask_backpressure: 4 },
  errors: [{ section: 'Open initiatives', line: 27, msg: 'row has 4 cells' }],
  cards: [
    { col: 'open', id: '10-site', title: '10-site', status: 'running tests' },
    { col: 'running', id: '20-docs', title: '20-docs', status: 'writing' },
    { col: 'waiting', id: '#1', title: '#1', status: 'restart the worker' },
    { col: 'waiting', id: '#2', title: '#2', status: 'rotate the key' },
    { col: 'autonomous', kind: 'act', id: 'act:2', status: 'restarted a pod (undo: rollout undo)' },
    { col: 'autonomous', kind: 'brief', id: 'brief', excerpt: '# Morning brief\n**Bottom line:** Nothing new broke overnight.' },
    { col: 'history', id: 'log:1', title: 'old' },
  ],
  strategist: {
    next: { updated: '1999-12-31 06:12', age_hours: 13, now: 'reply to ask #1, daytime', deck: 'docs pass', week: 'unset' },
    priorities: [
      { '#': '1', slot: 'reply', what: 'Restart the worker (ask #1)', 'next (who)': 'reply "go #1" (you)' },
      { '#': '2', slot: 'tap', what: 'two failed units', 'next (who)': 'reply "clear them" (framework)' },
      { '#': '3', slot: 'tap', what: 'renewal check', 'next (who)': 'open the registrar (you)' },
      { '#': '4', slot: 'decide', what: 'pick a title', 'next (who)': 'read the draft (framework)' },
    ],
    threads: [
      { thread: 'Domain renewal', 'waiting on': 'you at the registrar', since: '12-01', tag: 'owner' },
      { thread: 'Vendor quote', 'waiting on': 'the vendor', since: '12-02', tag: 'vendor' },
    ],
    arc: [
      { spec: '01', alarms: 'STALE' }, { spec: '02', alarms: '—' }, { spec: '03', alarms: 'DEAD STALE' },
    ],
  },
  ...over,
})

// every block carries a heading row, so 14 rows show all three priorities under two alarm rows; `SHORT` collapses the blocks
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 14, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as any
const SHORT = { ...BAND, props: { ...BAND.props, maxRows: 8 } }
const PANE = { component: 'Pane', requestId: 'overlord-board', props: { title: 'Board', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as any

// beneath the plugin: the engine answers file reads with the sample, usage with a 34K context, and draws an empty band itself
const world = (on: any, body: string | null = sample(), env: Record<string, string> = {}) => {
  const clock = mock.clock(on)
  mock.env(on, { AGENTS_REPO: '/r', ...env })
  const read: string[] = []
  const opened: string[] = []
  const ran: string[][] = []
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('ui.open', (_: any, e: any) => { opened.push(e.id); return { value: { isPlaced: true } } })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 34_000, window: 200_000 }, rateLimits: [] } }))
  on('fs.read', (_: any, e: any) => {
    read.push(e.path)
    return body == null ? { deny: 'no such file' } : { value: body }
  })
  on('process.run', (_: any, e: any) => { ran.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '' } } })
  on('ui.render', ($: any, e: any) => { const { Box } = $.ui.resolve(e); return <Box /> })
  return { clock, read, opened, ran }
}

test('distil keeps the few fields the band draws', () => {
  const b = distil(JSON.parse(sample()))
  expect(b.now).toBe('reply to ask #1, daytime')
  expect(b.priorities.length).toBe(4)
  expect(b.priorities[0]?.slot).toBe('reply')
  expect(b.open).toBe(2)
  expect(b.waiting).toEqual(['#1 restart the worker', '#2 rotate the key'])
  expect(b.acts.length).toBe(1)
  expect(b.tick).toBe('12-31 06:04 propose success')
  expect(b.ceiling).toBe('$1.07/$10')
  expect(b.arcAlarms).toEqual(['01 STALE', '03 DEAD STALE'])
  expect(b.threads.length).toBe(1)
  expect(b.errors).toBe(1)
  expect(b.wipInitiatives).toBe(5)
  expect(b.brief).toContain('Nothing new broke overnight')
})

test('distil survives an empty document', () => {
  const b = distil({})
  expect(b.priorities).toEqual([])
  expect(b.tick).toBe('none')
  expect(b.askBackpressure).toBe(4)
})

test('the band draws now, the top three, the alarms and the foot from the local file, on terminal and desktop', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(w.read[0] === '/r/agents/state/board/board.json').toBe(true)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'overlord-board', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /OVERLORD/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Priorities/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Alarms/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /reply to ask #1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /renewal check/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx 34K\/150K/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /two failed units/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /arc · 01 STALE · 03 DEAD STALE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /could not parse 1 row/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /tick · 12-31 06:04 propose success · ran 1 · asks 2 · open 2/ })).toBeDefined()
    // a fresh board, WIP under the limits: no stale row, no WIP row; the 4th priority is not in the band
    expect(await ui.find({ type: 'Text', text: /board stale/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /WIP/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /pick a title/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('OVERLORD_BOARD_FILE changes the path that is read', async ($, on) => {
  const w = world(on, sample(), { OVERLORD_BOARD_FILE: '/data/my-board.json' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(w.read[0]).toBe('/data/my-board.json')
})

test('a missing file draws nothing, and a later good read fills the band', async ($, on) => {
  let body: string | null = null
  const clock = mock.clock(on)
  mock.env(on, { AGENTS_REPO: '/r' })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200_000 }, rateLimits: [] } }))
  on('fs.read', () => (body == null ? { deny: 'no such file' } : { value: body }))
  on('ui.render', ($: any, e: any) => { const { Box } = $.ui.resolve(e); return <Box /> })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /tick ·/ })).toBeUndefined()
  await ui.unmount()
  body = sample()
  await clock.advance(61_000)
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /reply to ask #1/ })).toBeDefined()
  await ui.unmount()
})

test('a malformed file is treated like a missing one', async ($, on) => {
  world(on, 'this is not json')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /tick ·/ })).toBeUndefined()
  await ui.unmount()
})

test('a stale board and WIP over the limits are alarm rows; a survey hides the band', async ($, on) => {
  const many = Array.from({ length: 6 }, (_, i) => ({ col: 'open', id: `i${i}`, title: `i${i}`, status: 'x' }))
  const w = world(on, sample({ rendered_epoch: 1, asks_open: 5, cards: many }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.advance(61 * 60_000)
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /^✖ board stale/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /WIP 6\/5 initiatives · 5\/4 asks/ })).toBeDefined()
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /BOARD|WIP/ })).toBeUndefined()
  await ui.unmount()
})

test('/board opens the pane, which lists every priority, the threads waiting on you and the autonomous actions', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'board', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
  expect(r.text).toBe('Board pane opened.')
  expect(w.opened).toEqual(['overlord-board'])
  expect(w.ran).toEqual([])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'overlord-board', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /pick a title/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /read the draft/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Domain renewal/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Vendor quote/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /restarted a pod/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Asks · 2 open of 2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Nothing new broke overnight/ })).toBeDefined()
    await ui.unmount()
  }
})

test('/board refresh runs agents/bin/board once, then opens the pane', async ($, on) => {
  const w = world(on, sample(), { OVERLORD_BOARD_PYTHON: 'py' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'board', args: 'refresh', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
  expect(r.text).toBe('Board re-rendered. Board pane opened.')
  expect(w.ran).toEqual([['py', '/r/agents/bin/board']])
})

test('with no board the pane says where it looked', async ($, on) => {
  world(on, null)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /No board at \/r\/agents\/state\/board\/board\.json/ })).toBeDefined()
  await ui.unmount()
})

test('without AGENTS_REPO nothing is read or run, and the pane says so', async ($, on) => {
  const w = world(on, sample(), { AGENTS_REPO: '' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(w.read).toEqual([])
  const r = await $.command.run({ command: 'board', args: 'refresh', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
  expect(r.text).toMatch(/AGENTS_REPO is not set/)
  expect(w.ran).toEqual([])
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /AGENTS_REPO is not set/ })).toBeDefined()
  await ui.unmount()
})

test('control characters in board.json strings are removed', () => {
  const b = distil({ last_wake: 'ok\u001b[2Jx\u0007y\u009bz', strategist: { next: { now: 'a\u001bb' }, priorities: [{ '#': '1', slot: 'tap\u001b', what: 'w\u0000x', 'next (who)': 'n\u007fm' }] } })
  expect(b.lastWake).not.toMatch(/[\x00-\x1f\x7f-\x9f]/)
  expect(b.now).not.toMatch(/[\x00-\x1f\x7f-\x9f]/)
  expect(JSON.stringify(b.priorities)).not.toMatch(/\\u00(0|1|7f|9)/)
})

// ---- review line, headed blocks, the guard-deny alarm ----
const REVIEW = { last_review: '1999-12-20', days_since: 11, debriefs_since: 2, drift_since: { 'hook-block': 3 } }
const doc = (over: Record<string, unknown> = {}): any => {
  const d = JSON.parse(sample({ errors: [], ...over }))
  d.strategist.arc = [] // no arc alarms: the only alarm rows are the ones a test asks for
  return d
}
const flat = (l: any): string => l.segs.map((sg: any) => sg[1]).join('')
const heads = (lines: any[]): string[] => lines.map(flat).filter(t => t.startsWith('── ')).map(t => t.replace(/[ ─]+$/, ''))
const inputs = (b: any, over: Record<string, unknown> = {}): any => ({ b, now: 1_000_000_000_000, staleMin: 60, ctxK: 34, sinceMs: 5 * 60_000, width: 120, ...over })
const blk = (title: string, n: number) => ({ head: rule(title, 'plain', 40), lines: Array.from({ length: n }, (_, k) => ({ segs: [['plain', `${title}${k}`]] as [string, string][] })) })

test('distil reads the review block and the deny count, and survives their absence or junk', () => {
  const b = distil(doc({ review: REVIEW, alarms: { recent_denies: 2 } }))
  expect(b.review).toEqual({ lastReview: '1999-12-20', daysSince: 11, debriefsSince: 2 })
  expect(b.recentDenies).toBe(2)
  const none = distil(doc())
  expect([none.review, none.recentDenies]).toEqual([null, 0])
  const junk = distil(doc({ review: 'junk', alarms: [] }))
  expect([junk.review, junk.recentDenies]).toEqual([null, 0])
  const unmarked = distil(doc({ review: { last_review: null, days_since: null, debriefs_since: null, drift_since: null }, alarms: null }))
  expect(unmarked.review).toEqual({ lastReview: '', daysSince: null, debriefsSince: null })
  const hostile = distil(doc({ review: { last_review: '1999-12-20\u001b[2J', days_since: -5, debriefs_since: 'x' }, alarms: { recent_denies: 'NaN' } }))
  expect(hostile.review).toEqual({ lastReview: '', daysSince: 0, debriefsSince: null })
  expect(hostile.recentDenies).toBe(0)
})

test('compose: each area is a block with a heading row, and a block with nothing in it is left out', () => {
  const plain = compose(inputs(distil(doc())))
  expect(heads(plain.body)).toEqual(['── OVERLORD', '── Priorities']) // no review block: no Overmind heading
  expect(plain.alerts).toEqual([])
  expect(flat(plain.foot)).toContain('tick · 12-31 06:04 propose success · ran 1 · asks 2 · open 2')
  const withReview = compose(inputs(distil(doc({ review: REVIEW }))))
  expect(heads(withReview.body)).toEqual(['── OVERLORD', '── Priorities', '── Overmind'])
  expect(withReview.body.map(flat).some(t => t === '  review · last 1999-12-20 · 11 days ago · 2 debriefs since')).toBe(true)
  const d = doc({ review: REVIEW }); d.strategist.priorities = []
  expect(heads(compose(inputs(distil(d))).body)).toEqual(['── OVERLORD', '── Overmind']) // nothing ranked: no Priorities heading
  const first = distil(doc({ review: { ...REVIEW, days_since: 1, debriefs_since: 1 } }))
  expect(compose(inputs(first)).body.map(flat).some(t => t.endsWith('1 day ago · 1 debrief since'))).toBe(true)
  const unmarked = distil(doc({ review: { last_review: null, days_since: null, debriefs_since: null } }))
  expect(compose(inputs(unmarked)).body.map(flat).some(t => t === '  review · none yet')).toBe(true)
})

test('compose: a short band keeps every heading and cuts each block to its first N lines', () => {
  const b = distil(doc({ review: REVIEW }))
  const lines = (rows: number) => compose(inputs(b, { rows })).body.map(flat)
  expect(lines(30).length).toBe(9) // OVERLORD 1+2, Priorities 1+3, Overmind 1+1
  const eight = lines(9) // budget 8: two lines per block, so the third priority goes
  expect(eight.length).toBe(8)
  expect(eight.filter(t => /^ {2}\d /.test(t)).length).toBe(2)
  expect(eight.some(t => /renewal check/.test(t))).toBe(false)
  const one = lines(7) // budget 6: one line per block
  expect(one.length).toBe(6)
  expect(heads(compose(inputs(b, { rows: 7 })).body)).toEqual(['── OVERLORD', '── Priorities', '── Overmind'])
  expect(one.filter(t => !t.startsWith('── '))).toEqual([expect.stringContaining('now ·'), expect.stringContaining('reply'), expect.stringContaining('review ·')])
})

test('compose: alarm rows are reserved first, so a short band loses blocks and lines rather than alarms', () => {
  const b = distil(doc({ review: REVIEW, rendered_epoch: 1, alarms: { recent_denies: 1 } }))
  const out = compose(inputs(b, { rows: 9 }))
  expect(heads(out.alerts)).toEqual(['── Alarms'])
  expect(out.alerts.length).toBe(3) // heading, stale board, guard deny
  expect(out.body.length).toBeLessThanOrEqual(5) // 9 rows - foot - 3 alarm rows
  expect(heads(out.body)).toEqual(['── OVERLORD', '── Priorities']) // the Overmind block went whole, not down to a bare heading
})

test('flatten: the largest N that fits, never below one line; empty blocks have no heading', () => {
  const text = (blocks: any[], budget: number) => flatten(blocks, budget).map(flat).map(t => t.replace(/[ ─]+$/, ''))
  const three = [blk('a', 3), blk('b', 2), blk('c', 0)]
  expect(text(three, 99)).toEqual(['── a', 'a0', 'a1', 'a2', '── b', 'b0', 'b1'])
  expect(text(three, 6)).toEqual(['── a', 'a0', 'a1', '── b', 'b0', 'b1'])
  expect(text(three, 5)).toEqual(['── a', 'a0', '── b', 'b0'])
  expect(text(three, 4)).toEqual(['── a', 'a0', '── b', 'b0'])
  expect(text(three, 3)).toEqual(['── a', 'a0', 'a1']) // no room for a heading and a line each: the last block goes whole
  expect(text(three, 1)).toEqual(['── a', 'a0']) // the first block always stays
  expect(flatten([blk('c', 0)], 9)).toEqual([])
})

test('cut: a long row ends in an ellipsis and keeps its uncut text; a short one is returned as it was', () => {
  const long = { segs: [['dim', '  now · '], ['plain', 'x'.repeat(100)]] as [string, string][] }
  const c = cut(long, 40)
  expect(flat(c).length).toBe(40)
  expect(flat(c).endsWith('…')).toBe(true)
  expect(c.full).toBe(flat(long))
  expect(c.segs[1]?.[0]).toBe('plain')
  const short = { segs: [['plain', 'ok']] as [string, string][] }
  expect(cut(short, 40)).toBe(short)
  expect(cut(short, 40).full).toBeUndefined()
  const out = compose(inputs(distil(doc({ last_wake: 'x' })), { width: 12 })) // narrower than the 30-column floor
  expect(out.body.every(l => flat(l).length <= 30)).toBe(true)
  expect(out.body.some(l => l.full !== undefined)).toBe(true)
})

test('compose: a slot that names an Object.prototype member draws plain and cannot throw', () => {
  const d = doc(); d.strategist.priorities = [
    { '#': '1', slot: '__proto__', what: 'proto', 'next (who)': 'n' }, { '#': '2', slot: 'constructor', what: 'ctor', 'next (who)': 'n' },
    { '#': '3', slot: 'tap', what: 'real', 'next (who)': 'n' },
  ]
  const rows = compose(inputs(distil(d))).body.filter(l => /^ {2}\d /.test(flat(l)))
  expect(rows.map(l => l.segs[1]?.[0])).toEqual(['plain', 'plain', 'slot:tap'])
})

test('alarms: recent guard denies are a warning row, and no count means no row', () => {
  const row = (over: Record<string, unknown>) => alarms(distil(doc(over)), 1_000_000_000_000, 60).map(a => a[1])
  expect(row({ alarms: { recent_denies: 2 } })).toEqual(['▲ 2 guard deny(s) on attended sessions in the last 15 min — see state/drift.log'])
  expect(alarms(distil(doc({ alarms: { recent_denies: 2 } })), 1_000_000_000_000, 60)[0]?.[0]).toBe('warning')
  expect(row({ alarms: { recent_denies: 0 } })).toEqual([])
  expect(row({})).toEqual([])
})

test('the mounted band draws the Overmind review line and the deny alarm; the pane lists both under the same headings', async ($, on) => {
  world(on, JSON.stringify(doc({ review: REVIEW, alarms: { recent_denies: 2 } })))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Overmind/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /last 1999-12-20/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /11 days ago/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 debriefs since/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▲ 2 guard deny\(s\) on attended sessions in the last 15 min — see state\/drift\.log/ })).toBeDefined()
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
  for (const heading of [/OVERLORD/, /Priorities · by rank/, /Overmind/, /Alarms \(1\)/]) expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /review · last 1999-12-20 · 11 days ago · 2 debriefs since/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 guard deny\(s\) on attended sessions/ })).toBeDefined()
  await ui.unmount()
})

test('without a review block or a deny count the band has no Overmind block and no deny row', async ($, on) => {
  world(on, JSON.stringify(doc()))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /OVERLORD/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Overmind|guard deny|Alarms/ })).toBeUndefined()
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Overmind|guard deny/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Alarms \(0\)/ })).toBeDefined()
  await ui.unmount()
})

test('a short band still draws every heading', async ($, on) => {
  world(on, JSON.stringify(doc({ review: REVIEW })))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...SHORT })
  for (const heading of [/OVERLORD/, /Priorities/, /Overmind/]) expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /renewal check/ })).toBeUndefined()
  await ui.unmount()
})

test('a row cut to the band width keeps its uncut text in a hover card', async ($, on) => {
  world(on, JSON.stringify(doc()))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 30 } })
  expect(await ui.find({ type: 'Text', text: /^…$/ })).toBeDefined() // the on-deck row (36 columns) is cut to 30
  expect(await ui.find({ type: 'Text', text: /^ {2}on deck · docs pass · week · unset$/ })).toBeDefined() // the hover card holds the whole row
  await ui.unmount()
})

// ---- size limits on what board.json can make the mod keep and draw ----
test('a 10 KB string in board.json is cut when kept, and the band row built from it is cut with a bounded hover card', async ($, on) => {
  const huge = 'x'.repeat(10_000)
  const d = doc(); d.strategist.next.now = huge
  const b = distil(d)
  expect(b.now.length).toBe(300)
  const out = compose(inputs(b, { width: 80 }))
  const row = out.body.find(l => flat(l).startsWith('  now · '))!
  expect(flat(row).length).toBeLessThanOrEqual(80)
  expect(flat(row).endsWith('…')).toBe(true)
  expect(row.full!.length).toBeLessThanOrEqual(500)
  expect(cut({ segs: [['plain', huge]] }, 40).full!.length).toBe(500)
  world(on, JSON.stringify(d))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /x{200}/ })).toBeDefined() // the row is drawn, cut
  expect(await ui.find({ type: 'Text', text: /x{301}/ })).toBeUndefined() // nothing in the tree holds more than the 300 kept
  await ui.unmount()
})

test('distil keeps at most 50 entries of each list and 300 characters of each string, and skips entries that are not objects', () => {
  const many = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i))
  const d = doc()
  d.strategist.priorities = [...many(120, i => ({ '#': String(i), slot: 'tap', what: `p${i}`, 'next (who)': 'n' })), null, 7, 'x']
  d.strategist.threads = many(120, i => ({ thread: `t${i}`, tag: 'owner', 'waiting on': 'w', since: 's' }))
  d.strategist.arc = many(120, i => ({ spec: String(i), alarms: 'STALE' }))
  d.cards = [...many(120, i => ({ col: 'waiting', title: `#${i}`, status: 's' })), ...many(120, i => ({ col: 'autonomous', kind: 'act', status: `a${i}` })), null, 'x', 3,
    { col: 'autonomous', kind: 'brief', excerpt: 'b'.repeat(5_000) }]
  d.tick = { finished: 'f'.repeat(5_000), mode: 'm'.repeat(5_000), subtype: 's' }
  d.ceiling = { usd_used: 1, usd_ceiling: 'c'.repeat(5_000) }
  d.last_wake = 'w'.repeat(5_000)
  const b = distil(d)
  expect([b.priorities.length, b.threads.length, b.arcAlarms.length, b.waiting.length, b.acts.length]).toEqual([50, 50, 50, 50, 50])
  expect(b.brief.length).toBe(600)
  for (const s of [b.tick, b.ceiling, b.lastWake, b.arcAlarms[0]!, b.waiting[0]!, b.acts[0]!]) expect(s.length).toBeLessThanOrEqual(300)
  expect(distil({ cards: [null, 1, 'x'], strategist: { priorities: [null], threads: [3], arc: ['a'] } }).priorities).toEqual([])
})

test('a board file over 8 MiB is not parsed, so the band stays empty', async ($, on) => {
  world(on, JSON.stringify({ pad: 'x'.repeat(9 << 20) }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /tick ·/ })).toBeUndefined()
  await ui.unmount()
})
