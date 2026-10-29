import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Review, Row } from '../types'

// An optional board above the prompt, plus a /board pane. The data path is one local file: board.json, which
// agents/bin/board writes (run it by hand, from a timer, or with `/board refresh`). The engine reads the file for the
// mod ($.fs.read - the mod has no file access of its own); all parsing of the state files lives in that script and its
// tests, and this mod only distils the JSON into a few hundred bytes of plain data, composes rows (`compose`, pure, tested
// on fixtures: each area is a block with a heading, and a short band keeps every heading plus the first few lines of each
// block), draws them, and opens a pane that lists the same areas one item per line under the same headings.
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
// Limits on what is kept from board.json. The renderer already bounds its output, but a hand-edited file or one chosen with
// OVERLORD_BOARD_FILE never went through it, so the mod bounds what it keeps and draws: a string is cut to MAX_STR
// characters, a list to MAX_ITEMS entries, a cut row's hover card to MAX_FULL, and a file over MAX_BODY is not parsed.
const MAX_STR = 300
const MAX_ITEMS = 50
const MAX_FULL = 500
const MAX_BODY = 8 << 20
const PANE = 'overlord-board'
const SLOT_COLOR: Record<string, 'success' | 'suggestion' | 'warning' | 'planMode' | 'claude'> = {
  tap: 'success', reply: 'suggestion', 'at-pc': 'warning', evening: 'planMode', decide: 'claude',
}

// style tokens for the composed rows; colours are theme keys, so they follow the person's theme. Tokens are looked up
// with `own`, so a token built from board.json text (a priority's slot) cannot reach Object.prototype.
const STYLE: Record<string, { color?: string; dimColor?: boolean; bold?: boolean }> = {
  warn: { color: 'warning' }, block: { color: 'error', bold: true }, dim: { dimColor: true }, plain: {},
  'h:overlord': { color: 'claude', bold: true }, 'h:priorities': { color: 'success', bold: true },
  'h:overmind': { color: 'planMode', bold: true }, 'h:alarms': { color: 'warning', bold: true },
  ...Object.fromEntries(Object.entries(SLOT_COLOR).map(([k, v]) => [`slot:${k}`, { color: v }])),
}
function own<T>(o: Record<string, T>, k: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined
}

const board = atom({ plugin: 'overlord-board', key: 'board' } as const, null as Board | null)
const readAt = atom({ plugin: 'overlord-board', key: 'readAt' } as const, 0)
const settings = atom({ plugin: 'overlord-board', key: 'settings' } as const, { file: '', repo: '', staleMin: DEFAULT_STALE_MIN })

// Every string from board.json is untrusted text: it is cut to a length first, then control characters (escape sequences
// that could drive the terminal, C1 codes, NUL) are removed from all of it before it is kept or drawn. Invisible and
// bidirectional format characters are not handled here; the renderer (agents/bin/board) strips those.
const CTRL = /[\x00-\x1f\x7f-\x9f]/g
const text = (v: unknown, max = MAX_STR): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max).replace(CTRL, ' ')
const clean = (s: string, max = MAX_STR): string => s.replace(CTRL, ' ').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
const cap = (s: string): string => s.slice(0, MAX_STR)
const slotColor = (slot: string) => (Object.prototype.hasOwnProperty.call(SLOT_COLOR, slot) ? SLOT_COLOR[slot] : undefined)
const joinRepo = (repo: string, rel: string): string => `${repo.replace(/[\\/]+$/, '')}/${rel}`
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])
// the entries of a list that are objects (a null or a number in a list is skipped, never a throw)
const objs = (v: unknown): any[] => list(v).filter(x => x && typeof x === 'object')
// a whole, non-negative count, or null when the value is absent or not a number
const count = (v: unknown): number | null => {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null
}
const noun = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

