import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Row } from '../types'

// An optional board above the prompt, plus a /board pane. The data path is one local file: board.json, which
// agents/bin/board writes (run it by hand, from a timer, or with `/board refresh`). The engine reads the file for the
// mod ($.fs.read - the mod has no file access of its own); all parsing of the state files lives in that script and its
// tests, and this mod only distils the JSON into a few hundred bytes of plain data, draws rows, and opens a pane.
// Drawn in the terminal / Desktop / VS Code surfaces only, never in a Remote Control client. It reads the board; the
// only thing it ever runs is `agents/bin/board` itself, and only when you type `/board refresh`.
// Both the board file and agents/bin/board are resolved from AGENTS_REPO (the owner's repo, set in their user settings),
// never from the session's working directory: a folder you merely opened cannot plant a board.json or a script here.
// Without AGENTS_REPO the mod reads and runs nothing and says so in the pane.
const BOARD_REL = 'agents/state/board/board.json'
const BOARD_BIN_REL = 'agents/bin/board'
const POLL_MS = 60_000
const ROTATE_K = 150 // context-watch.conf WARN_AT: the attended session's "wrap up" point, in thousands of tokens
const DEFAULT_STALE_MIN = 60 // the board is rendered on demand, so "stale" means "nobody re-ran it for this long"
const DEFAULT_WIP = 5
const DEFAULT_ASKS = 4
const PANE = 'overlord-board'
const SLOT_COLOR: Record<string, 'success' | 'suggestion' | 'warning' | 'planMode' | 'claude'> = {
  tap: 'success', reply: 'suggestion', 'at-pc': 'warning', evening: 'planMode', decide: 'claude',
}

const board = atom({ plugin: 'overlord-board', key: 'board' } as const, null as Board | null)
const readAt = atom({ plugin: 'overlord-board', key: 'readAt' } as const, 0)
const settings = atom({ plugin: 'overlord-board', key: 'settings' } as const, { file: '', repo: '', staleMin: DEFAULT_STALE_MIN })

// Every string from board.json is untrusted text: control characters (escape sequences that could drive the
// terminal, C1 codes, NUL) are removed from all of it before it is kept or drawn.
const CTRL = /[\x00-\x1f\x7f-\x9f]/g
const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(CTRL, ' ')
const clean = (s: string): string => s.replace(CTRL, ' ').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim()
const slotColor = (slot: string) => (Object.prototype.hasOwnProperty.call(SLOT_COLOR, slot) ? SLOT_COLOR[slot] : undefined)
const joinRepo = (repo: string, rel: string): string => `${repo.replace(/[\\/]+$/, '')}/${rel}`
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

// board.json -> Board: the few fields the band and pane draw, nothing else kept in state
export const distil = (d: any): Board => {
  const cards = list(d?.cards)
  const s = d?.strategist ?? {}
  const n = s.next ?? {}
  const brief = cards.find(c => c.col === 'autonomous' && c.kind === 'brief')
  const t = d?.tick
  const c = d?.ceiling
  return {
    renderedEpoch: Number(d?.rendered_epoch) || 0,
    lastWake: clean(text(d?.last_wake)),
    now: clean(text(n.now)),
    deck: clean(text(n.deck)),
    week: clean(text(n.week)),
    nextAgeHours: Number(n.age_hours) || 0,
    priorities: list(s.priorities).map((r: any): Row => ({
      n: text(r['#']), slot: text(r.slot), what: clean(text(r.what)), next: clean(text(r['next (who)'])),
    })),
    asksOpen: Number(d?.asks_open) || 0,
    open: cards.filter(x => x.col === 'open' || x.col === 'running').length,
    waiting: cards.filter(x => x.col === 'waiting').map(x => clean(`${text(x.title)} ${text(x.status)}`)),
    watching: cards.filter(x => x.col === 'watching').length,
    acts: cards.filter(x => x.col === 'autonomous' && x.kind === 'act').map(x => clean(text(x.status))),
    brief: brief ? clean(text(brief.excerpt)).slice(0, 600) : '',
    tick: t ? `${text(t.finished).slice(5, 16).replace('T', ' ')} ${text(t.mode)} ${text(t.subtype)}`.trim() : 'none',
    ceiling: c ? `$${(Number(c.usd_used) || 0).toFixed(2)}/$${text(c.usd_ceiling)}${c.spent ? ' SPENT' : ''}` : '',
    arcAlarms: list(s.arc).filter((a: any) => a.alarms && a.alarms !== '—').map((a: any) => `${text(a.spec)} ${text(a.alarms)}`),
    threads: list(s.threads).filter((x: any) => text(x.tag) === 'owner').map((x: any) => ({
      thread: clean(text(x.thread)), on: clean(text(x['waiting on'])), since: text(x.since),
    })),
    errors: list(d?.errors).length,
    wipInitiatives: Number(d?.limits?.wip_initiatives) || DEFAULT_WIP,
    askBackpressure: Number(d?.limits?.ask_backpressure) || DEFAULT_ASKS,
  }
}

