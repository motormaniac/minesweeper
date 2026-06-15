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
  chordingEnabled: boolean
}

export type GameController = {
  getSnapshot: () => GameSnapshot
  clickCell: (row: number, col: number) => void
  revealCell: (row: number, col: number) => void
  chordCell: (row: number, col: number) => void
  moveTarget: (deltaRow: number, deltaCol: number) => void
  moveTargetToFirstUnrevealedCell: (deltaRow: number, deltaCol: number) => void
  toggleFlag: (row: number, col: number) => void
  reset: () => void
  setDifficulty: (name: DifficultyName) => void
  setChordingEnabled: (enabled: boolean) => void
  subscribe: (listener: () => void) => () => void
}

export const difficulties: Record<DifficultyName, Difficulty> = {
  beginner: { label: 'Beginner', rows: 8, cols: 8, mines: 8 },
  intermediate: { label: 'Intermediate', rows: 10, cols: 10, mines: 16 },
  expert: { label: 'Expert', rows: 12, cols: 12, mines: 24 },
}

export function createGame(): GameController {
  let difficulty: DifficultyName = 'beginner'
  let board: Cell[][] = []
  let status: GameStatus = 'ready'
  let startedAt = 0
  let elapsed = 0
  let firstReveal = true
  let targetedCell: { row: number; col: number } | null = null
  let chordingEnabled = true

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
  }

  function plantMines(safeRow: number, safeCol: number) {
    const { rows, cols, mines } = getDifficulty()
    const safeZone = new Set<number>()

    for (let row = safeRow - 1; row <= safeRow + 1; row += 1) {
      for (let col = safeCol - 1; col <= safeCol + 1; col += 1) {
        if (row >= 0 && row < rows && col >= 0 && col < cols) {
          safeZone.add(row * cols + col)
        }
      }
    }

    const allPositions: number[] = []
    for (let index = 0; index < rows * cols; index += 1) {
      if (!safeZone.has(index)) {
        allPositions.push(index)
      }
    }

    const placed = new Set<number>()
    const minDistance = getMinMineDistance()
    const clusterChance = getClusterChance()

    let attempts = 0
    const maxAttempts = 1000

    while (placed.size < mines && attempts < maxAttempts) {
      const candidate = allPositions[Math.floor(Math.random() * allPositions.length)]

      if (placed.has(candidate)) {
        attempts += 1
        continue
      }

      if (minDistance > 0 && Math.random() > clusterChance) {
        let tooClose = false
        const row = Math.floor(candidate / cols)
        const col = candidate % cols

        for (const existing of placed) {
          const existingRow = Math.floor(existing / cols)
          const existingCol = existing % cols
          const distance = Math.abs(row - existingRow) + Math.abs(col - existingCol)

          if (distance < minDistance) {
            tooClose = true
            break
          }
        }

        if (tooClose) {
          attempts += 1
          continue
        }
      }

      placed.add(candidate)
    }

    for (const position of placed) {
      const row = Math.floor(position / cols)
      const col = position % cols
      board[row][col].mine = true
    }

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (board[row][col].mine) {
          continue
        }

        let count = 0
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
            if (rowOffset === 0 && colOffset === 0) {
              continue
            }

            const nextRow = row + rowOffset
            const nextCol = col + colOffset

            if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
              count += board[nextRow][nextCol].mine ? 1 : 0
            }
          }
        }

        board[row][col].adjacent = count
      }
    }
  }

  function getMinMineDistance(): number {
    if (difficulty === 'beginner') return 4
    if (difficulty === 'intermediate') return 2
    return 0
  }

  function getClusterChance(): number {
    if (difficulty === 'beginner') return 0.1
    if (difficulty === 'intermediate') return 0.4
    return 0.8
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
      revealAllMines()
    }
  }

  function startTimer() {
    if (status === 'ready') {
      status = 'playing'
      startedAt = Date.now()
    }
  }

  function endGame(result: Exclude<GameStatus, 'ready' | 'playing'>) {
    status = result
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

    if (firstReveal) {
      plantMines(row, col)
      firstReveal = false
      startTimer()
    }

    if (cell.mine) {
      cell.revealed = true
      endGame('lost')
      return
    }

    revealFloodFill(row, col)
    checkWin()
    notify()
  }

  function clickCell(row: number, col: number) {
    setTarget(row, col)
    const currentTarget = targetedCell!

    const cell = board[currentTarget.row][currentTarget.col]

    if (cell.revealed && chordingEnabled) {
      chordCell(currentTarget.row, currentTarget.col)
      return
    }

    revealCell(currentTarget.row, currentTarget.col)
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

    if (flaggedNeighbors !== cell.adjacent) {
      return
    }

    let changed = false

    for (const [nextRow, nextCol] of adjacentPositions) {
      const neighbor = board[nextRow][nextCol]

      if (neighbor.flagged || neighbor.revealed) {
        continue
      }

      if (neighbor.mine) {
        neighbor.revealed = true
        endGame('lost')
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

  function toggleFlag(row: number, col: number) {
    setTarget(row, col)

    if (status === 'won' || status === 'lost') {
      notify()
      return
    }

    const cell = board[row][col]

    if (cell.revealed) {
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

  function remainingMines() {
    const mines = getDifficulty().mines
    const flagged = board.flat().filter((cell) => cell.flagged).length

    return mines - flagged
  }

  function tickTimer() {
    if (status === 'playing') {
      const nextElapsed = Math.floor((Date.now() - startedAt) / 1000)

      if (nextElapsed !== elapsed) {
        elapsed = nextElapsed
        notify()
      }
    }

    window.setTimeout(tickTimer, 250)
  }

  function reset() {
    const { rows, cols } = getDifficulty()
    board = createBoard(rows, cols)
    status = 'ready'
    startedAt = 0
    elapsed = 0
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

  function setChordingEnabled(enabled: boolean) {
    chordingEnabled = enabled
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
      elapsed,
      remainingMines: remainingMines(),
      targetedCell,
      chordingEnabled,
    }
  }

  reset()
  tickTimer()

  return {
    getSnapshot,
    clickCell,
    revealCell,
    chordCell,
    moveTarget,
    moveTargetToFirstUnrevealedCell,
    toggleFlag,
    reset,
    setDifficulty,
    setChordingEnabled,
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}