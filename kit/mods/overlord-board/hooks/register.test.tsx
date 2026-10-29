import { test, expect, mock } from 'claude-code/testing'

import { alarms, compose, cut, DEFAULT_CONFIG, distil, flatten, readConfig, rule } from './register'

// a sample of the board.json shape (agents/bin/board --json); rendered_epoch far in the future = fresh
const FRESH = 4_000_000_000
const sample = (over: Record<string, unknown> = {}) => JSON.stringify({
  rendered: '1999-12-31T19:59:44', rendered_epoch: FRESH,
  last_wake: 'quiet night, nothing to do',
  asks_open: 2,
  tick: { finished: '1999-12-31T06:04:14Z', mode: 'propose', subtype: 'success' },
  ceiling: { usd_used: 1.0665, usd_ceiling: 10, spent: false, attended_usd: 0.5 },
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

// 14 rows is a tall band (headings, the full alarm list, the extra lines); `SHORT` is a short one
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 14, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as any
const SHORT = { ...BAND, props: { ...BAND.props, maxRows: 8 } }
const PANE = { component: 'Pane', requestId: 'overlord-board', props: { title: 'Board', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as any
const CONFIG_PATH = '/r/agents/board-mod.json'
const BOARD_PATH = '/r/agents/state/board/board.json'

// beneath the plugin: the engine answers file reads (the config path with `config`, anything else with the board), usage with a
// 34K context, and draws an empty band itself. `config` is a string, null (no such file) or a function that gives either.
const world = (on: any, body: string | null = sample(), env: Record<string, string> = {}, config: string | null | (() => string | null) = null) => {
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
    const c = typeof config === 'function' ? config() : config
    if (e.path === CONFIG_PATH) return c == null ? { deny: 'no such file' } : { value: c }
    return body == null ? { deny: 'no such file' } : { value: body }
  })
  on('process.run', (_: any, e: any) => { ran.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '' } } })
  on('ui.render', ($: any, e: any) => { const { Box } = $.ui.resolve(e); return <Box /> })
  return { clock, read, opened, ran }
}
// the rows of a mounted band, top to bottom (each is a single-line Text; the hover cards and the pieces of a row are not)
const rowsOf = async (ui: any): Promise<string[]> => (await ui.findAll({ type: 'Text' })).filter((n: any) => n.props?.wrap === 'truncate').map((n: any) => n.text)

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
  expect([b.hasNext, b.attendedUsd, b.usedUsd]).toEqual([true, 0.5, 1.0665])
  expect(b.running).toEqual([{ id: '20-docs', what: 'writing' }])
})

test('distil survives an empty document', () => {
  const b = distil({})
  expect(b.priorities).toEqual([])
  expect(b.tick).toBe('none')
  expect(b.askBackpressure).toBe(4)
  expect([b.hasNext, b.attendedUsd, b.usedUsd, b.running]).toEqual([false, null, null, []])
  expect(distil({ ceiling: { attended_usd: 'x', usd_used: null }, strategist: { next: 'junk' } }).attendedUsd).toBeNull()
  expect(distil({ strategist: { next: 'junk' } }).hasNext).toBe(false)
})

test('the band draws the priorities, the roles, the alarms and the foot from the local file, on terminal and desktop', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(w.read).toEqual([CONFIG_PATH, BOARD_PATH]) // the config first (it can move the board), then the board
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'overlord-board', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /OVERLORD/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Priorities/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Alarms/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /reply to ask #1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ {2}1 reply · reply "go #1" \(you\)$/ })).toBeDefined() // the next step is the row
    expect(await ui.find({ type: 'Text', text: /renewal check/ })).toBeDefined() // in the hover card of the third row
    expect(await ui.find({ type: 'Text', text: /ctx 34K\/150K/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /today ≈\$0\.50/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /two failed units/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /arc · 01 STALE · 03 DEAD STALE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /could not parse 1 row/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /asks 2 · open 2 · today ran 1 · all ≈\$1\.57 · tick 12-31 06:04 propose success/ })).toBeDefined()
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
  expect(w.read).toEqual([CONFIG_PATH, '/data/my-board.json'])
})