// board.json -> Board: the few fields the band and pane draw, nothing else kept in state
export const distil = (d: any): Board => {
  const cards = objs(d?.cards)
  const s = d?.strategist ?? {}
  const n = s.next ?? {}
  const brief = cards.find(c => c.col === 'autonomous' && c.kind === 'brief')
  const t = d?.tick
  const c = d?.ceiling
  const rv = d?.review
  return {
    renderedEpoch: Number(d?.rendered_epoch) || 0,
    lastWake: clean(text(d?.last_wake)),
    now: clean(text(n.now)),
    deck: clean(text(n.deck)),
    week: clean(text(n.week)),
    nextAgeHours: Number(n.age_hours) || 0,
    priorities: objs(s.priorities).slice(0, MAX_ITEMS).map((r: any): Row => ({
      n: text(r['#']), slot: text(r.slot), what: clean(text(r.what)), next: clean(text(r['next (who)'])),
    })),
    asksOpen: Number(d?.asks_open) || 0,
    open: cards.filter(x => x.col === 'open' || x.col === 'running').length,
    waiting: cards.filter(x => x.col === 'waiting').slice(0, MAX_ITEMS).map(x => clean(`${text(x.title)} ${text(x.status)}`)),
    watching: cards.filter(x => x.col === 'watching').length,
    acts: cards.filter(x => x.col === 'autonomous' && x.kind === 'act').slice(0, MAX_ITEMS).map(x => clean(text(x.status))),
    brief: brief ? clean(text(brief.excerpt, 2000), 600) : '',
    tick: t ? cap(`${text(t.finished).slice(5, 16).replace('T', ' ')} ${text(t.mode)} ${text(t.subtype)}`.trim()) : 'none',
    ceiling: c ? cap(`$${(Number(c.usd_used) || 0).toFixed(2)}/$${text(c.usd_ceiling)}${c.spent ? ' SPENT' : ''}`) : '',
    arcAlarms: objs(s.arc).filter((a: any) => a.alarms && a.alarms !== '—').slice(0, MAX_ITEMS).map((a: any) => cap(`${text(a.spec)} ${text(a.alarms)}`)),
    threads: objs(s.threads).filter((x: any) => text(x.tag) === 'owner').slice(0, MAX_ITEMS).map((x: any) => ({
      thread: clean(text(x.thread)), on: clean(text(x['waiting on'])), since: text(x.since),
    })),
    errors: list(d?.errors).length,
    wipInitiatives: Number(d?.limits?.wip_initiatives) || DEFAULT_WIP,
    askBackpressure: Number(d?.limits?.ask_backpressure) || DEFAULT_ASKS,
    // both keys are optional in board.json: absent or malformed gives 0 / null, never a throw
    recentDenies: count(d?.alarms?.recent_denies) ?? 0,
    review: rv && typeof rv === 'object' && !Array.isArray(rv)
      ? {
          lastReview: /^\d{4}-\d\d-\d\d$/.test(text(rv.last_review)) ? text(rv.last_review) : '',
          daysSince: count(rv.days_since),
          debriefsSince: count(rv.debriefs_since),
        } satisfies Review
      : null,
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
export const alarms = (b: Board, now: number, staleMin: number): Array<['error' | 'warning', string]> => {
  const out: Array<['error' | 'warning', string]> = []
  const renderedAge = now - b.renderedEpoch * 1000
  if (b.renderedEpoch && renderedAge > staleMin * 60_000) out.push(['error', `✖ board stale ${age(renderedAge)} - re-run agents/bin/board (or /board refresh)`])
  if (b.errors) out.push(['warning', `▲ board could not parse ${b.errors} row(s) of the state files`])
  if (b.open > b.wipInitiatives || b.asksOpen > b.askBackpressure) out.push(['warning', `▲ WIP ${b.open}/${b.wipInitiatives} initiatives · ${b.asksOpen}/${b.askBackpressure} asks`])
  if (b.arcAlarms.length) out.push(['warning', `▲ arc · ${b.arcAlarms.join(' · ')}`])
  if (b.nextAgeHours > 36) out.push(['warning', `▲ next.md is ${Math.round(b.nextAgeHours)} h old`])
  if (b.recentDenies) out.push(['warning', `▲ ${b.recentDenies} guard deny(s) on attended sessions in the last 15 min — see state/drift.log`])
  return out
}

// ---- composition: a Line is [style, text][] plus the uncut text (set when the row was cut to the width) ----
export type Seg = [string, string]
export type Line = { segs: Seg[]; full?: string }
export type Block = { head: Line; lines: Line[] }
export type Inputs = { b: Board; now: number; staleMin: number; ctxK: number | null; sinceMs: number | null; width: number; rows?: number }

const L = (...segs: Seg[]): Line => ({ segs })
const slotStyle = (slot: string): string => (own(STYLE, `slot:${slot}`) ? `slot:${slot}` : 'plain')

// a heading row: "── Title ───────", at most 72 columns wide
export const rule = (title: string, style: string, width: number): Line => ({
  segs: [['dim', '── '], [style, title], ['dim', ` ${'─'.repeat(Math.max(2, Math.min(width, 72) - title.length - 4))}`]],
})

// blocks -> band lines within `budget` rows: whole if they fit, else every block keeps its heading plus the first N
// lines (the largest N that fits, never below 1). If even a heading and one line each do not fit, the last blocks are
// dropped whole rather than left as a heading with nothing under it. A block with no lines is left out, heading and all.
export const flatten = (blocks: Block[], budget: number): Line[] => {
  const shown = blocks.filter(b => b.lines.length)
  const size = (n: number): number => shown.reduce((s, b) => s + 1 + Math.min(b.lines.length, n), 0)
  while (shown.length > 1 && size(1) > budget) shown.pop()
  let n = Math.max(...shown.map(b => b.lines.length), 0)
  while (n > 1 && size(n) > budget) n--
  return shown.flatMap(b => [b.head, ...b.lines.slice(0, n)])
}

// a row wider than the band is cut with an ellipsis and keeps its uncut text (`full`) for the hover card
export const cut = (line: Line, width: number): Line => {
  const plain = line.segs.map(s => s[1]).join('')
  if (plain.length <= width) return line
  const segs: Seg[] = []
  let left = Math.max(1, width - 1)
  for (const [st, t] of line.segs) {
    if (left <= 0) break
    segs.push([st, t.slice(0, left)])
    left -= t.length
  }
  segs.push(['dim', '…'])
  return { ...line, segs, full: (line.full ?? plain).slice(0, MAX_FULL) }
}

const reviewLine = (r: Review): Line =>
  r.lastReview
    ? L(['dim', '  review · '], ['plain', `last ${r.lastReview}`], ['dim', ' · '],
        ['plain', r.daysSince == null ? 'days since —' : `${noun(r.daysSince, 'day')} ago`], ['dim', ' · '],
        ['plain', r.debriefsSince == null ? 'debriefs since —' : `${noun(r.debriefsSince, 'debrief')} since`])
    : L(['dim', '  review · '], ['plain', 'none yet'])

// the whole band as lines: the OVERLORD block (now, on deck / week), the top three priorities, the Overmind block (the
// review line, only when board.json carries one), then the alarms (never collapsed: their rows are reserved first), then the foot
export const compose = (i: Inputs): { body: Line[]; alerts: Line[]; foot: Line } => {
  const { b, ctxK } = i
  const w = Math.max(30, i.width)
  const alerts: Line[] = alarms(b, i.now, i.staleMin).map(([c, t]): Line => L([c === 'error' ? 'block' : 'warn', t]))
  if (alerts.length) alerts.unshift(rule('Alarms', 'h:alarms', w))
  const ctx = ctxK == null ? 'ctx ?' : `ctx ${ctxK}K/${ROTATE_K}K`
  const since = i.sinceMs == null ? '' : age(i.sinceMs)
  const blocks: Block[] = [
    {
      head: rule('OVERLORD', 'h:overlord', w),
      lines: [
        L(['dim', '  now · '], ['plain', b.now || '—'], ['dim', ' · '], [ctxK != null && ctxK >= ROTATE_K ? 'warn' : 'dim', ctx], ...(since ? [['dim', ` · ${since}`] as Seg] : [])),
        L(['dim', '  on deck · '], ['plain', b.deck || '—'], ['dim', ' · week · '], ['plain', b.week || '—']),
      ],
    },
    {
      head: rule('Priorities', 'h:priorities', w),
      lines: b.priorities.slice(0, 3).map(r => L(['dim', `  ${r.n} `], [slotStyle(r.slot), r.slot], ['dim', ' · '], ['plain', r.what])),
    },
    { head: rule('Overmind', 'h:overmind', w), lines: b.review ? [reviewLine(b.review)] : [] },
  ]
  const foot = L(['dim', `tick · ${b.tick} · ran ${b.acts.length} · asks ${b.asksOpen} · open ${b.open}${b.ceiling ? ` · ${b.ceiling}` : ''} `])
  return {
    body: flatten(blocks, (i.rows ?? 99) - 1 - alerts.length).map(l => cut(l, w)),
    alerts: alerts.map(l => cut(l, w)),
    foot: cut(foot, w - 8),
  }
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
        if (body.length > MAX_BODY) throw new Error('board.json is over the size limit') // $.fs.read has no limit of its own
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
    const ctxK = u?.context.tokens != null ? Math.round(u.context.tokens / 1000) : null
    const w = Math.max(30, e.props.bodyColumns)
    const avail = Math.max(2, e.props.maxRows - 1) // one row of the allowance is left free, as the prompt area needs it
    const { body, alerts, foot } = compose({ b, now, staleMin, ctxK, sinceMs: u ? now - u.startedAt : null, width: w, rows: avail })
    const { Box, Text, Button } = $.ui.resolve(e)
    const open = () => { void $.ui.open({ id: PANE, title: 'Board' }) }
    // the foot is always the last row; the blocks were composed to leave it and the alarm rows their space
    const rows = Math.max(1, avail - 1 - alerts.length)
    const shown = body.slice(0, rows)
    const total = shown.length + alerts.length + 1
    // A row cut to the width keeps its uncut text: the row becomes a keyed Box whose hidden absolute card shows that
    // text while the pointer is on the row - no hook runs, nothing redraws. Rows in the top half grow the card down,
    // the rest up.
    const draw = (base: number) => (l: Line, i: number) => {
      const row = (
        <Text key={`t${i}`} wrap="truncate">
          {l.segs.map(([st, t], j) => <Text key={String(j)} {...(own(STYLE, st) ?? {})}>{t}</Text>)}
        </Text>
      )
      if (!l.full) return row
      const down = base + i < total / 2
      return (
        <Box key={`r${i}`} flexDirection="row">
          {row}
          <Box position="absolute" display="none" hover={{ display: 'flex' }} backgroundColor="subtle" paddingX={1}
            width={Math.min(l.full.length + 2, w)} {...(down ? { top: 0 } : { bottom: 0 })} left={0}>
            <Text wrap="wrap">{l.full}</Text>
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="column">{shown.map(draw(0))}</Box>
        {alerts.length ? <Box flexDirection="column">{alerts.map(draw(shown.length))}</Box> : null}
        <Box flexDirection="row">
          <Text wrap="truncate" dimColor>{foot.segs.map(sg => sg[1]).join('')}</Text>
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
    // the same headings as the band, one item per line under each
    const H = (t: string, st: string, top = 1) => (
      <Box marginTop={top}>
        <Text dimColor>── </Text><Text {...(own(STYLE, st) ?? {})}>{t}</Text>
      </Box>
    )
    const warn = alarms(b, now, staleMin)
    const rv = b.review
    return (
      <Box flexDirection="column" paddingX={1}>
        {H('OVERLORD', 'h:overlord', 0)}
        <Text wrap="wrap"><Text dimColor>now · </Text>{b.now || '—'}</Text>
        <Text wrap="wrap"><Text dimColor>on deck · </Text>{b.deck || '—'}</Text>
        <Text wrap="wrap"><Text dimColor>week · </Text>{b.week || '—'}</Text>
        <Text wrap="wrap" dimColor>last wake · {b.lastWake || '—'}</Text>
        <Text wrap="wrap" dimColor>rendered {age(now - b.renderedEpoch * 1000)} ago · {file}</Text>
        {H('Priorities · by rank', 'h:priorities')}
        {b.priorities.length === 0 && <Text dimColor>none ranked</Text>}
        {b.priorities.map((r, i) => (
          <Box key={`p${i}`} flexDirection="column">
            <Text wrap="wrap">
              <Text dimColor>{r.n} </Text><Text color={slotColor(r.slot)}>{r.slot}</Text><Text dimColor> · </Text>{r.what}
            </Text>
            <Text wrap="wrap" dimColor>    {r.next}</Text>
          </Box>
        ))}
        {rv ? (
          <Box flexDirection="column">
            {H('Overmind', 'h:overmind')}
            <Text wrap="wrap">{reviewLine(rv).segs.map(sg => sg[1]).join('').trim()}</Text>
          </Box>
        ) : null}
        {H(`Waiting on you (${b.threads.length})`, 'h:overlord')}
        {b.threads.length === 0 && <Text dimColor>nothing</Text>}
        {b.threads.map((t, i) => (
          <Box key={`t${i}`}>
            <Text wrap="wrap">{t.thread}<Text dimColor> · {t.on} · since {t.since}</Text></Text>
          </Box>
        ))}
        {H(`Asks · ${b.asksOpen} open of ${b.waiting.length}`, 'h:overlord')}
        {b.waiting.length === 0 && <Text dimColor>nothing</Text>}
        {b.waiting.map((w, i) => (
          <Box key={`a${i}`}>
            <Text wrap="wrap">{w}</Text>
          </Box>
        ))}
        {H(`Alarms (${warn.length})`, 'h:alarms')}
        {warn.length === 0 && <Text color="success">none</Text>}
        {warn.map(([c, t], i) => (
          <Box key={`w${i}`}>
            <Text wrap="wrap" color={c} bold={c === 'error'}>{t}</Text>
          </Box>
        ))}
        {H(`Autonomous · last 24 h (${b.acts.length})`, 'h:overlord')}
        {b.acts.length === 0 && <Text dimColor>nothing ran</Text>}
        {b.acts.map((a, i) => (
          <Box key={`x${i}`}>
            <Text wrap="wrap">· {a}</Text>
          </Box>
        ))}
        {H('Morning brief', 'h:overlord')}
        <Text wrap="wrap" dimColor>{b.brief || 'no brief on the board'}</Text>
        {H('Spend', 'h:overlord')}
        <Text wrap="wrap"><Text dimColor>tick · </Text>{b.tick}<Text dimColor> · ceiling · </Text>{b.ceiling || '—'}</Text>
      </Box>
    )
  })
}
