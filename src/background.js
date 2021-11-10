import path from 'path'
import {
  app,
  protocol,
  BrowserWindow,
  ipcMain,
} from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
import LicenseCheck from './services/LicenseCheck'
import Updater from './services/Updater'
import MenuBuilder from './services/MenuBuilder'
import MenuBar from './services/MenuBar'
import AutoStart from './services/AutoStart'
import Store from './services/Store'
import Setapp from './services/Setapp'

Setapp.init()

const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = !isProduction

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true } }])

AutoStart.update()

function createWindow() {

  MenuBuilder.setMenu()

  const { wasOpenedAsHidden } = app.getLoginItemSettings()

  // Create the browser window.
  win = new BrowserWindow({
    show: !wasOpenedAsHidden,
    width: 600,
    height: 480,
    resizable: false,
    fullscreen: false,
    titleBarStyle: 'hiddenInset',
    transparent: true,
    backgroundColor: '#000',
    webPreferences: {
      nodeIntegration: true,
    },
    icon: path.resolve(__dirname, 'build/icon.icns'),
  })

  LicenseCheck.setWindow(win)

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }

  if (isProduction && !Setapp.isActive) {
    Updater.silentlyCheckForUpdates()
  }

  win.on('closed', () => {
    win = null
  })

  MenuBar.setMainWindow(win)
}

if (!Store.get('showDockIcon', true)) {
  app.dock.hide()
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    // https://github.com/MarshallOfSound/electron-devtools-installer
    installExtension(VUEJS_DEVTOOLS)
      .then(name => console.log(`Added Extension:  ${name}`))
      .catch(err => console.log('An error occurred: ', err))
  }

  createWindow()

  MenuBar.create()

  ipcMain.on('showMainWindow', () => {
    if (win === null) {
      createWindow()
    } else {
      win.show()
    }

    MenuBar.hide()
  })
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', data => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