test('a missing file draws nothing, and a later good read fills the band', async ($, on) => {
  let body: string | null = null
  const clock = mock.clock(on)
  mock.env(on, { AGENTS_REPO: '/r' })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200_000 }, rateLimits: [] } }))
  on('fs.read', (_: any, e: any) => (body == null || e.path === CONFIG_PATH ? { deny: 'no such file' } : { value: body }))
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

test('compose: the default band is the priorities, the roles, the alarms, the review; a block with nothing in it is left out', () => {
  const plain = compose(inputs(distil(doc())))
  expect(heads(plain.body)).toEqual(['── Priorities', '── Roles']) // no review block: no Overmind heading; no alarms: no Alarms heading
  expect(flat(plain.foot)).toBe('asks 2 · open 2 · today ran 1 · all ≈$1.57 · tick 12-31 06:04 propose success ')
  const withReview = compose(inputs(distil(doc({ review: REVIEW }))))
  expect(heads(withReview.body)).toEqual(['── Priorities', '── Roles', '── Overmind'])
  expect(withReview.body.map(flat).some(t => t === '  review · last 1999-12-20 · 11 days ago · 2 debriefs since')).toBe(true)
  const d = doc({ review: REVIEW }); d.strategist.priorities = []
  expect(heads(compose(inputs(distil(d))).body)).toEqual(['── Roles', '── Overmind']) // nothing ranked: no Priorities heading
  const first = distil(doc({ review: { ...REVIEW, days_since: 1, debriefs_since: 1 } }))
  expect(compose(inputs(first)).body.map(flat).some(t => t.endsWith('1 day ago · 1 debrief since'))).toBe(true)
  const unmarked = distil(doc({ review: { last_review: null, days_since: null, debriefs_since: null } }))
  expect(compose(inputs(unmarked)).body.map(flat).some(t => t === '  review · none yet')).toBe(true)
})

test('compose: a short band has no headings and keeps the first N lines of each block; a tall one keeps its headings too', () => {
  const b = distil(doc({ review: REVIEW }))
  const lines = (rows: number, over: Record<string, unknown> = {}) => compose(inputs(b, { rows, ...over })).body.map(flat)
  expect(lines(30).length).toBe(11) // tall: Priorities 1+3, Roles 1+4 (title, now, on deck, running), Overmind 1+1
  expect(lines(12).length).toBe(11) // 12 rows is exactly the default full_rows, and it just fits
  expect(lines(11).length).toBe(6) // 11 is short: no headings, no extra lines: 3 priorities, title + now, review
  expect(lines(11).some(t => t.startsWith('── '))).toBe(false)
  const five = lines(6) // budget 5: two lines per block, so the third priority goes
  expect(five.length).toBe(5)
  expect(five.filter(t => /^ {2}\d /.test(t)).length).toBe(2)
  expect(five.some(t => /registrar/.test(t))).toBe(false)
  expect(lines(5).length).toBe(3) // budget 4: one line per block
  expect(lines(5)).toEqual([expect.stringContaining('1 reply'), expect.stringContaining('OVERLORD'), expect.stringContaining('review ·')])
  expect(lines(3).length).toBe(2) // budget 2: the last block goes whole rather than being left half there
  expect(lines(2)).toEqual([expect.stringContaining('1 reply')]) // the first block always stays
  // a tall band that must collapse keeps every heading and the first N lines under each
  const tallCut = compose(inputs(b, { rows: 9, cfg: { ...DEFAULT_CONFIG, fullRows: 5 } })).body
  expect(heads(tallCut)).toEqual(['── Priorities', '── Roles', '── Overmind'])
  expect(tallCut.length).toBe(8)
})

