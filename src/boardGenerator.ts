// Solvable Minesweeper board generation.
//
// A board is "solvable" when, starting from the first click, every safe cell can be
// uncovered through pure logical deduction — never a guess. We generate random candidate
// layouts and accept the first one that a logic solver can fully clear.

export type MineGrid = boolean[][]

// Hard ceilings so generation can never hang the first click.
const maxAttempts = 2000
// Largest connected frontier component we will brute-force enumerate (2^n assignments).
const enumerationCellCap = 18

type Position = [number, number]

type Constraint = {
  cells: number[] // unknown neighbour cell indices (row * cols + col)
  mines: number // how many of those cells are mines
}

/**
 * Generate a mine layout (true = mine) that is solvable from the given safe cell without
 * guessing. The 3x3 area around the safe cell is always mine-free so the first click opens
 * a region. Falls back to the last random layout if no solvable board is found in time.
 */
export function generateSolvableBoard(
  rows: number,
  cols: number,
  mineCount: number,
  safeRow: number,
  safeCol: number,
): MineGrid {
  const safeZone = buildSafeZone(rows, cols, safeRow, safeCol)
  let lastGrid = createGrid(rows, cols, false)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const grid = randomMineGrid(rows, cols, mineCount, safeZone)
    lastGrid = grid

    if (isSolvable(grid, safeRow, safeCol, mineCount)) {
      return grid
    }
  }

  // Best effort: a valid (but possibly guess-requiring) board so the game still proceeds.
  return lastGrid
}

function createGrid<T>(rows: number, cols: number, fill: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill))
}

function buildSafeZone(rows: number, cols: number, safeRow: number, safeCol: number): Set<number> {
  const zone = new Set<number>()

  for (let row = safeRow - 1; row <= safeRow + 1; row += 1) {
    for (let col = safeCol - 1; col <= safeCol + 1; col += 1) {
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        zone.add(row * cols + col)
      }
    }
  }

  return zone
}

function randomMineGrid(rows: number, cols: number, mineCount: number, safeZone: Set<number>): MineGrid {
  const grid = createGrid(rows, cols, false)
  const candidates: number[] = []

  for (let index = 0; index < rows * cols; index += 1) {
    if (!safeZone.has(index)) {
      candidates.push(index)
    }
  }

  // Fisher-Yates shuffle, then take the first mineCount positions.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const count = Math.min(mineCount, candidates.length)
  for (let k = 0; k < count; k += 1) {
    const index = candidates[k]
    grid[Math.floor(index / cols)][index % cols] = true
  }

  return grid
}

function computeAdjacency(grid: MineGrid): number[][] {
  const rows = grid.length
  const cols = grid[0].length
  const adjacency = createGrid(rows, cols, 0)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (grid[row][col]) {
        continue
      }

      let count = 0
      for (const [nextRow, nextCol] of neighbors(row, col, rows, cols)) {
        if (grid[nextRow][nextCol]) {
          count += 1
        }
      }

      adjacency[row][col] = count
    }
  }

  return adjacency
}

function neighbors(row: number, col: number, rows: number, cols: number): Position[] {
  const positions: Position[] = []

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

/**
 * Simulate a perfect logical player. Returns true if every non-mine cell can be revealed
 * without ever guessing. The solver only consults revealed numbers — when a deduction marks
 * a cell safe or mined, that conclusion is sound, so it never "cheats" by reading the layout.
 */
function isSolvable(grid: MineGrid, safeRow: number, safeCol: number, mineCount: number): boolean {
  const rows = grid.length
  const cols = grid[0].length
  const adjacency = computeAdjacency(grid)
  const revealed = createGrid(rows, cols, false)
  const knownMine = createGrid(rows, cols, false)

  floodReveal(safeRow, safeCol, grid, adjacency, revealed)

  let progress = true
  while (progress) {
    progress =
      applyTrivial(adjacency, revealed, knownMine, grid) ||
      applyGlobalCount(revealed, knownMine, grid, adjacency, mineCount) ||
      applyEnumeration(adjacency, revealed, knownMine, grid, cols)
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!grid[row][col] && !revealed[row][col]) {
        return false
      }
    }
  }

  return true
}

