import './style.css'

import { mountChangeNotes } from './changeNotes'
import { createGame } from './game'
import { mountGame } from './ui'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('App root not found')
}

mountGame(root, createGame())
mountChangeNotes()

