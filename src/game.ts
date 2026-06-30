import { generateSolvableBoard } from './boardGenerator'
import { computeSafeCells } from './solver'

export type DifficultyName = 'beginner' | 'intermediate' | 'expert'

export type Difficulty = {
  label: string
  rows: number
  cols: number
  mines: number
}

export type Cell = {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
  incorrectFlagCount: boolean
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost'

// Why the game was lost, so the UI can distinguish a detonated mine from a punished guess.
export type LossReason = 'mine' | 'guess' | null

export type ChordingMode = 'none' | 'dig' | 'flag' | 'both'

export type JumpMode = 'unrevealed' | 'number'

// Fastest clear time (ms) per difficulty; a difficulty is absent until it's been cleared once.
export type BestTimes = Partial<Record<DifficultyName, number>>

export type GameSnapshot = {
  difficulty: DifficultyName
  difficultyLabel: string
  rows: number
  cols: number
  mines: number
  board: Cell[][]
  status: GameStatus
  elapsed: number
  remainingMines: number
  targetedCell: { row: number; col: number } | null
  chordingMode: ChordingMode
  jumpMode: JumpMode
  smartChording: boolean
  punishGuessing: boolean
  lossReason: LossReason
  bestTimes: BestTimes
}

export type GameController = {
  getSnapshot: () => GameSnapshot
  getElapsedMs: () => number
  clickCell: (row: number, col: number) => void
  revealCell: (row: number, col: number) => void
  chordCell: (row: number, col: number) => void
  moveTarget: (deltaRow: number, deltaCol: number) => void
  moveTargetToFirstUnrevealedCell: (deltaRow: number, deltaCol: number) => void
  moveTargetToNextNumberCell: (deltaRow: number, deltaCol: number) => void
  toggleFlag: (row: number, col: number) => void
  reset: () => void
  setDifficulty: (name: DifficultyName) => void
  setChordingMode: (mode: ChordingMode) => void
  setJumpMode: (mode: JumpMode) => void
  setSmartChording: (enabled: boolean) => void
  setPunishGuessing: (enabled: boolean) => void
  subscribe: (listener: () => void) => () => void
}

export const difficulties: Record<DifficultyName, Difficulty> = {
  beginner: { label: 'Beginner', rows: 8, cols: 8, mines: 8 },
  intermediate: { label: 'Intermediate', rows: 10, cols: 10, mines: 16 },
  expert: { label: 'Expert', rows: 12, cols: 12, mines: 24 },
}

const stateStorageKey = 'minesweeper.state'

type PersistedState = {
  difficulty: DifficultyName
  chordingMode: ChordingMode
  jumpMode: JumpMode
  smartChording: boolean
  punishGuessing: boolean
  status: GameStatus
  lossReason: LossReason
  elapsed: number
  firstReveal: boolean
  targetedCell: { row: number; col: number } | null
  board: Cell[][]
  bestTimes: BestTimes
}

export function createGame(): GameController {
  let difficulty: DifficultyName = 'beginner'
  let board: Cell[][] = []
  let status: GameStatus = 'ready'
  let startedAt = 0
  let elapsed = 0
  let timerPaused = false
  let firstReveal = true
  let targetedCell: { row: number; col: number } | null = null
  let chordingMode: ChordingMode = 'both'
  let jumpMode: JumpMode = 'unrevealed'
  let smartChording = true
  let punishGuessing = false
  let lossReason: LossReason = null
  let bestTimes: BestTimes = {}

  const listeners = new Set<() => void>()

  function getDifficulty(): Difficulty {
    return difficulties[difficulty]
  }

  function createBoard(rows: number, cols: number): Cell[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        mine: false,
        revealed: false,
        flagged: false,
        adjacent: 0,
        incorrectFlagCount: false,
      })),
    )
  }

  function getCenteredTarget() {
    const { rows, cols } = getDifficulty()

    return {
      row: Math.floor(rows / 2),
      col: Math.floor(cols / 2),
    }
  }

  function clampTarget(row: number, col: number) {
    const { rows, cols } = getDifficulty()

    return {
      row: Math.min(Math.max(row, 0), rows - 1),
      col: Math.min(Math.max(col, 0), cols - 1),
    }
  }

  function setTarget(row: number, col: number) {
    targetedCell = clampTarget(row, col)
  }

  function notify() {
    for (const listener of listeners) {
      listener()
    }

    persist()
  }

  function persist() {
    try {
      const state: PersistedState = {
        difficulty,
        chordingMode,
        jumpMode,
        smartChording,
        punishGuessing,
        status,
        lossReason,
        elapsed: getElapsedMs(),
        firstReveal,
        targetedCell,
        board,
        bestTimes,
      }

      localStorage.setItem(stateStorageKey, JSON.stringify(state))
    } catch {
      // ignore unavailable storage
    }
  }

  function loadPersistedState(): PersistedState | null {
    try {
      const raw = localStorage.getItem(stateStorageKey)

      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as PersistedState

      if (!isValidPersistedState(parsed)) {
        return null
      }

      return parsed
    } catch {
      return null
    }
  }

  function isValidPersistedState(state: PersistedState | null): state is PersistedState {
    if (!state || typeof state !== 'object') {
      return false
    }

    const difficultyConfig = difficulties[state.difficulty]

    if (!difficultyConfig) {
      return false
    }

    if (!Array.isArray(state.board) || state.board.length !== difficultyConfig.rows) {
      return false
    }

    if (state.board.some((row) => !Array.isArray(row) || row.length !== difficultyConfig.cols)) {
      return false
    }

    const validStatuses: GameStatus[] = ['ready', 'playing', 'won', 'lost']
    const validChording: ChordingMode[] = ['none', 'dig', 'flag', 'both']
    const validJump: JumpMode[] = ['unrevealed', 'number']

    return (
      validStatuses.includes(state.status) &&
      validChording.includes(state.chordingMode) &&
      validJump.includes(state.jumpMode)
    )
  }

  function restore() {
    const saved = loadPersistedState()

    if (!saved) {
      reset()
      return
    }

    difficulty = saved.difficulty
    chordingMode = saved.chordingMode
    jumpMode = saved.jumpMode
    // Older saves predate these options; default rather than reject the whole save.
    smartChording = typeof saved.smartChording === 'boolean' ? saved.smartChording : true
    punishGuessing = typeof saved.punishGuessing === 'boolean' ? saved.punishGuessing : false
    lossReason = saved.lossReason === 'mine' || saved.lossReason === 'guess' ? saved.lossReason : null
    status = saved.status
    elapsed = saved.elapsed
    firstReveal = saved.firstReveal
    targetedCell = saved.targetedCell
    board = saved.board
    bestTimes = saved.bestTimes && typeof saved.bestTimes === 'object' ? saved.bestTimes : {}
    // Resume a running stopwatch from the saved elapsed time rather than counting
    // the wall-clock time the tab was closed.
    startedAt = status === 'playing' ? Date.now() - elapsed : 0

    notify()
  }

  function plantMines(safeRow: number, safeCol: number) {
    const { rows, cols, mines } = getDifficulty()
    const mineGrid = generateSolvableBoard(rows, cols, mines, safeRow, safeCol)

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        board[row][col].mine = mineGrid[row][col]
      }
    }

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (board[row][col].mine) {
          continue
        }

        board[row][col].adjacent = getAdjacentPositions(row, col).filter(
          ([nextRow, nextCol]) => board[nextRow][nextCol].mine,
        ).length
      }
    }
  }

  function revealFloodFill(startRow: number, startCol: number) {
    const { rows, cols } = getDifficulty()
    const stack: Array<[number, number]> = [[startRow, startCol]]

    while (stack.length > 0) {
      const [row, col] = stack.pop()!
      const cell = board[row][col]

      if (cell.revealed || cell.flagged) {
        continue
      }

      cell.revealed = true

      if (cell.adjacent !== 0) {
        continue
      }

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
          if (rowOffset === 0 && colOffset === 0) {
            continue
          }

          const nextRow = row + rowOffset
          const nextCol = col + colOffset

          if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
            stack.push([nextRow, nextCol])
          }
        }
      }
    }
  }

  function getAdjacentPositions(row: number, col: number) {
    const { rows, cols } = getDifficulty()
    const positions: Array<[number, number]> = []

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) {
          continue
        }

        const nextRow = row + rowOffset
        const nextCol = col + colOffset

        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
          positions.push([nextRow, nextCol])
        }
      }
    }

    return positions
  }

  function revealAllMines() {
    for (const row of board) {
      for (const cell of row) {
        if (cell.mine) {
          cell.revealed = true
        }
      }
    }
  }

  function checkWin() {
    const hasWon = board.every((row) => row.every((cell) => cell.mine || cell.revealed))

    if (hasWon) {
      status = 'won'
      elapsed = startedAt ? Date.now() - startedAt : 0
      revealAllMines()

      const best = bestTimes[difficulty]
      if (best === undefined || elapsed < best) {
        bestTimes[difficulty] = elapsed
      }
    }
  }

  function startTimer() {
    if (status === 'ready') {
      status = 'playing'
      startedAt = Date.now()
    }
  }

  function endGame(result: Exclude<GameStatus, 'ready' | 'playing'>, reason: LossReason = null) {
    status = result
    lossReason = result === 'lost' ? reason : null
    elapsed = startedAt ? Date.now() - startedAt : 0
    revealAllMines()

    if (status === 'lost') {
      markIncorrectFlags()
    }

    notify()
  }

  function markIncorrectFlags() {
    const { rows, cols } = getDifficulty()

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = board[row][col]

        if (!cell.revealed || cell.adjacent === 0) {
          continue
        }

        const adjacentPositions = getAdjacentPositions(row, col)
        const flaggedNeighbors = adjacentPositions.filter(([nextRow, nextCol]) => board[nextRow][nextCol].flagged).length

        if (flaggedNeighbors > cell.adjacent) {
          cell.incorrectFlagCount = true
        }
      }
    }
  }

  function revealCell(row: number, col: number) {
    if (status === 'won' || status === 'lost') {
      return
    }

    const cell = board[row][col]

    if (cell.revealed || cell.flagged) {
      return
    }

    // The first click carries no information, so it can never count as a guess.
    const isFirstReveal = firstReveal

    if (firstReveal) {
      plantMines(row, col)
      firstReveal = false
      startTimer()
    }

    if (cell.mine) {
      cell.revealed = true
      endGame('lost', 'mine')
      return
    }

    // Punish Guessing: revealing a cell that isn't provably safe from the visible board is a
    // guess — even though this particular cell happened to be safe.
    if (punishGuessing && !isFirstReveal && !isProvablySafe(row, col)) {
      cell.revealed = true
      endGame('lost', 'guess')
      return
    }

    revealFloodFill(row, col)
    checkWin()
    notify()
  }

  function isProvablySafe(row: number, col: number): boolean {
    const safeCells = computeSafeCells(board, getDifficulty().mines)
    return safeCells.has(row * getDifficulty().cols + col)
  }

  function clickCell(row: number, col: number) {
    setTarget(row, col)
    const currentTarget = targetedCell!

    const cell = board[currentTarget.row][currentTarget.col]

    if (cell.revealed && (chordingMode === 'dig' || chordingMode === 'both')) {
      chordCell(currentTarget.row, currentTarget.col)
    } else {
      revealCell(currentTarget.row, currentTarget.col)
    }

    // revealCell/chordCell can bail out without notifying (e.g. clicking an already
    // revealed cell), so always notify here to render the moved target highlight.
    notify()
  }

  function chordCell(row: number, col: number) {
    if (status === 'won' || status === 'lost') {
      return
    }

    const cell = board[row][col]

    if (!cell.revealed || cell.mine || cell.adjacent === 0) {
      return
    }

    const adjacentPositions = getAdjacentPositions(row, col)
    const flaggedNeighbors = adjacentPositions.filter(([nextRow, nextCol]) => board[nextRow][nextCol].flagged).length

    // Smart Chording (on) only fires when the flag count matches the number. With it off the
    // chord reveals every non-flagged neighbour regardless — convenient but reckless.
    if (smartChording && flaggedNeighbors !== cell.adjacent) {
      return
    }

    // For Punish Guessing, the chord's reveals are only justified if each uncovered neighbour
    // is provably safe from the board as it stands before the chord opens anything.
    const cols = getDifficulty().cols
    const safeCells = punishGuessing ? computeSafeCells(board, getDifficulty().mines) : null

    let changed = false

    for (const [nextRow, nextCol] of adjacentPositions) {
      const neighbor = board[nextRow][nextCol]

      if (neighbor.flagged || neighbor.revealed) {
        continue
      }

      if (neighbor.mine) {
        neighbor.revealed = true
        endGame('lost', 'mine')
        return
      }

      if (safeCells && !safeCells.has(nextRow * cols + nextCol)) {
        neighbor.revealed = true
        endGame('lost', 'guess')
        return
      }

      revealFloodFill(nextRow, nextCol)
      changed = true
    }

    if (changed) {
      checkWin()
      notify()
    }
  }

  function flagChord(row: number, col: number) {
    const cell = board[row][col]

    if (!cell.revealed || cell.mine || cell.adjacent === 0) {
      return
    }

    const adjacentPositions = getAdjacentPositions(row, col)
    const unrevealedNeighbors = adjacentPositions.filter(
      ([nextRow, nextCol]) => !board[nextRow][nextCol].revealed,
    )

    // Smart Chording (on) only flags when the unrevealed neighbour count matches the number.
    // With it off, flag every unflagged neighbour regardless of the count.
    if (smartChording && unrevealedNeighbors.length !== cell.adjacent) {
      return
    }

    for (const [nextRow, nextCol] of unrevealedNeighbors) {
      board[nextRow][nextCol].flagged = true
    }
  }

  function toggleFlag(row: number, col: number) {
    setTarget(row, col)

    if (status === 'won' || status === 'lost') {
      notify()
      return
    }

    const cell = board[row][col]

    if (cell.revealed) {
      if (chordingMode === 'flag' || chordingMode === 'both') {
        flagChord(row, col)
      }

      notify()
      return
    }

    cell.flagged = !cell.flagged
    notify()
  }

  function moveTarget(deltaRow: number, deltaCol: number) {
    const currentTarget = targetedCell ?? getCenteredTarget()
    setTarget(currentTarget.row + deltaRow, currentTarget.col + deltaCol)
    notify()
  }

  function moveTargetToFirstUnrevealedCell(deltaRow: number, deltaCol: number) {
    const currentTarget = targetedCell ?? getCenteredTarget()

    if (deltaRow === 0 && deltaCol === 0) {
      return
    }

    let row = currentTarget.row + deltaRow
    let col = currentTarget.col + deltaCol

    while (row >= 0 && row < board.length && col >= 0 && col < board[0].length) {
      const cell = board[row][col]
      const lastCell = board[row - deltaRow][col - deltaCol]

      if (cell.revealed !== lastCell.revealed) {
        // always stay on unrevealed cells
        if (cell.revealed) {
          if (row - deltaRow !== currentTarget.row || col - deltaCol !== currentTarget.col) {
            row -= deltaRow
            col -= deltaCol
            break
          }
        } else {
          break
        }
      }

      row += deltaRow
      col += deltaCol
    }

    setTarget(row, col)
    notify()
    // if (lastCell) {
    //   setTarget(lastCell.row, lastCell.col)
    //   notify()
    // } else {
    //   // If no unrevealed cell was found in the sequence,
    //   // we still move the target to the border to ensure movement
    //   const borderRow = Math.min(Math.max(currentTarget.row + (board.length - 1) * deltaRow, 0), board.length - 1)
    //   const borderCol = Math.min(Math.max(currentTarget.col + (board[0].length - 1) * deltaCol, 0), board[0].length - 1)
    //   setTarget(borderRow, borderCol)
    //   notify()
  }

  function isNumberCell(cell: Cell): boolean {
    return cell.revealed && !cell.mine && cell.adjacent > 0
  }

  function moveTargetToNextNumberCell(deltaRow: number, deltaCol: number) {
    const currentTarget = targetedCell ?? getCenteredTarget()

    if (deltaRow === 0 && deltaCol === 0) {
      return
    }

    let row = currentTarget.row + deltaRow
    let col = currentTarget.col + deltaCol

    while (row >= 0 && row < board.length && col >= 0 && col < board[0].length) {
      const cell = board[row][col]
      const lastCell = board[row - deltaRow][col - deltaCol]

      if (isNumberCell(cell) !== isNumberCell(lastCell)) {
        // always stay on number cells
        if (!isNumberCell(cell)) {
          if (row - deltaRow !== currentTarget.row || col - deltaCol !== currentTarget.col) {
            row -= deltaRow
            col -= deltaCol
            break
          }
        } else {
          break
        }
      }

      row += deltaRow
      col += deltaCol
    }

    setTarget(row, col)
    notify()
  }

  function remainingMines() {
    const mines = getDifficulty().mines
    const flagged = board.flat().filter((cell) => cell.flagged).length

    return mines - flagged
  }

  function getElapsedMs(): number {
    if (status === 'playing' && !timerPaused) {
      return Date.now() - startedAt
    }

    return elapsed
  }

  // Freeze the stopwatch while the tab is unfocused/hidden so background time isn't counted.
  function pauseTimer() {
    if (status === 'playing' && !timerPaused) {
      elapsed = Date.now() - startedAt
      timerPaused = true
    }
  }

  // Resume from the frozen time, ignoring however long the tab was away.
  function resumeTimer() {
    if (status === 'playing' && timerPaused) {
      startedAt = Date.now() - elapsed
      timerPaused = false
    }
  }

  function reset() {
    const { rows, cols } = getDifficulty()
    board = createBoard(rows, cols)
    status = 'ready'
    lossReason = null
    startedAt = 0
    elapsed = 0
    timerPaused = false
    firstReveal = true
    targetedCell = {
      row: Math.floor(rows / 2),
      col: Math.floor(cols / 2),
    }
    notify()
  }

  function setDifficulty(name: DifficultyName) {
    difficulty = name
    reset()
  }

  function setChordingMode(mode: ChordingMode) {
    chordingMode = mode
    notify()
  }

  function setJumpMode(mode: JumpMode) {
    jumpMode = mode
    notify()
  }

  function setSmartChording(enabled: boolean) {
    smartChording = enabled
    notify()
  }

  function setPunishGuessing(enabled: boolean) {
    punishGuessing = enabled
    notify()
  }

  function getSnapshot(): GameSnapshot {
    const currentDifficulty = getDifficulty()

    return {
      difficulty,
      difficultyLabel: currentDifficulty.label,
      rows: currentDifficulty.rows,
      cols: currentDifficulty.cols,
      mines: currentDifficulty.mines,
      board,
      status,
      elapsed: getElapsedMs(),
      remainingMines: remainingMines(),
      targetedCell,
      chordingMode,
      jumpMode,
      smartChording,
      punishGuessing,
      lossReason,
      bestTimes,
    }
  }

  restore()

  // Pause the stopwatch whenever the tab loses focus or is hidden, and resume when it
  // comes back — so time spent away is never counted. Pausing also freezes the saved
  // elapsed time, keeping the persisted stopwatch accurate.
  const handleBlur = () => {
    pauseTimer()
    persist()
  }

  window.addEventListener('beforeunload', persist)
  window.addEventListener('blur', handleBlur)
  window.addEventListener('focus', resumeTimer)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleBlur()
    } else {
      resumeTimer()
    }
  })

  // If the page loads while already in the background, start paused.
  if (document.visibilityState === 'hidden' || !document.hasFocus()) {
    pauseTimer()
  }

  return {
    getSnapshot,
    getElapsedMs,
    clickCell,
    revealCell,
    chordCell,
    moveTarget,
    moveTargetToFirstUnrevealedCell,
    moveTargetToNextNumberCell,
    toggleFlag,
    reset,
    setDifficulty,
    setChordingMode,
    setJumpMode,
    setSmartChording,
    setPunishGuessing,
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}