function floodReveal(
  startRow: number,
  startCol: number,
  grid: MineGrid,
  adjacency: number[][],
  revealed: boolean[][],
) {
  const rows = grid.length
  const cols = grid[0].length
  const stack: Position[] = [[startRow, startCol]]

  while (stack.length > 0) {
    const [row, col] = stack.pop()!

    if (revealed[row][col] || grid[row][col]) {
      continue
    }

    revealed[row][col] = true

    if (adjacency[row][col] === 0) {
      for (const next of neighbors(row, col, rows, cols)) {
        stack.push(next)
      }
    }
  }
}

// Single-constraint deductions: a number satisfied by its flags frees its other neighbours,
// and a number whose remaining mines equal its unknown neighbours mines all of them.
function applyTrivial(
  adjacency: number[][],
  revealed: boolean[][],
  knownMine: boolean[][],
  grid: MineGrid,
): boolean {
  const rows = grid.length
  const cols = grid[0].length
  let changed = false

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!revealed[row][col] || adjacency[row][col] === 0) {
        continue
      }

      const adjacent = neighbors(row, col, rows, cols)
      let flagged = 0
      const unknown: Position[] = []

      for (const [nextRow, nextCol] of adjacent) {
        if (knownMine[nextRow][nextCol]) {
          flagged += 1
        } else if (!revealed[nextRow][nextCol]) {
          unknown.push([nextRow, nextCol])
        }
      }

      if (unknown.length === 0) {
        continue
      }

      const remainingMines = adjacency[row][col] - flagged

      if (remainingMines === 0) {
        for (const [nextRow, nextCol] of unknown) {
          floodReveal(nextRow, nextCol, grid, adjacency, revealed)
        }
        changed = true
      } else if (remainingMines === unknown.length) {
        for (const [nextRow, nextCol] of unknown) {
          knownMine[nextRow][nextCol] = true
        }
        changed = true
      }
    }
  }

  return changed
}

// Whole-board counting: once every mine is found the rest is safe, and once the unknowns
// exactly fill the remaining mine budget they are all mines.
function applyGlobalCount(
  revealed: boolean[][],
  knownMine: boolean[][],
  grid: MineGrid,
  adjacency: number[][],
  mineCount: number,
): boolean {
  const rows = grid.length
  const cols = grid[0].length
  let flagged = 0
  const unknown: Position[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (knownMine[row][col]) {
        flagged += 1
      } else if (!revealed[row][col]) {
        unknown.push([row, col])
      }
    }
  }

  if (unknown.length === 0) {
    return false
  }

  if (flagged === mineCount) {
    for (const [row, col] of unknown) {
      floodReveal(row, col, grid, adjacency, revealed)
    }
    return true
  }

  if (flagged + unknown.length === mineCount) {
    for (const [row, col] of unknown) {
      knownMine[row][col] = true
    }
    return true
  }

  return false
}

