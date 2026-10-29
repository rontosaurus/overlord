import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { BlockName, Board, Config, FootField, Review, Row } from '../types'

// An optional board above the prompt, plus a /board pane. The data path is one local file: board.json, which
// agents/bin/board writes (run it by hand, from a timer, or with `/board refresh`). The engine reads the file for the
// mod ($.fs.read - the mod has no file access of its own); all parsing of the state files lives in that script and its
// tests, and this mod only distils the JSON into a few hundred bytes of plain data, composes rows (`compose`, pure, tested
// on fixtures), draws them, and opens a pane that lists the same areas one item per line under the same headings.
// This is a base template: the layout is driven by an optional second file, agents/board-mod.json (title, which blocks in
// which order, how many priority rows, one-line or full alarms, the foot fields ...). It is read the same way as the board,
// bounded the same way, and any problem with it (missing, not JSON, too big, an unknown or wrong-typed key) falls back to
// the defaults key by key, so a half-written file never blanks the band. See the README for the keys.
// Drawn in the terminal / Desktop / VS Code surfaces only, never in a Remote Control client. It reads the board; the
// only thing it ever runs is `agents/bin/board` itself, and only when you type `/board refresh`.
// The board file, the config and agents/bin/board are all resolved from AGENTS_REPO (the owner's repo, set in their user
// settings), never from the session's working directory: a folder you merely opened cannot plant a board.json, a config
// or a script here. Without AGENTS_REPO the mod reads and runs nothing and says so in the pane.
const BOARD_REL = 'agents/state/board/board.json'
const CONFIG_REL = 'agents/board-mod.json'
const BOARD_BIN_REL = 'agents/bin/board'
const POLL_MS = 60_000
const SPIN_MS = 250 // the spinner glyph is picked from the clock when the band redraws; nothing ticks for it
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
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
// The config is held to tighter limits: a file over MAX_CONFIG is not parsed, a string key over MAX_CFG_STR (MAX_CFG_PATH for
// the board path) is ignored, a list over MAX_CFG_LIST entries is ignored.
const MAX_CONFIG = 64 << 10
const MAX_CFG_STR = 40
const MAX_CFG_PATH = 120
const MAX_CFG_LIST = 8
const PANE = 'overlord-board'
const SLOT_COLOR: Record<string, 'success' | 'suggestion' | 'warning' | 'planMode' | 'claude'> = {
  tap: 'success', reply: 'suggestion', 'at-pc': 'warning', evening: 'planMode', decide: 'claude',
}

// style tokens for the composed rows; colours are theme keys, so they follow the person's theme. Tokens are looked up
// with `own`, so a token built from board.json text (a priority's slot) cannot reach Object.prototype.
const STYLE: Record<string, { color?: string; dimColor?: boolean; bold?: boolean }> = {
  warn: { color: 'warning' }, block: { color: 'error', bold: true }, dim: { dimColor: true }, plain: {},
  overlord: { color: 'claude', bold: true },
  'h:overlord': { color: 'claude', bold: true }, 'h:priorities': { color: 'success', bold: true },
  'h:overmind': { color: 'planMode', bold: true }, 'h:alarms': { color: 'warning', bold: true }, 'h:roles': { color: 'claude', bold: true },
  ...Object.fromEntries(Object.entries(SLOT_COLOR).map(([k, v]) => [`slot:${k}`, { color: v }])),
}
function own<T>(o: Record<string, T>, k: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined
}

// ---- the layout config (agents/board-mod.json): every key optional, every default here ----
const BLOCKS: readonly BlockName[] = ['priorities', 'roles', 'alarms', 'review']
const FOOT_FIELDS: readonly FootField[] = ['asks', 'open', 'today', 'tick', 'ceiling']
export const DEFAULT_CONFIG: Config = {
  title: 'OVERLORD', order: ['priorities', 'roles', 'alarms', 'review'], prioritiesRows: 3, alarms: 'auto', fullRows: 12,
  foot: ['asks', 'open', 'today', 'tick'], staleMinutes: null, showSubagents: true, boardFile: null,
}

const board = atom({ plugin: 'overlord-board', key: 'board' } as const, null as Board | null)
const readAt = atom({ plugin: 'overlord-board', key: 'readAt' } as const, 0)
const settings = atom({ plugin: 'overlord-board', key: 'settings' } as const, { file: '', repo: '', staleMin: DEFAULT_STALE_MIN, cfg: DEFAULT_CONFIG })

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
// a dollar amount from the board's ceiling block, or null when it is absent or not a number
const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null)
const usd = (n: number): string => `$${n.toFixed(2)}`

