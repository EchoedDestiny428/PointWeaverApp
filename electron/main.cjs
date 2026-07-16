const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // IPC for reading paths
  ipcMain.handle('read-paths', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return { error: 'Directory not found' };
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
      const paths = files.map(f => {
        const content = fs.readFileSync(path.join(dirPath, f), 'utf-8');
        return { name: f.replace('.json', ''), content: JSON.parse(content) };
      });
      return { paths };
    } catch (e) {
      return { error: e.message };
    }
  });

  // IPC for writing path
  ipcMain.handle('write-path', async (event, dirPath, name, data) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const fullPath = path.join(dirPath, `${name}.json`);
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // IPC for renaming path
  ipcMain.handle('rename-path', async (event, dirPath, oldName, newName) => {
    try {
      const oldPath = path.join(dirPath, `${oldName}.json`);
      const newPath = path.join(dirPath, `${newName}.json`);
      if (fs.existsSync(newPath)) {
        return { error: 'A path with that name already exists.' };
      }
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // IPC for deleting path
  ipcMain.handle('delete-path', async (event, dirPath, name) => {
    try {
      const fullPath = path.join(dirPath, `${name}.json`);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Open directory dialog
  ipcMain.handle('select-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // Open image dialog
  ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      // Return file path, which we can load in renderer using a file:// protocol if webSecurity is disabled,
      // or we can read it and return a base64 string. Returning base64 string is safer.
      const filePath = result.filePaths[0];
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      const buffer = fs.readFileSync(filePath);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
    return null;
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
