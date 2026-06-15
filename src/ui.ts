import type { Cell, DifficultyName, GameController, GameSnapshot, GameStatus } from './game'
import { difficulties } from './game'

function statusText(status: GameStatus): string {
  if (status === 'won') {
    return 'Victory'
  }

  if (status === 'lost') {
    return 'Lost'
  }

  if (status === 'playing') {
    return 'Running'
  }

  return 'Ready'
}

function statusLabel(status: GameStatus): string {
  if (status === 'won') {
    return 'You cleared the field.'
  }

  if (status === 'lost') {
    return 'Boom. Try again.'
  }

  return 'Click a tile to start.'
}

function cellLabel(cell: Cell): string {
  if (cell.flagged) {
    return '🚩'
  }

  if (!cell.revealed) {
    return ''
  }

  if (cell.mine) {
    return '✹'
  }

  return cell.adjacent > 0 ? String(cell.adjacent) : ''
}

function cellClass(cell: Cell, targeted: boolean): string {
  return [
    'cell',
    cell.revealed ? 'cell--revealed' : '',
    cell.mine && cell.revealed ? 'cell--mine' : '',
    cell.flagged ? 'cell--flagged' : '',
    cell.revealed && !cell.mine && cell.adjacent > 0 ? `cell--${cell.adjacent}` : '',
    cell.incorrectFlagCount ? 'cell--incorrect' : '',
    targeted ? 'cell--targeted' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function renderDifficultyButtons(currentDifficulty: DifficultyName) {
  const buttons = Object.entries(difficulties)
    .map(
      ([key, value]) => `
        <button class="difficulty ${key === currentDifficulty ? 'difficulty--active' : ''}" data-difficulty="${key}" type="button">${value.label}</button>
      `,
    )
    .join('')

  return `<div class="difficulty-bar">${buttons}</div>`
}

function renderBoard(board: Cell[][], targetedCell: GameSnapshot['targetedCell']) {
  return board
    .map(
      (row, rowIndex) => `
        <div class="row">
          ${row
            .map(
              (cell, colIndex) => `
                <button
                  class="${cellClass(cell, targetedCell?.row === rowIndex && targetedCell?.col === colIndex)}"
                  type="button"
                  data-row="${rowIndex}"
                  data-col="${colIndex}"
                  aria-label="${cell.revealed ? (cell.mine ? 'Mine' : `${cell.adjacent} adjacent mines`) : 'Hidden tile'}"
                >
                  ${cellLabel(cell)}
                </button>
              `,
            )
            .join('')}
        </div>
      `,
    )
    .join('')
}

function renderApp(snapshot: GameSnapshot) {
  return `
    <main class="game-shell">
      <section class="board-column panel">
        <div class="board" style="--cols: ${snapshot.cols}">
          ${renderBoard(snapshot.board, snapshot.targetedCell)}
        </div>

        <p id="message" class="message">${statusLabel(snapshot.status)}</p>
      </section>

      <aside class="settings-column panel">
        <div class="eyebrow">Minesweeper</div>
        <h1>Clear the grid.</h1>
        <p class="settings-copy">Pick a difficulty, then sweep the board clean without stepping on a mine.</p>

        <div class="hud" aria-label="Game status">
          <div class="hud-card">
            <span class="hud-label">Mines</span>
            <strong id="mines-left">${snapshot.remainingMines}</strong>
          </div>
          <div class="hud-card hud-card--primary">
            <span class="hud-label">Status</span>
            <strong id="status-text">${statusText(snapshot.status)}</strong>
          </div>
          <div class="hud-card">
            <span class="hud-label">Time</span>
            <strong id="timer">${snapshot.elapsed}</strong>
          </div>
        </div>

        <div class="settings-block">
          <div class="settings-meta">
            <h2>${snapshot.difficultyLabel}</h2>
            <p>${snapshot.rows} x ${snapshot.cols} grid with ${snapshot.mines} mines</p>
          </div>

          <button id="reset" class="reset-button" type="button">New game</button>

          ${renderDifficultyButtons(snapshot.difficulty)}

          <div class="settings-option">
            <label class="switch">
              <input 
                type="checkbox" 
                id="chording-enabled" 
                ${snapshot.chordingEnabled ? 'checked' : ''}
              >
              <span class="slider"></span>
            </label>
            <span class="option-label">Chording</span>
          </div>
        </div>
      </aside>
    </main>
  `
}

export function mountGame(root: HTMLElement, game: GameController) {
  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    const snapshot = game.getSnapshot()
    const targetedCell = snapshot.targetedCell
    const move = event.shiftKey ? game.moveTargetToFirstUnrevealedCell : game.moveTarget

    switch (event.key.toLowerCase()) {
      case 'w':
        event.preventDefault()
        move(-1, 0)
        break
      case 'a':
        event.preventDefault()
        move(0, -1)
        break
      case 's':
        event.preventDefault()
        move(1, 0)
        break
      case 'd':
        event.preventDefault()
        move(0, 1)
        break
      case 'j':
        if (!targetedCell) {
          return
        }

        event.preventDefault()
        game.clickCell(targetedCell.row, targetedCell.col)
        break
      case 'k':
        if (!targetedCell) {
          return
        }

        event.preventDefault()
        game.toggleFlag(targetedCell.row, targetedCell.col)
        break
      case ' ':
      case 'spacebar':
        event.preventDefault()
        game.reset()
        break
      default:
        break
    }
  }

  const render = () => {
    const snapshot = game.getSnapshot()
    root.innerHTML = renderApp(snapshot)

    const boardElement = root.querySelector<HTMLDivElement>('.board')
    const resetButton = root.querySelector<HTMLButtonElement>('#reset')
    const chordingCheckbox = root.querySelector<HTMLInputElement>('#chording-enabled')
    const difficultyButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.difficulty'))

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        game.reset()
      })
    }

    if (chordingCheckbox) {
      chordingCheckbox.addEventListener('change', () => {
        game.setChordingEnabled(chordingCheckbox.checked)
      })
    }

    for (const button of difficultyButtons) {
      button.addEventListener('click', () => {
        const selected = button.dataset.difficulty as DifficultyName | undefined

        if (!selected || selected === snapshot.difficulty) {
          return
        }

        game.setDifficulty(selected)
      })
    }

    boardElement?.querySelectorAll<HTMLButtonElement>('.cell').forEach((button) => {
      button.addEventListener('click', () => {
        const row = Number(button.dataset.row)
        const col = Number(button.dataset.col)

        game.clickCell(row, col)
      })

      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        const row = Number(button.dataset.row)
        const col = Number(button.dataset.col)
        game.toggleFlag(row, col)
      })
    })
  }

  root.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('keydown', handleKeyDown)
  render()

  const unsubscribe = game.subscribe(render)

  return () => {
    root.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('keydown', handleKeyDown)
    unsubscribe()
  }
}