const age = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d`
}

// alarm rows: [color, text]; a cross is blocking, a triangle a warning
const alarms = (b: Board, now: number, staleMin: number): Array<['error' | 'warning', string]> => {
  const out: Array<['error' | 'warning', string]> = []
  const renderedAge = now - b.renderedEpoch * 1000
  if (b.renderedEpoch && renderedAge > staleMin * 60_000) out.push(['error', `✖ board stale ${age(renderedAge)} - re-run agents/bin/board (or /board refresh)`])
  if (b.errors) out.push(['warning', `▲ board could not parse ${b.errors} row(s) of the state files`])
  if (b.open > b.wipInitiatives || b.asksOpen > b.askBackpressure) out.push(['warning', `▲ WIP ${b.open}/${b.wipInitiatives} initiatives · ${b.asksOpen}/${b.askBackpressure} asks`])
  if (b.arcAlarms.length) out.push(['warning', `▲ arc · ${b.arcAlarms.join(' · ')}`])
  if (b.nextAgeHours > 36) out.push(['warning', `▲ next.md is ${Math.round(b.nextAgeHours)} h old`])
  return out
}

let tick: { cancel: () => void } | undefined
let poll: (() => Promise<void>) | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const repo = ((await $.env.get('AGENTS_REPO')) || '').trim()
    // an override is honoured only as an absolute path (the owner's env); a relative one would resolve against the cwd
    const override = ((await $.env.get('OVERLORD_BOARD_FILE')) || '').trim()
    const file = !repo ? '' : /^([/\\]|[A-Za-z]:[/\\])/.test(override) ? override : joinRepo(repo, BOARD_REL)
    const staleMin = Number(await $.env.get('OVERLORD_BOARD_STALE_MIN')) || DEFAULT_STALE_MIN
    await update($, settings, () => ({ file, repo, staleMin }))
    poll = async () => {
      let got: Board | null = null
      try {
        if (!file) throw new Error('AGENTS_REPO is not set')
        const body = await $.fs.read(file)
        got = distil(JSON.parse(body))
      } catch { got = null } // missing file, unreadable, or not JSON: the band stays empty and the pane says why
      const now = await $.clock.now()
      await update($, board, prev => (JSON.stringify(prev) === JSON.stringify(got) ? prev : got))
      await update($, readAt, () => now)
    }
    await $.command.register({ name: 'board', description: 'Open the board pane; "/board refresh" re-renders it first', argumentHint: '[refresh]' }).catch(() => null)
    tick?.cancel()
    await poll()
    tick = $.clock.every(POLL_MS, () => { void poll?.() })
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    let note = ''
    const { repo } = await read($, settings)
    if (text(e.args).trim() === 'refresh' && !repo) {
      note = 'AGENTS_REPO is not set: refusing to run agents/bin/board from the working directory. '
    } else if (text(e.args).trim() === 'refresh') {
      const py = (await $.env.get('OVERLORD_BOARD_PYTHON')) || 'python3'
      try {
        const r = await $.process.run([py, joinRepo(repo, BOARD_BIN_REL)])
        note = r.exitCode === 0 || r.exitCode === 2 ? 'Board re-rendered. ' : `Board render failed (exit ${r.exitCode}). `
      } catch { note = 'Could not start agents/bin/board. ' }
    }
    await poll?.()
    const opened = await $.ui.open({ id: PANE, title: 'Board' })
    return { text: note + (opened.isPlaced ? 'Board pane opened.' : `Board pane is open but not drawn: ${opened.reason}`) }
  })

  // a turn may have changed state that a re-render picked up; re-read once the turn ends if the last read is old
  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    if (now - (await read($, readAt)) > 20_000) void poll?.()
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, board)
    if (!b || e.props.hasSurvey) return next(e)
    const { staleMin } = await read($, settings)
    const now = await $.clock.now()
    const u = await $.session.usage().catch(() => null)
    const k = u?.context.tokens != null ? Math.round(u.context.tokens / 1000) : null
    const ctx = k == null ? 'ctx ?' : `ctx ${k}K/${ROTATE_K}K`
    const since = u ? age(now - u.startedAt) : ''
    const { Box, Text, Button } = $.ui.resolve(e)
    const three = b.priorities.slice(0, 3)
    const warn = alarms(b, now, staleMin)
    const open = () => { void $.ui.open({ id: PANE, title: 'Board' }) }
    // header, on deck, top three, alarms; the foot is always the last row; rows past maxRows are cut from the middle
    const main = [
      <Text wrap="truncate">
        <Text color="claude" bold>BOARD</Text>
        <Text dimColor> · now · </Text><Text>{b.now || '—'}</Text>
        <Text dimColor> · </Text><Text color={k != null && k >= ROTATE_K ? 'warning' : undefined} dimColor={k == null || k < ROTATE_K}>{ctx}</Text>
        {since ? <Text dimColor> · {since}</Text> : null}
      </Text>,
      <Text wrap="truncate">
        <Text dimColor>on deck · </Text><Text>{b.deck || '—'}</Text>
        <Text dimColor> · week · </Text><Text>{b.week || '—'}</Text>
      </Text>,
      ...three.map(r => (
        <Text wrap="truncate">
          <Text dimColor>{r.n} </Text><Text color={slotColor(r.slot)}>{r.slot}</Text><Text dimColor> · </Text><Text>{r.what}</Text>
        </Text>
      )),
      ...warn.map(([c, t]) => <Text wrap="truncate" color={c} bold={c === 'error'}>{t}</Text>),
    ]
    const room = Math.max(1, e.props.maxRows - 2)
    return (
      <Box flexDirection="column">
        {main.slice(0, room).map((row, i) => <Box key={`r${i}`}>{row}</Box>)}
        <Box flexDirection="row">
          <Text wrap="truncate" dimColor>
            tick · {b.tick} · ran {b.acts.length} · asks {b.asksOpen} · open {b.open}{b.ceiling ? ` · ${b.ceiling}` : ''}{' '}
          </Text>
          <Button key="board" label="board" plain onPress={open} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const b = await read($, board)
    const { file, repo, staleMin } = await read($, settings)
    const now = await $.clock.now()
    if (!b) {
      return (
        <Box paddingX={1}>
          {repo
            ? <Text dimColor>No board at {file}. Run agents/bin/board (or /board refresh), then reopen this pane.</Text>
            : <Text color="warning">AGENTS_REPO is not set, so the board is off: set it in your user settings (env) to your repo's folder. Nothing is read or run from the working directory.</Text>}
        </Box>
      )
    }
    const H = (t: string) => (
      <Box marginTop={1}>
        <Text bold dimColor>{t}</Text>
      </Box>
    )
    const warn = alarms(b, now, staleMin)
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text wrap="wrap">
          <Text color="claude" bold>BOARD</Text>
          <Text dimColor> · rendered {age(now - b.renderedEpoch * 1000)} ago · {file}</Text>
        </Text>
        <Text wrap="wrap"><Text dimColor>now · </Text>{b.now || '—'}</Text>
        <Text wrap="wrap"><Text dimColor>on deck · </Text>{b.deck || '—'}</Text>
        <Text wrap="wrap"><Text dimColor>week · </Text>{b.week || '—'}</Text>
        <Text wrap="wrap" dimColor>last wake · {b.lastWake || '—'}</Text>
        {H('Priorities · by rank')}
        {b.priorities.length === 0 && <Text dimColor>none ranked</Text>}
        {b.priorities.map((r, i) => (
          <Box key={`p${i}`} flexDirection="column">
            <Text wrap="wrap">
              <Text dimColor>{r.n} </Text><Text color={slotColor(r.slot)}>{r.slot}</Text><Text dimColor> · </Text>{r.what}
            </Text>
            <Text wrap="wrap" dimColor>    {r.next}</Text>
          </Box>
        ))}
        {H(`Waiting on you (${b.threads.length})`)}
        {b.threads.length === 0 && <Text dimColor>nothing</Text>}
        {b.threads.map((t, i) => (
          <Box key={`t${i}`}>
            <Text wrap="wrap">{t.thread}<Text dimColor> · {t.on} · since {t.since}</Text></Text>
          </Box>
        ))}
        {H(`Asks · ${b.asksOpen} open of ${b.waiting.length}`)}
        {b.waiting.length === 0 && <Text dimColor>nothing</Text>}
        {b.waiting.map((w, i) => (
          <Box key={`a${i}`}>
            <Text wrap="wrap">{w}</Text>
          </Box>
        ))}
        {H(`Alarms (${warn.length})`)}
        {warn.length === 0 && <Text color="success">none</Text>}
        {warn.map(([c, t], i) => (
          <Box key={`w${i}`}>
            <Text wrap="wrap" color={c} bold={c === 'error'}>{t}</Text>
          </Box>
        ))}
        {H(`Autonomous · last 24 h (${b.acts.length})`)}
        {b.acts.length === 0 && <Text dimColor>nothing ran</Text>}
        {b.acts.map((a, i) => (
          <Box key={`x${i}`}>
            <Text wrap="wrap">· {a}</Text>
          </Box>
        ))}
        {H('Morning brief')}
        <Text wrap="wrap" dimColor>{b.brief || 'no brief on the board'}</Text>
        {H('Spend')}
        <Text wrap="wrap"><Text dimColor>tick · </Text>{b.tick}<Text dimColor> · ceiling · </Text>{b.ceiling || '—'}</Text>
      </Box>
    )
  })
}