// ---- reading agents/board-mod.json ----
// Each helper returns null for a value it will not accept, and readConfig then leaves that key at its default: one bad key
// never costs the others. Nothing here throws, and a key is only ever looked up by name with hasOwnProperty.
const whole = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null)
// a short string: control characters and markup characters out, then at most `max` characters left or the value is refused
const word = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = clean(text(v, max + 1))
  return t && t.length <= max ? t : null
}
// a list of names from a closed set: no more than MAX_CFG_LIST entries, every entry in the set (a typo refuses the whole
// list rather than silently dropping a block), repeats dropped
const names = <T extends string>(v: unknown, allowed: readonly T[]): T[] | null => {
  if (!Array.isArray(v) || v.length > MAX_CFG_LIST) return null
  const out: T[] = []
  for (const x of v) {
    const hit = allowed.find(a => a === x)
    if (hit === undefined) return null
    if (!out.includes(hit)) out.push(hit)
  }
  return out
}
// a path inside the repo: relative, forward slashes, no empty or `..` segment, no control characters
const inRepo = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v || v.length > MAX_CFG_PATH) return null
  if (/[\x00-\x1f\x7f-\x9f\\]/.test(v) || /^[/]|^[A-Za-z]:/.test(v)) return null
  return v.split('/').some(seg => seg === '' || seg === '..') ? null : v
}

export const readConfig = (raw: unknown): Config => {
  const cfg: Config = { ...DEFAULT_CONFIG, order: [...DEFAULT_CONFIG.order], foot: [...DEFAULT_CONFIG.foot] }
  let d: unknown
  try {
    if (typeof raw !== 'string' || raw.length > MAX_CONFIG) return cfg // $.fs.read has no limit of its own
    d = JSON.parse(raw)
  } catch { return cfg }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return cfg
  const key = (k: string): unknown => (Object.prototype.hasOwnProperty.call(d, k) ? (d as Record<string, unknown>)[k] : undefined)
  const title = word(key('title'), MAX_CFG_STR)
  if (title) cfg.title = title
  const order = names(key('order'), BLOCKS)
  if (order) cfg.order = order
  const rows = whole(key('priorities_rows'), 0, 10)
  if (rows !== null) cfg.prioritiesRows = rows
  const al = key('alarms')
  if (al === 'auto' || al === 'count' || al === 'full' || al === 'off') cfg.alarms = al
  const full = whole(key('full_rows'), 1, 99)
  if (full !== null) cfg.fullRows = full
  const foot = names(key('foot'), FOOT_FIELDS)
  if (foot) cfg.foot = foot
  const stale = whole(key('stale_minutes'), 1, 10_080)
  if (stale !== null) cfg.staleMinutes = stale
  const subs = key('show_subagents')
  if (typeof subs === 'boolean') cfg.showSubagents = subs
  const file = inRepo(key('board_file'))
  if (file) cfg.boardFile = file
  return cfg
}

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
    hasNext: !!s.next && typeof s.next === 'object',
    attendedUsd: money(c?.attended_usd),
    usedUsd: money(c?.usd_used),
    running: cards.filter(x => x.col === 'running').slice(0, MAX_ITEMS).map(x => ({ id: clean(text(x.id), 60), what: clean(text(x.status), 80) })),
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

// alarm rows: [color, text, short label]; a cross is blocking, a triangle a warning. The short label is what the one-line
// "N alarms: ..." summary shows for the row.
export const alarms = (b: Board, now: number, staleMin: number): Array<['error' | 'warning', string, string]> => {
  const out: Array<['error' | 'warning', string, string]> = []
  const renderedAge = now - b.renderedEpoch * 1000
  if (b.renderedEpoch && renderedAge > staleMin * 60_000) out.push(['error', `✖ board stale ${age(renderedAge)} - re-run agents/bin/board (or /board refresh)`, 'board stale'])
  if (b.errors) out.push(['warning', `▲ board could not parse ${b.errors} row(s) of the state files`, 'parse errors'])
  if (b.open > b.wipInitiatives || b.asksOpen > b.askBackpressure) out.push(['warning', `▲ WIP ${b.open}/${b.wipInitiatives} initiatives · ${b.asksOpen}/${b.askBackpressure} asks`, 'WIP'])
  if (b.arcAlarms.length) out.push(['warning', `▲ arc · ${b.arcAlarms.join(' · ')}`, 'arc'])
  if (b.nextAgeHours > 36) out.push(['warning', `▲ next.md is ${Math.round(b.nextAgeHours)} h old`, 'next.md old'])
  if (b.recentDenies) out.push(['warning', `▲ ${b.recentDenies} guard deny(s) on attended sessions in the last 15 min — see state/drift.log`, 'guard denies'])
  return out
}