// Constraint enumeration: break the frontier into independent components and brute-force the
// mine assignments of each. A cell that is a mine in every valid assignment is a definite
// mine; one that is never a mine is definitely safe. This resolves patterns (1-2-1, etc.)
// that single-constraint logic cannot.
function applyEnumeration(
  adjacency: number[][],
  revealed: boolean[][],
  knownMine: boolean[][],
  grid: MineGrid,
  cols: number,
): boolean {
  const rows = grid.length
  const constraints: Constraint[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!revealed[row][col] || adjacency[row][col] === 0) {
        continue
      }

      let flagged = 0
      const unknown: number[] = []

      for (const [nextRow, nextCol] of neighbors(row, col, rows, cols)) {
        if (knownMine[nextRow][nextCol]) {
          flagged += 1
        } else if (!revealed[nextRow][nextCol]) {
          unknown.push(nextRow * cols + nextCol)
        }
      }

      if (unknown.length > 0) {
        constraints.push({ cells: unknown, mines: adjacency[row][col] - flagged })
      }
    }
  }

  if (constraints.length === 0) {
    return false
  }

  const components = groupConstraints(constraints)
  let changed = false

  for (const component of components) {
    if (component.cells.length > enumerationCellCap) {
      continue
    }

    const verdict = enumerateComponent(component.cells, component.constraints)
    if (!verdict) {
      continue
    }

    for (const cell of verdict.safe) {
      floodReveal(Math.floor(cell / cols), cell % cols, grid, adjacency, revealed)
      changed = true
    }

    for (const cell of verdict.mines) {
      knownMine[Math.floor(cell / cols)][cell % cols] = true
      changed = true
    }
  }

  return changed
}

// Group constraints that share unknown cells into independent components via union-find.
function groupConstraints(constraints: Constraint[]): { cells: number[]; constraints: Constraint[] }[] {
  const parent = new Map<number, number>()

  const find = (x: number): number => {
    let root = x
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    let current = x
    while (parent.get(current) !== root) {
      const next = parent.get(current)!
      parent.set(current, root)
      current = next
    }
    return root
  }

  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent.set(rootA, rootB)
    }
  }

  for (const constraint of constraints) {
    for (const cell of constraint.cells) {
      if (!parent.has(cell)) {
        parent.set(cell, cell)
      }
    }
    for (let i = 1; i < constraint.cells.length; i += 1) {
      union(constraint.cells[0], constraint.cells[i])
    }
  }

  const cellGroups = new Map<number, number[]>()
  for (const cell of parent.keys()) {
    const root = find(cell)
    const group = cellGroups.get(root) ?? []
    group.push(cell)
    cellGroups.set(root, group)
  }

  const constraintGroups = new Map<number, Constraint[]>()
  for (const constraint of constraints) {
    const root = find(constraint.cells[0])
    const group = constraintGroups.get(root) ?? []
    group.push(constraint)
    constraintGroups.set(root, group)
  }

  return [...cellGroups.entries()].map(([root, cells]) => ({
    cells,
    constraints: constraintGroups.get(root) ?? [],
  }))
}

// Brute-force every mine/no-mine assignment of the component's cells against its constraints.
function enumerateComponent(
  cells: number[],
  constraints: Constraint[],
): { safe: number[]; mines: number[] } | null {
  const size = cells.length
  const bitOf = new Map<number, number>()
  cells.forEach((cell, index) => bitOf.set(cell, index))

  const masks = constraints.map((constraint) => ({
    bits: constraint.cells.map((cell) => bitOf.get(cell)!),
    mines: constraint.mines,
  }))

  let solutions = 0
  const mineHits = new Array<number>(size).fill(0)
  const total = 1 << size

  for (let assignment = 0; assignment < total; assignment += 1) {
    let valid = true

    for (const mask of masks) {
      let sum = 0
      for (const bit of mask.bits) {
        if (assignment & (1 << bit)) {
          sum += 1
        }
      }
      if (sum !== mask.mines) {
        valid = false
        break
      }
    }

    if (!valid) {
      continue
    }

    solutions += 1
    for (let i = 0; i < size; i += 1) {
      if (assignment & (1 << i)) {
        mineHits[i] += 1
      }
    }
  }

  if (solutions === 0) {
    return null
  }

  const safe: number[] = []
  const mines: number[] = []

  for (let i = 0; i < size; i += 1) {
    if (mineHits[i] === 0) {
      safe.push(cells[i])
    } else if (mineHits[i] === solutions) {
      mines.push(cells[i])
    }
  }

  return { safe, mines }
}