test('compose: alarm rows are reserved first, so a short band loses blocks and lines rather than alarms', () => {
  const b = distil(doc({ review: REVIEW, rendered_epoch: 1, alarms: { recent_denies: 1 } }))
  const count = compose(inputs(b, { rows: 7 })).body.map(flat)
  expect(count.filter(t => t.startsWith('✖ 2 alarms'))).toEqual(['✖ 2 alarms: board stale · guard denies']) // a blocking alarm makes the line a cross
  expect(count.length).toBe(6)
  const full = (rows: number) => compose(inputs(b, { rows, cfg: { ...DEFAULT_CONFIG, alarms: 'full' } })).body.map(flat)
  expect(full(5).filter(t => /^[✖▲] /.test(t)).length).toBe(2) // budget 4: both alarm rows, one line of the first two blocks
  expect(full(5).length).toBe(4)
  expect(full(3).length).toBe(2) // budget 2: nothing is left for the other blocks, but both alarms are drawn
  expect(full(3).every(t => /^[✖▲] /.test(t))).toBe(true)
  const tall = compose(inputs(b, { rows: 13 })).body // tall, auto: the full list under its heading, and the Overmind block went whole
  expect(heads(tall)).toEqual(['── Priorities', '── Roles', '── Alarms', '── Overmind'].slice(0, heads(tall).length))
  expect(tall.map(flat).filter(t => /^[✖▲] /.test(t)).length).toBe(2)
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
  // a block without a heading takes no row for one; a fixed block is whole, comes off the budget first, and the others may all go
  const bare = (name: string, n: number) => ({ lines: blk(name, n).lines })
  expect(text([bare('a', 3), bare('b', 2)], 4)).toEqual(['a0', 'a1', 'b0', 'b1'])
  expect(text([bare('a', 3), bare('b', 2)], 3)).toEqual(['a0', 'b0'])
  expect(text([bare('a', 3), bare('b', 2)], 1)).toEqual(['a0']) // the first block always stays
  const alarm = { ...bare('x', 2), fixed: true }
  expect(text([bare('a', 3), alarm, bare('b', 2)], 4)).toEqual(['a0', 'x0', 'x1', 'b0'])
  expect(text([bare('a', 3), alarm, bare('b', 2)], 2)).toEqual(['x0', 'x1']) // no room beside the alarms: the others go whole
  expect(text([alarm, bare('a', 3)], 0)).toEqual(['x0', 'x1']) // a fixed block is never cut
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

test('a short band draws no headings and one alarm line; a tall band draws the headings and every alarm', async ($, on) => {
  world(on, JSON.stringify(doc({ review: REVIEW, alarms: { recent_denies: 2 }, errors: [{ section: 's', line: 1, msg: 'm' }] })))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...SHORT })
  expect(await ui.find({ type: 'Text', text: /^── / })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^▲ 2 alarms: parse errors · guard denies$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /could not parse/ })).toBeDefined() // in the count line's hover card
  expect((await rowsOf(ui)).some(t => /could not parse/.test(t))).toBe(false) // but no row of its own
  expect(await ui.find({ type: 'Text', text: /renewal check/ })).toBeUndefined() // the third priority went with the collapse
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  for (const heading of [/^── Priorities/, /^── Roles/, /^── Alarms/, /^── Overmind/]) expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▲ board could not parse 1 row/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^▲ 2 guard deny/ })).toBeDefined()
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

// ---- the layout config (agents/board-mod.json) ----
const GOOD = { title: 'BRIDGE', order: ['roles', 'priorities'], priorities_rows: 5, alarms: 'full', full_rows: 20, foot: ['tick', 'ceiling'], stale_minutes: 15, show_subagents: false, board_file: 'state/b.json' }
const GOOD_CFG = { title: 'BRIDGE', order: ['roles', 'priorities'], prioritiesRows: 5, alarms: 'full', fullRows: 20, foot: ['tick', 'ceiling'], staleMinutes: 15, showSubagents: false, boardFile: 'state/b.json' }
const FIELD: Record<string, string> = {
  title: 'title', order: 'order', priorities_rows: 'prioritiesRows', alarms: 'alarms', full_rows: 'fullRows', foot: 'foot',
  stale_minutes: 'staleMinutes', show_subagents: 'showSubagents', board_file: 'boardFile',
}
const ONE_ERROR = [{ section: 'Open initiatives', line: 27, msg: 'row has 4 cells' }]
const full = (t: string): string => t.replace(/ ─+$/, '') // a heading row without its rule
const FOOT = 'asks 2 · open 2 · today ran 1 · all ≈$1.57 · tick 12-31 06:04 propose success '

