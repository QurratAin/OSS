const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // Copy JSONEditor assets to a local directory
  const assetsDir = path.join(__dirname)
  
  // Ensure the assets directory exists
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true })
  }

  // Copy CSS file
  const cssSource = path.join(require.resolve('jsoneditor'), '../jsoneditor.min.css')
  const cssDest = path.join(assetsDir, 'jsoneditor.css')
  fs.copyFileSync(cssSource, cssDest)

  // Copy icons
  const iconsSource = path.join(require.resolve('jsoneditor'), '../img/jsoneditor-icons.svg')
  const iconsDest = path.join(assetsDir, 'img')
  
  if (!fs.existsSync(iconsDest)) {
    fs.mkdirSync(iconsDest, { recursive: true })
  }
  
  fs.copyFileSync(iconsSource, path.join(iconsDest, 'jsoneditor-icons.svg'))

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
}

// Fetch last two versions from Supabase
async function fetchVersions() {
  try {
    const { data, error } = await supabase
      .from('business_analysis')
      .select('analysis_data, created_at')
      .order('created_at', { ascending: false })
      .limit(2)

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching versions:', error.message)
    return { error: error.message }
  }
}

// Save data to Supabase
async function saveData(updatedData) {
  try {
    const { data, error } = await supabase
      .from('business_analysis')
      .insert({
        analysis_data: updatedData,
        analysis_period_start: new Date().toISOString(),
        analysis_period_end: new Date().toISOString()
      })
      .select()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error saving data:', error.message)
    return { error: error.message }
  }
}

// IPC Handlers
ipcMain.handle('get-versions', async () => {
  return await fetchVersions()
})

ipcMain.handle('save-data', async (_, updatedData) => {
  return await saveData(updatedData)
})

// App lifecycle events
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})