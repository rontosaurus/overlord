import { test, expect, mock } from 'claude-code/testing'

import { distil } from './register'

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

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as any
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