test('readConfig: no usable file is the defaults, and a result is a copy of them', () => {
  for (const raw of [undefined, null, '', 'not json', '[]', '"x"', '7', 'null', '{}', '{"unknown":1}', '{"__proto__":{"title":"X"}}']) expect(readConfig(raw)).toEqual(DEFAULT_CONFIG)
  expect(DEFAULT_CONFIG).toEqual({
    title: 'OVERLORD', order: ['priorities', 'roles', 'alarms', 'review'], prioritiesRows: 3, alarms: 'auto', fullRows: 12,
    foot: ['asks', 'open', 'today', 'tick'], staleMinutes: null, showSubagents: true, boardFile: null,
  })
  readConfig('{}').order.push('roles')
  expect(readConfig('{}').order).toEqual(['priorities', 'roles', 'alarms', 'review'])
  expect(DEFAULT_CONFIG.order.length).toBe(4)
})

test('readConfig: every key is read, unknown keys are ignored, repeats are dropped, an empty list is allowed', () => {
  expect(readConfig(JSON.stringify(GOOD))).toEqual(GOOD_CFG)
  expect(readConfig(JSON.stringify({ ...GOOD, extra: 1, another: { a: 1 } }))).toEqual(GOOD_CFG)
  expect(readConfig(JSON.stringify({ order: ['roles', 'roles', 'alarms'] })).order).toEqual(['roles', 'alarms'])
  expect(readConfig(JSON.stringify({ order: [], foot: [] }))).toEqual({ ...DEFAULT_CONFIG, order: [], foot: [] })
  expect(readConfig(JSON.stringify({ alarms: 'auto' })).alarms).toBe('auto')
  expect(readConfig(JSON.stringify({ title: 'x'.repeat(40) })).title).toBe('x'.repeat(40))
  expect(readConfig(JSON.stringify({ priorities_rows: 0, full_rows: 1, stale_minutes: 10_080 }))).toEqual({ ...DEFAULT_CONFIG, prioritiesRows: 0, fullRows: 1, staleMinutes: 10_080 })
})

test('readConfig: each invalid key is ignored on its own and the other keys still apply', () => {
  const BAD: Record<string, unknown[]> = {
    title: [7, true, null, '', '   ', '\u001b\u0007\u0000', 'x'.repeat(41), ['BRIDGE'], { a: 1 }],
    order: ['roles', null, 7, ['roles', 'nope'], ['Roles'], [7], [['roles']], Array(9).fill('roles'), { roles: 1 }],
    priorities_rows: ['3', 2.5, -1, 11, null, true, [3], { n: 3 }],
    alarms: ['summary', 'FULL', '', 1, null, true, ['full']],
    full_rows: ['12', 0, 100, 1.5, -4, null, false],
    foot: ['tick', ['tick', 'nope'], ['TICK'], [7], Array(9).fill('tick'), null, { tick: 1 }],
    stale_minutes: ['10', 0, 10_081, 2.5, null, false],
    show_subagents: ['true', 1, 0, null, 'no'],
    board_file: [7, null, '', '/etc/board.json', '\\temp\\b.json', 'C:/b.json', 'c:b.json', '../b.json', 'a/../../b.json', 'a//b.json', 'a/', 'x'.repeat(121), 'a\u0000b.json', 'a\nb.json'],
  }
  expect(Object.keys(BAD).sort()).toEqual(Object.keys(GOOD).sort())
  let tried = 0
  for (const [key, values] of Object.entries(BAD)) {
    for (const v of values) {
      const got = readConfig(JSON.stringify({ ...GOOD, [key]: v })) as any
      for (const [k, field] of Object.entries(FIELD)) {
        expect([key, JSON.stringify(v), field, JSON.stringify(got[field])]).toEqual([key, JSON.stringify(v), field, JSON.stringify(k === key ? (DEFAULT_CONFIG as any)[field] : (GOOD_CFG as any)[field])])
      }
      tried++
    }
  }
  expect(tried).toBeGreaterThan(60)
})

test('an oversize config falls back to the defaults; one at the limit is read', async ($, on) => {
  const big = JSON.stringify({ title: 'BIG', pad: 'x'.repeat(70_000) })
  expect(big.length).toBeGreaterThan(64 << 10)
  expect(readConfig(big)).toEqual(DEFAULT_CONFIG)
  const room = (64 << 10) - JSON.stringify({ title: 'EDGE', pad: '' }).length
  expect(readConfig(JSON.stringify({ title: 'EDGE', pad: 'x'.repeat(room) })).title).toBe('EDGE') // exactly 64 KiB
  expect(readConfig(JSON.stringify({ title: 'EDGE', pad: 'x'.repeat(room + 1) })).title).toBe('OVERLORD') // one more character
  world(on, JSON.stringify(doc()), {}, big)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /OVERLORD/ })).toBeDefined() // the band still draws, as the defaults
  expect(await ui.find({ type: 'Text', text: /BIG/ })).toBeUndefined()
  await ui.unmount()
})

