// The distilled board the mod keeps in session state: plain data cut from board.json (agents/bin/board --json),
// never the whole document. The board script has already withheld secret-shaped text before it wrote the file.
export type Row = { n: string; slot: string; what: string; next: string }
export type Thread = { thread: string; on: string; since: string }
export type Board = {
  renderedEpoch: number // unix seconds the board was last rendered
  lastWake: string
  now: string
  deck: string
  week: string
  nextAgeHours: number
  priorities: Row[] // priorities.md, ranked; the first three are shown in the band
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
}

declare module 'claude-code' {
  interface PluginState {
    'overlord-board': { board: Board | null; readAt: number; settings: { file: string; staleMin: number } }
  }
}
