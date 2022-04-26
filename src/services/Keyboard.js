import collect from 'collect.js'
import keymap from 'native-keymap'

import { findDuplicatesInArray, getArrayDepth, isSameArray } from '@/helpers'
import Emitter from '@/services/Emitter'
import Store from '@/services/Store'

const isISOKeyboard = keymap.isISOKeyboard()
const basicKeyMap = keymap.getKeyMap()

// swap Backquote and IntlBackslash
// see: https://github.com/microsoft/vscode/issues/24153
if (isISOKeyboard) {
  const { Backquote, IntlBackslash } = basicKeyMap

  basicKeyMap.IntlBackslash = Backquote
  basicKeyMap.Backquote = IntlBackslash
}

// eslint-disable-next-line
console.table(basicKeyMap)

export default class Keyboard {

  static specialKeyNames = [
    'Shift',
    'Control',
    'Alt',
    'Meta',
  ]

  static blockedKeys = [
    'NumpadDivide',
    'NumpadMultiply',
    'NumpadSubtract',
    'NumpadAdd',
    'NumpadDecimal',
    'NumpadEqual',
  ]

  static blockedShortcuts = [
    ['Meta', 'Tab'], // switch app
    ['Meta', 'Shift', '4'], // screenshot
    ['Meta', 'Shift', '5'], // screenshot
    ['Meta', 'Shift', '6'], // screenshot
    ['Alt', 'Meta', 'Escape'], // force quit
    ['F11'], // show desktop
    ['Meta', 'Space'], // spotlight
    ['Control', 'ArrowUp'], // window navigation
    ['Control', 'ArrowDown'], // window navigation
    ['Control', 'ArrowLeft'], // window navigation
    ['Control', 'ArrowRight'], // window navigation
    ['Control', 'Meta', 'd'], // dictionary
    ['Alt', 'Meta', 'd'], // toggle dock
    Store.get('shortcut', []), // mouseless shortcut
  ]

  static keymap = Object
    .entries(basicKeyMap)
    .map(([code, data]) => ({
      code,
      ...data,
    }))
    // maybe this will break something
    .filter(key => !this.blockedKeys.includes(key.code))

  constructor() {
    this.emitter = new Emitter()
    this.specialKeys = []
    this.regularKeys = []
    this.keydownHandler = this.handleKeydown.bind(this)
    this.keyupHandler = this.handleKeyup.bind(this)
    window.addEventListener('keydown', this.keydownHandler)
    window.addEventListener('keyup', this.keyupHandler)
  }

  on(...args) {
    this.emitter.on(...args)
  }

  off(...args) {
    this.emitter.off(...args)
  }

  setSpecialKeys(event) {
    const keys = []

    if (event.shiftKey) {
      keys.push('Shift')
    }

    if (event.ctrlKey) {
      keys.push('Control')
    }

    if (event.altKey) {
      keys.push('Alt')
    }

    if (event.metaKey) {
      keys.push('Meta')
    }

    this.specialKeys = keys
  }

  get keys() {
    return [...this.specialKeys, ...this.regularKeys]
  }

  get resolvedKeys() {
    return collect(this.constructor.resolveCodesFromKeys(this.keys))
      .unique()
      .toArray()
  }

  getKeyValue(event) {
    const key = this.constructor.keymap.find(item => item.code === event.code)

    if (!key) {
      return event.code
    }

    let { value } = key

    if (this.specialKeys.length === 1 && this.specialKeys.includes('Shift')) {
      value = key.withShift
    }

    if (this.specialKeys.length === 1 && this.specialKeys.includes('Alt')) {
      value = key.withAltGr
    }

    if (this.specialKeys.includes('Shift') && this.specialKeys.includes('Alt')) {
      value = key.withShiftAltGr
    }

    if (value === ' ' || value === ' ') {
      return 'Space'
    }

    if (value === '') {
      return key.code
    }

    return value
  }

  static resolveCodesFromKeys(data = []) {
    const groups = getArrayDepth(data) > 1 ? data : [data]
    const resolvedGroups = groups.map(keys => {
      const resolvedKeys = keys.map(key => {
        let match = null

        match = this.keymap.find(item => item.value === key)

        if (match) {
          return match.value
        }

        match = this.keymap.find(item => item.withShift === key)

        if (match) {
          return ['Shift', match.value]
        }

        match = this.keymap.find(item => item.withAltGr === key)

        if (match) {
          return ['Alt', match.value]
        }

        match = this.keymap.find(item => item.withShiftAltGr === key)

        if (match) {
          return ['Shift', 'Alt', match.value]
        }

        return key
      })

      // https://developer.apple.com/design/human-interface-guidelines/macos/user-interaction/keyboard/#keyboard-shortcuts
      const sortOrder = ['Control', 'Alt', 'Shift', 'Meta']

      return collect(resolvedKeys)
        .flatten()
        .filter()
        .sort((a, b) => {
          const indexA = sortOrder.indexOf(a)
          const indexB = sortOrder.indexOf(b)
          const hugeNumber = 1000 // TODO: ugly

          return (indexA >= 0 ? indexA : hugeNumber)
            - (indexB >= 0 ? indexB : hugeNumber)
        })
        .toArray()
    })

    return collect(resolvedGroups)
      .sortBy(keys => keys.length)
      .first()
  }

  static isPossible(keys = []) {
    // duplicated keys
    if (findDuplicatesInArray(keys).length) {
      return false
    }

    // only modifier keys
    if (keys.every(key => this.specialKeyNames.includes(key))) {
      return false
    }

    // blocked system shortcuts
    if (this.blockedShortcuts.some(blockedShortcut => isSameArray(blockedShortcut, keys))) {
      return false
    }

    return true
  }

  handleKeydown(event) {
    this.setSpecialKeys(event)
    const value = this.getKeyValue(event)

    if (this.isPressed(value)) {
      return
    }

    this.emitter.emit('update', event)

    if (this.constructor.specialKeyNames.includes(event.key)) {
      return
    }

    this.regularKeys.push(value)
    this.emitter.emit('shortcut', event)
    this.regularKeys = []
    this.specialKeys = []
  }

  handleKeyup(event) {
    this.setSpecialKeys(event)
    this.emitter.emit('update', event)
  }

  is(keys = []) {
    const checkedKeys = keys.map(key => key.toLowerCase())
    const pressedKeys = this.resolvedKeys.map(key => key.toLowerCase())
    return isSameArray(checkedKeys, pressedKeys)
  }

  isPressed(name = null) {
    return !!this.regularKeys.find(key => key.toLowerCase() === name.toLowerCase())
  }

  destroy() {
    this.emitter.destroy()
    window.removeEventListener('keydown', this.keydownHandler)
    window.removeEventListener('keyup', this.keyupHandler)
  }

}