// ---- composition: a Line is [style, text][] plus the uncut text (set when the row was cut to the width, or kept ahead) ----
export type Seg = [string, string]
export type Line = { segs: Seg[]; full?: string }
// a block is its lines under an optional heading; a `fixed` block (the alarms) is never trimmed
export type Block = { head?: Line; lines: Line[]; fixed?: boolean }
export type Inputs = {
  b: Board; now: number; staleMin: number; ctxK: number | null; sinceMs: number | null; width: number; rows?: number
  cfg?: Config // the validated agents/board-mod.json; the defaults when absent
  spin?: string // the glyph before the title: a spinner frame while the session is working, a space otherwise
}

const L = (...segs: Seg[]): Line => ({ segs })
const slotStyle = (slot: string): string => (own(STYLE, `slot:${slot}`) ? `slot:${slot}` : 'plain')

// a heading row: "── Title ───────", at most 72 columns wide
export const rule = (title: string, style: string, width: number): Line => ({
  segs: [['dim', '── '], [style, title], ['dim', ` ${'─'.repeat(Math.max(2, Math.min(width, 72) - title.length - 4))}`]],
})

// blocks -> band lines within `budget` rows: whole if they fit, else every block keeps its heading (when it has one) plus the
// first N lines (the largest N that fits, never below 1). If even one line each does not fit, the last blocks are dropped
// whole rather than left as a heading with nothing under it. A block with no lines is left out, heading and all. A fixed
// block is always whole and its rows are taken off the budget first; with one present the others may all be dropped, without
// one the first block always stays.
export const flatten = (blocks: Block[], budget: number): Line[] => {
  const shown = blocks.filter(b => b.lines.length)
  const rows = (b: Block, n: number): number => (b.head ? 1 : 0) + Math.min(b.lines.length, n)
  const held = shown.filter(b => b.fixed).reduce((sum, b) => sum + rows(b, Infinity), 0)
  const free = shown.filter(b => !b.fixed)
  const room = budget - held
  const size = (n: number): number => free.reduce((sum, b) => sum + rows(b, n), 0)
  while (free.length > (held ? 0 : 1) && size(1) > room) free.pop()
  let n = Math.max(...free.map(b => b.lines.length), 0)
  while (n > 1 && size(n) > room) n--
  return shown.flatMap(b => (b.fixed ? [...(b.head ? [b.head] : []), ...b.lines] : free.includes(b) ? [...(b.head ? [b.head] : []), ...b.lines.slice(0, n)] : []))
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

// the whole band as lines. Four blocks, drawn in the order cfg.order lists them (one not listed is not drawn):
//   priorities  the first cfg.prioritiesRows ranked rows: `<#> <slot> · <next step>`; the hover card holds the whole row
//   roles       the title line (`<spinner> TITLE · ctx · session age · today`), then, when the board carries next.md, a
//               `now` line; a tall band adds `on deck / week` and the `running` line
//   alarms      one count line (`▲ 3 alarms: board stale · WIP · arc`) or every row, per cfg.alarms; never trimmed, so a
//               short band loses lines and then whole blocks before it loses an alarm
//   review      the overmind review line, only when board.json carries a review block
// A band of cfg.fullRows rows or more is "tall": headings, the full alarm list (under "auto") and the extra lines draw.
// The foot (cfg.foot, in that order) is always the last row.
export const compose = (i: Inputs): { body: Line[]; foot: Line } => {
  const { b, ctxK } = i
  const cfg = i.cfg ?? DEFAULT_CONFIG
  const w = Math.max(30, i.width)
  const rows = i.rows ?? 99
  const tall = rows >= cfg.fullRows
  const head = (title: string, style: string): Line | undefined => (tall ? rule(title, style, w) : undefined)

  const priorities: Line[] = b.priorities.slice(0, cfg.prioritiesRows).map(r => ({
    segs: [['dim', `  ${r.n} `], [slotStyle(r.slot), r.slot], ['dim', ' · '], ['plain', r.next || r.what]],
    ...(r.next && r.what ? { full: `${r.n} ${r.slot} · ${r.what} — ${r.next}`.slice(0, MAX_FULL) } : {}),
  }))

  const ctx = ctxK == null ? 'ctx ?' : `ctx ${ctxK}K/${ROTATE_K}K`
  const since = i.sinceMs == null ? '' : age(i.sinceMs)
  const spin = (i.spin ?? ' ').slice(0, 1) || ' '
  const roles: Line[] = [
    L(['overlord', `${spin} ${cfg.title}`], ['dim', ' · '], [ctxK != null && ctxK >= ROTATE_K ? 'warn' : 'dim', ctx],
      ...(since ? [['dim', ` · ${since}`] as Seg] : []), ...(b.attendedUsd != null ? [['dim', ` · today ≈${usd(b.attendedUsd)}`] as Seg] : [])),
  ]
  if (b.hasNext) roles.push(L(['dim', '  now · '], ['plain', b.now || '—']))
  if (tall && b.hasNext) roles.push(L(['dim', '  on deck · '], ['plain', b.deck || '—'], ['dim', ' · week · '], ['plain', b.week || '—']))
  if (tall && cfg.showSubagents && b.running.length) {
    const run: Seg[] = b.running.slice(0, 3).flatMap((r, k): Seg[] => [...(k ? [['dim', ' · '] as Seg] : []), ['plain', r.what ? `${r.id} ${r.what}` : r.id]])
    roles.push(L(['dim', '  running · '], ...run, ...(b.running.length > 3 ? [['dim', ` · +${b.running.length - 3}`] as Seg] : [])))
  }

  const al = alarms(b, i.now, i.staleMin)
  const mode = cfg.alarms === 'auto' ? (tall ? 'full' : 'count') : cfg.alarms
  const blocking = al.some(a => a[0] === 'error')
  const alarmLines: Line[] = mode === 'off' || !al.length ? []
    : mode === 'full' ? al.map(([c, t]): Line => L([c === 'error' ? 'block' : 'warn', t]))
    : [{ segs: [[blocking ? 'block' : 'warn', `${blocking ? '✖' : '▲'} ${noun(al.length, 'alarm')}: ${al.map(a => a[2]).join(' · ')}`]], full: al.map(a => a[1]).join(' | ').slice(0, MAX_FULL) }]

  const made: Record<BlockName, Block> = {
    priorities: { head: head('Priorities', 'h:priorities'), lines: priorities },
    roles: { head: head('Roles', 'h:roles'), lines: roles },
    alarms: { head: head('Alarms', 'h:alarms'), lines: alarmLines, fixed: true },
    review: { head: head('Overmind', 'h:overmind'), lines: b.review ? [reviewLine(b.review)] : [] },
  }
  const blocks = cfg.order.map(n => made[n])

  const part: Record<FootField, string | null> = {
    asks: `asks ${b.asksOpen}`,
    open: `open ${b.open}`,
    today: `today ran ${b.acts.length}${b.attendedUsd != null ? ` · all ≈${usd(b.attendedUsd + (b.usedUsd ?? 0))}` : ''}`,
    tick: `tick ${b.tick}`,
    ceiling: b.ceiling ? `ceiling ${b.ceiling}` : null,
  }
  const foot = L(['dim', `${cfg.foot.map(f => part[f]).filter(Boolean).join(' · ')} `])

  const budget = Math.max(1, rows - 1) // the foot is the last row of the band
  let lines = flatten(blocks, budget)
  if (!blocks.some(x => x.fixed && x.lines.length)) lines = lines.slice(0, budget)
  return { body: lines.map(l => cut(l, w)), foot: cut(foot, w - 8) }
}

let tick: { cancel: () => void } | undefined
let poll: (() => Promise<void>) | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const repo = ((await $.env.get('AGENTS_REPO')) || '').trim()
    // an override is honoured only as an absolute path (the owner's env); a relative one would resolve against the cwd
    const override = ((await $.env.get('OVERLORD_BOARD_FILE')) || '').trim()
    const absolute = /^([/\\]|[A-Za-z]:[/\\])/.test(override) ? override : ''
    const envStale = Number(await $.env.get('OVERLORD_BOARD_STALE_MIN')) || DEFAULT_STALE_MIN
    // where the board is read from and when it counts as stale: the env override, then the config, then the defaults
    const settle = (cfg: Config) => ({
      file: !repo ? '' : absolute || joinRepo(repo, cfg.boardFile ?? BOARD_REL), repo, staleMin: cfg.staleMinutes ?? envStale, cfg,
    })
    await update($, settings, () => settle(DEFAULT_CONFIG))
    poll = async () => {
      // the config is read first (it can move the board file) and again every poll, so an edit shows within a minute; a
      // missing or unreadable one is the defaults
      let cfg = DEFAULT_CONFIG
      if (repo) {
        try { cfg = readConfig(await $.fs.read(joinRepo(repo, CONFIG_REL))) } catch { cfg = DEFAULT_CONFIG }
      }
      const st = settle(cfg)
      await update($, settings, prev => (JSON.stringify(prev) === JSON.stringify(st) ? prev : st))
      let got: Board | null = null
      try {
        if (!st.file) throw new Error('AGENTS_REPO is not set')
        const body = await $.fs.read(st.file)
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
    const { staleMin, cfg } = await read($, settings)
    const now = await $.clock.now()
    const u = await $.session.usage().catch(() => null)
    const ctxK = u?.context.tokens != null ? Math.round(u.context.tokens / 1000) : null
    const w = Math.max(30, e.props.bodyColumns)
    const avail = Math.max(2, e.props.maxRows - 1) // one row of the allowance is left free, as the prompt area needs it
    // the title line carries a spinner frame while the session is working (picked from the clock on each redraw), else a space
    const spin = e.props.isWorking ? (FRAMES[Math.floor(now / SPIN_MS) % FRAMES.length] as string) : ' '
    const { body, foot } = compose({ b, now, staleMin, ctxK, sinceMs: u ? now - u.startedAt : null, width: w, rows: avail, cfg, spin })
    const { Box, Text, Button } = $.ui.resolve(e)
    const open = () => { void $.ui.open({ id: PANE, title: 'Board' }) }
    // the blocks were composed to leave the foot its row; it is always the last one
    const total = body.length + 1
    // A row with an uncut text (cut to the width, or a priority whose hover holds more than the band shows) becomes a keyed
    // Box whose hidden absolute card shows that text while the pointer is on the row - no hook runs, nothing redraws. Rows
    // in the top half grow the card down, the rest up.
    const draw = (l: Line, i: number) => {
      const row = (
        <Text key={`t${i}`} wrap="truncate">
          {l.segs.map(([st, t], j) => <Text key={String(j)} {...(own(STYLE, st) ?? {})}>{t}</Text>)}
        </Text>
      )
      if (!l.full) return row
      const down = i < total / 2
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
        {body.length ? <Box flexDirection="column">{body.map(draw)}</Box> : null}
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
    const { file, repo, staleMin, cfg } = await read($, settings)
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
    // The four sections the band has come first, in the band's order (the pane is the full view, so one the band leaves out
    // still appears, after the others, and the alarms are listed here even when the band's alarms are off); then the rest.
    const section: Record<BlockName, (top: number) => any> = {
      priorities: top => (
        <Box key="s-priorities" flexDirection="column">
          {H('Priorities · by rank', 'h:priorities', top)}
          {b.priorities.length === 0 && <Text dimColor>none ranked</Text>}
          {b.priorities.map((r, i) => (
            <Box key={`p${i}`} flexDirection="column">
              <Text wrap="wrap">
                <Text dimColor>{r.n} </Text><Text color={slotColor(r.slot)}>{r.slot}</Text><Text dimColor> · </Text>{r.what}
              </Text>
              <Text wrap="wrap" dimColor>    {r.next}</Text>
            </Box>
          ))}
        </Box>
      ),
      roles: top => (
        <Box key="s-roles" flexDirection="column">
          {H(cfg.title, 'h:overlord', top)}
          <Text wrap="wrap"><Text dimColor>now · </Text>{b.now || '—'}</Text>
          <Text wrap="wrap"><Text dimColor>on deck · </Text>{b.deck || '—'}</Text>
          <Text wrap="wrap"><Text dimColor>week · </Text>{b.week || '—'}</Text>
          <Text wrap="wrap" dimColor>last wake · {b.lastWake || '—'}</Text>
          <Text wrap="wrap" dimColor>rendered {age(now - b.renderedEpoch * 1000)} ago · {file}</Text>
        </Box>
      ),
      alarms: top => (
        <Box key="s-alarms" flexDirection="column">
          {H(`Alarms (${warn.length})`, 'h:alarms', top)}
          {warn.length === 0 && <Text color="success">none</Text>}
          {warn.map(([c, t], i) => (
            <Box key={`w${i}`}>
              <Text wrap="wrap" color={c} bold={c === 'error'}>{t}</Text>
            </Box>
          ))}
        </Box>
      ),
      review: top => (
        <Box key="s-review" flexDirection="column">
          {H('Overmind', 'h:overmind', top)}
          <Text wrap="wrap">{rv ? reviewLine(rv).segs.map(sg => sg[1]).join('').trim() : ''}</Text>
        </Box>
      ),
    }
    const sequence = [...cfg.order, ...BLOCKS.filter(n => !cfg.order.includes(n))].filter(n => n !== 'review' || rv)
    return (
      <Box flexDirection="column" paddingX={1}>
        {sequence.map((n, k) => section[n](k === 0 ? 0 : 1))}
        {H(`Waiting on you (${b.threads.length})`, 'h:overlord', sequence.length ? 1 : 0)}
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
