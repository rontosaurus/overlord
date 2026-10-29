// The distilled board the mod keeps in session state: plain data cut from board.json (agents/bin/board --json),
// never the whole document. The board script has already withheld secret-shaped text before it wrote the file.
export type Row = { n: string; slot: string; what: string; next: string }
export type Thread = { thread: string; on: string; since: string }
export type Running = { id: string; what: string } // an initiative whose overseer is running now (a `running` card)
export type Review = {
  lastReview: string // 'YYYY-MM-DD' of the last overmind review marker; '' when there is none yet
  daysSince: number | null // whole days since that marker; null when there is none
  debriefsSince: number | null // debriefs dated on or after it; null when there is no marker or no debriefs folder
}
export type Board = {
  renderedEpoch: number // unix seconds the board was last rendered
  lastWake: string
  now: string
  deck: string
  week: string
  nextAgeHours: number
  priorities: Row[] // priorities.md, ranked; the band shows the first `priorities_rows` of them (3 by default)
  asksOpen: number // open ask rows (no go recorded yet)
  open: number // open initiatives
  waiting: string[] // every ask card, "#n action staged"
  watching: number
  acts: string[] // autonomous actions in the last 24 h, newest first
  brief: string // the morning brief's first lines
  tick: string // "12-31 06:04 propose success" or "none"
  ceiling: string // "$1.07/$10"
  arcAlarms: string[] // "30 DEAD STALE" per workstream with an alarm
  threads: Thread[] // threads tagged owner: the world is waiting on you
  errors: number // sections or rows the board could not parse
  wipInitiatives: number // limit from ceiling.json (default 5)
  askBackpressure: number // limit from ceiling.json (default 4)
  recentDenies: number // alarms.recent_denies: guard denies on attended sessions in the last 15 minutes (0 when absent)
  review: Review | null // null when board.json has no review block (no notes-to-overmind.md)
  hasNext: boolean // board.json carries a parsed next.md (now / on deck / week)
  attendedUsd: number | null // today's spend in attended sessions, from the ceiling block; null when there is none
  usedUsd: number | null // today's unattended spend, from the same block
  running: Running[] // initiatives whose overseer is running now
}

// agents/board-mod.json after validation: every key optional, an invalid one falls back to its default on its own.
export type BlockName = 'priorities' | 'roles' | 'alarms' | 'review'
export type FootField = 'asks' | 'open' | 'today' | 'tick' | 'ceiling'
export type Config = {
  title: string // the first word of the roles line
  order: BlockName[] // the blocks drawn, top to bottom; one not listed is not drawn
  prioritiesRows: number // how many priority rows
  alarms: 'auto' | 'count' | 'full' | 'off' // auto = a count line below fullRows, the full list at or above
  fullRows: number // the band height at or above which headings, full alarms and the extra lines draw
  foot: FootField[] // the fields on the foot row, in order
  staleMinutes: number | null // null = not set in the file (the environment variable, then 60)
  showSubagents: boolean // the `running` line of the roles block (tall band only)
  boardFile: string | null // a path relative to AGENTS_REPO; null = the default
}

declare module 'claude-code' {
  interface PluginState {
    'overlord-board': { board: Board | null; readAt: number; settings: { file: string; repo: string; staleMin: number; cfg: Config } }
  }
}