test('a hostile title is stripped of control characters, in the config, the band and the pane', async ($, on) => {
  const evil = 'OVER\u001b[2J\u0007LORD\u009b\u0000*`'
  const title = readConfig(JSON.stringify({ title: evil })).title
  expect(title).toBe('OVER [2J LORD')
  expect(title).not.toMatch(/[\x00-\x1f\x7f-\x9f*`]/)
  world(on, JSON.stringify(doc()), {}, JSON.stringify({ title: evil }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /OVER \[2J LORD · ctx/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /[\x00-\x1f\x7f-\x9f]/ })).toBeUndefined()
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /^OVER \[2J LORD$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /[\x00-\x1f\x7f-\x9f]/ })).toBeUndefined()
  await ui.unmount()
})

// ---- the defaults, drawn: the exact rows at 8 and at 14 ----
const DRAWN = () => JSON.stringify(doc({ review: REVIEW, alarms: { recent_denies: 2 }, errors: ONE_ERROR }))

test('with no config file the band at 8 rows is the short layout: no headings, a one-line alarm count, no extra lines', async ($, on) => {
  world(on, DRAWN())
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...SHORT })
  expect(await rowsOf(ui)).toEqual([
    '  1 reply · reply "go #1" (you)',
    '  2 tap · reply "clear them" (framework)',
    '  OVERLORD · ctx 34K/150K · 0m · today ≈$0.50',
    '  now · reply to ask #1, daytime',
    '▲ 2 alarms: parse errors · guard denies',
    '  review · last 1999-12-20 · 11 days ago · 2 debriefs since',
    FOOT,
  ])
  await ui.unmount()
})

test('with no config file the band at 14 rows is the tall layout: headings, every alarm, then the first lines of each block', async ($, on) => {
  world(on, DRAWN())
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect((await rowsOf(ui)).map(full)).toEqual([
    '── Priorities',
    '  1 reply · reply "go #1" (you)',
    '  2 tap · reply "clear them" (framework)',
    '── Roles',
    '  OVERLORD · ctx 34K/150K · 0m · today ≈$0.50',
    '  now · reply to ask #1, daytime',
    '── Alarms',
    '▲ board could not parse 1 row(s) of the state files',
    '▲ 2 guard deny(s) on attended sessions in the last 15 min — see state/drift.log',
    '── Overmind',
    '  review · last 1999-12-20 · 11 days ago · 2 debriefs since',
    FOOT,
  ])
  await ui.unmount()
  // with room for everything (a taller band) the extra lines and the third priority are there too
  const tall = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 30 } })
  const rows = (await rowsOf(tall)).map(full)
  expect(rows).toContain('  3 tap · open the registrar (you)')
  expect(rows).toContain('  on deck · docs pass · week · unset')
  expect(rows).toContain('  running · 20-docs writing')
  await tall.unmount()
})

test('a config changes the order, the priority rows, the alarms, the foot and the title', async ($, on) => {
  const cfg = { title: 'BRIDGE', order: ['roles', 'review', 'priorities', 'alarms'], priorities_rows: 1, alarms: 'full', foot: ['tick', 'ceiling'] }
  world(on, DRAWN(), {}, JSON.stringify(cfg))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...SHORT })
  expect(await rowsOf(ui)).toEqual([
    '  BRIDGE · ctx 34K/150K · 0m · today ≈$0.50',
    '  now · reply to ask #1, daytime',
    '  review · last 1999-12-20 · 11 days ago · 2 debriefs since',
    '  1 reply · reply "go #1" (you)',
    '▲ board could not parse 1 row(s) of the state files',
    '▲ 2 guard deny(s) on attended sessions in the last 15 min — see state/drift.log',
    'tick 12-31 06:04 propose success · ceiling $1.07/$10 ',
  ])
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 30 } })
  expect((await rowsOf(ui)).map(full).filter(t => t.startsWith('── '))).toEqual(['── Roles', '── Overmind', '── Priorities', '── Alarms'])
  await ui.unmount()
})

test('a block the order does not list is not drawn, and an empty foot list leaves the board button alone on the last row', async ($, on) => {
  world(on, DRAWN(), {}, JSON.stringify({ order: ['priorities'], priorities_rows: 2, foot: [] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await rowsOf(ui)).toEqual(['── Priorities ' + '─'.repeat(58), '  1 reply · reply "go #1" (you)', '  2 tap · reply "clear them" (framework)', ' '])
  expect(await ui.find({ type: 'Button' })).toBeDefined()
  await ui.unmount()
})

test('compose: the alarm modes - auto by height, one line, the full list, off - and the count line keeps every row in its hover card', () => {
  const b = distil(doc({ alarms: { recent_denies: 2 }, errors: ONE_ERROR }))
  const sign = (t: string) => /^[✖▲] /.test(t)
  const rows = (n: number, alarmsMode: any) => compose(inputs(b, { rows: n, cfg: { ...DEFAULT_CONFIG, alarms: alarmsMode } })).body.map(flat).filter(sign)
  const ONE = ['▲ 2 alarms: parse errors · guard denies']
  expect(rows(30, 'auto').length).toBe(2)
  expect(rows(11, 'auto')).toEqual(ONE)
  expect(rows(12, 'auto').length).toBe(2) // 12 is the default full_rows
  expect(rows(30, 'count')).toEqual(ONE)
  expect(rows(7, 'full').length).toBe(2)
  expect(rows(30, 'off')).toEqual([])
  expect(rows(7, 'off')).toEqual([])
  expect(compose(inputs(distil(doc({ alarms: { recent_denies: 1 } })), { rows: 7 })).body.map(flat)).toContain('▲ 1 alarm: guard denies')
  const line = compose(inputs(b, { rows: 7 })).body.find(l => flat(l).startsWith('▲ 2 alarms'))!
  expect(line.full).toBe('▲ board could not parse 1 row(s) of the state files | ▲ 2 guard deny(s) on attended sessions in the last 15 min — see state/drift.log')
  expect(compose(inputs(b, { rows: 7, cfg: { ...DEFAULT_CONFIG, fullRows: 5 } })).body.map(flat).filter(sign).length).toBe(2) // full_rows moves the line
  expect(alarms(b, 1_000_000_000_000, 60).map(a => a[2])).toEqual(['parse errors', 'guard denies'])
})

test('compose: the foot shows the fields the config lists, in that order, and skips one the board cannot fill', () => {
  const foot = (b: any, f: any[]) => flat(compose(inputs(b, { cfg: { ...DEFAULT_CONFIG, foot: f } })).foot)
  const b = distil(doc())
  expect(foot(b, ['tick', 'asks'])).toBe('tick 12-31 06:04 propose success · asks 2 ')
  expect(foot(b, ['ceiling'])).toBe('ceiling $1.07/$10 ')
  expect(foot(b, ['open', 'today'])).toBe('open 2 · today ran 1 · all ≈$1.57 ')
  expect(foot(b, [])).toBe(' ')
  expect(foot(distil(doc({ ceiling: null })), ['ceiling', 'today', 'tick'])).toBe('today ran 1 · tick 12-31 06:04 propose success ')
  expect(flat(compose(inputs(b)).foot)).toBe(FOOT) // the default foot
})

test('compose: the roles block - a title line, a now line when the board has next.md, extra lines only in a tall band, a spinner while working', () => {
  const b = distil(doc())
  const rows = (over: Record<string, unknown> = {}, bb: any = b) => compose(inputs(bb, over)).body.map(flat)
  expect(rows({ rows: 99 })).toContain('  on deck · docs pass · week · unset')
  expect(rows({ rows: 99 })).toContain('  running · 20-docs writing')
  expect(rows({ rows: 99, cfg: { ...DEFAULT_CONFIG, showSubagents: false } }).some(t => t.includes('running ·'))).toBe(false)
  expect(rows({ rows: 99, cfg: { ...DEFAULT_CONFIG, showSubagents: false } })).toContain('  on deck · docs pass · week · unset')
  expect(rows({ rows: 11 }).some(t => t.includes('on deck') || t.includes('running ·'))).toBe(false) // a short band has neither
  expect(rows({ rows: 11 })).toContain('  now · reply to ask #1, daytime')
  const d = doc(); d.strategist.next = null
  const noNext = rows({ rows: 99 }, distil(d))
  expect(noNext.some(t => t.includes('now ·') || t.includes('on deck'))).toBe(false)
  expect(noNext).toContain('  OVERLORD · ctx 34K/150K · 5m · today ≈$0.50')
  const many = doc(); many.cards = Array.from({ length: 5 }, (_, i) => ({ col: 'running', id: `r${i}`, status: `s${i}` }))
  expect(rows({ rows: 99 }, distil(many))).toContain('  running · r0 s0 · r1 s1 · r2 s2 · +2')
  expect(rows({ rows: 99 }, distil(doc({ ceiling: null }))).find(t => t.includes('OVERLORD'))).toBe('  OVERLORD · ctx 34K/150K · 5m') // no ceiling block: no spend
  expect(rows({ rows: 99, spin: '⠋' }).find(t => t.includes('OVERLORD'))).toMatch(/^⠋ OVERLORD/)
  expect(rows({ rows: 99, spin: '⠋⠙' }).find(t => t.includes('OVERLORD'))).toMatch(/^⠋ OVERLORD/) // one character only
  expect(rows({ rows: 99, spin: '' }).find(t => t.includes('OVERLORD'))).toMatch(/^ {2}OVERLORD/)
  const over = compose(inputs(b, { rows: 99, ctxK: 151 })).body.find(l => flat(l).includes('OVERLORD'))!
  expect(over.segs.some(sg => sg[0] === 'warn' && sg[1] === 'ctx 151K/150K')).toBe(true)
})

test('the title line shows a spinner frame while the session is working and a space while it is not', async ($, on) => {
  world(on, JSON.stringify(doc()))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND, props: { ...BAND.props, isWorking: true } })
  expect((await rowsOf(ui)).some(t => /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] OVERLORD · /.test(t))).toBe(true)
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect((await rowsOf(ui)).some(t => /^ {2}OVERLORD · /.test(t))).toBe(true)
  await ui.unmount()
})

test('compose: a priority row shows the next step and keeps the whole row in its hover card; the row count comes from the config', () => {
  const b = distil(doc())
  const only = (n: number) => compose(inputs(b, { rows: 99, cfg: { ...DEFAULT_CONFIG, order: ['priorities'], prioritiesRows: n } })).body
  const text = (n: number) => only(n).map(flat).filter(t => /^ {2}\d /.test(t))
  expect(text(1)).toEqual(['  1 reply · reply "go #1" (you)'])
  expect(text(0)).toEqual([])
  expect(text(10).length).toBe(4)
  expect(only(1).find(l => flat(l).startsWith('  1 '))!.full).toBe('1 reply · Restart the worker (ask #1) — reply "go #1" (you)')
  const d = doc(); d.strategist.priorities[0]['next (who)'] = ''
  const bare = compose(inputs(distil(d), { rows: 99, cfg: { ...DEFAULT_CONFIG, order: ['priorities'], prioritiesRows: 1 } })).body.find(l => flat(l).startsWith('  1 '))!
  expect(flat(bare)).toBe('  1 reply · Restart the worker (ask #1)') // no next step: the row says what it is
  expect(bare.full).toBeUndefined()
})

test('the config is read again every minute, so an edit shows without a restart, and a bad one is the defaults', async ($, on) => {
  let cfg: string | null = null
  const w = world(on, JSON.stringify(doc()), {}, () => cfg)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const seen = async (re: RegExp) => { const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND }); const r = await ui.find({ type: 'Text', text: re }); await ui.unmount(); return r !== undefined }
  expect(await seen(/OVERLORD · ctx/)).toBe(true)
  cfg = JSON.stringify({ title: 'BRIDGE' })
  await w.clock.advance(61_000)
  expect([await seen(/BRIDGE · ctx/), await seen(/OVERLORD · ctx/)]).toEqual([true, false])
  cfg = '{ "title": '
  await w.clock.advance(61_000)
  expect([await seen(/BRIDGE · ctx/), await seen(/OVERLORD · ctx/)]).toEqual([false, true])
})

test('board_file moves the board inside the repo', async ($, on) => {
  const w = world(on, sample(), {}, JSON.stringify({ board_file: 'state/mine.json' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(w.read).toEqual([CONFIG_PATH, '/r/state/mine.json'])
})

test('an absolute OVERLORD_BOARD_FILE beats board_file in the config', async ($, on) => {
  const w = world(on, sample(), { OVERLORD_BOARD_FILE: '/data/my-board.json' }, JSON.stringify({ board_file: 'state/mine.json' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(w.read).toEqual([CONFIG_PATH, '/data/my-board.json'])
})

test('a board_file that leaves the repo is ignored, so the default board is read', async ($, on) => {
  const w = world(on, sample(), {}, JSON.stringify({ board_file: '../outside.json' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(w.read).toEqual([CONFIG_PATH, BOARD_PATH])
})

test('with no stale_minutes and no environment variable a board is stale after 60 minutes', async ($, on) => {
  const w = world(on, sample({ rendered_epoch: 1 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.advance(59 * 60_000)
  let ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /board stale/ })).toBeUndefined()
  await ui.unmount()
  await w.clock.advance(2 * 60_000)
  ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /^✖ board stale/ })).toBeDefined()
  await ui.unmount()
})

test('stale_minutes in the config moves the limit', async ($, on) => {
  const w = world(on, sample({ rendered_epoch: 1 }), {}, JSON.stringify({ stale_minutes: 120 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /board stale/ })).toBeUndefined()
  await ui.unmount()
})

test('stale_minutes in the config wins over a stricter environment variable', async ($, on) => {
  const w = world(on, sample({ rendered_epoch: 1 }), { OVERLORD_BOARD_STALE_MIN: '30' }, JSON.stringify({ stale_minutes: 120 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /board stale/ })).toBeUndefined()
  await ui.unmount()
})

test('the environment variable still sets the stale limit when the config has none', async ($, on) => {
  const w = world(on, sample({ rendered_epoch: 1 }), { OVERLORD_BOARD_STALE_MIN: '30' }, JSON.stringify({ title: 'X' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.advance(31 * 60_000)
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /^✖ board stale/ })).toBeDefined()
  await ui.unmount()
})

test('the pane lists its sections in the default order when there is no config', async ($, on) => {
  const headings = async (cfg: string | null) => {
    world(on, DRAWN(), {}, cfg)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
    const texts = (await ui.findAll({ type: 'Text' })).map((n: any) => n.text as string)
    await ui.unmount()
    return texts.filter(t => /^(Priorities · by rank|OVERLORD|BRIDGE|Alarms \(\d+\)|Overmind|Waiting on you|Asks ·|Autonomous|Morning brief|Spend)/.test(t)).map(t => t.replace(/ \(\d+\)$| ·.*$/, ''))
  }
  expect(await headings(null)).toEqual(['Priorities', 'OVERLORD', 'Alarms', 'Overmind', 'Waiting on you', 'Asks', 'Autonomous', 'Morning brief', 'Spend'])
})

test('the pane follows a config order: listed sections first in that order, the title on the roles section, the rest after', async ($, on) => {
  world(on, DRAWN(), {}, JSON.stringify({ title: 'BRIDGE', order: ['review', 'roles'], alarms: 'off' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'overlord-board', surface: 'desktop', ...PANE })
  const texts = (await ui.findAll({ type: 'Text' })).map((n: any) => n.text as string)
  const at = (re: RegExp) => texts.findIndex(t => re.test(t))
  const order = [/^Overmind$/, /^BRIDGE$/, /^Priorities · by rank$/, /^Alarms \(2\)$/, /^Waiting on you/, /^Autonomous/, /^Spend$/].map(at)
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order) // already in the expected order
  expect(texts.some(t => /^▲ 2 guard deny/.test(t))).toBe(true) // alarms: "off" is the band's setting; the pane still lists them
  await ui.unmount()
  // and the band, with the same config, draws no alarm rows at all
  const band = await $.ui.mount({ plugin: 'overlord-board', surface: 'terminal', ...BAND })
  expect((await rowsOf(band)).some(t => /^[✖▲] /.test(t))).toBe(false)
  await band.unmount()
})
