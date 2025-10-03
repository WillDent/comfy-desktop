const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;
let pythonBuffer = '';
let nextRequestId = 1;
const pendingRequests = new Map();

function createPythonProcess() {
  const pythonExecutable = process.env.PYTHON || 'python';
  const scriptPath = path.join(__dirname, 'python', 'backend.py');

  pythonProcess = spawn(pythonExecutable, [scriptPath], {
    cwd: path.join(__dirname, 'python'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (chunk) => {
    pythonBuffer += chunk.toString();

    let newlineIndex;
    while ((newlineIndex = pythonBuffer.indexOf('\n')) >= 0) {
      const line = pythonBuffer.slice(0, newlineIndex);
      pythonBuffer = pythonBuffer.slice(newlineIndex + 1);

      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        const { id, result, error } = message;
        const callbacks = pendingRequests.get(id);

        if (!callbacks) return;

        pendingRequests.delete(id);
        if (error) {
          callbacks.reject(new Error(error));
        } else {
          callbacks.resolve(result);
        }
      } catch (err) {
        console.error('Failed to parse Python message:', err, line);
      }
    }
  });

  pythonProcess.stderr.on('data', (chunk) => {
    console.error('Python stderr:', chunk.toString());
  });

  pythonProcess.on('exit', (code, signal) => {
    const message = `Python process exited (code=${code}, signal=${signal})`;
    console.error(message);

    for (const [, resolver] of pendingRequests) {
      resolver.reject(new Error(message));
    }
    pendingRequests.clear();

    if (mainWindow) {
      dialog.showErrorBox('Python backend exited', message);
    }
  });
}

function invokePython(payload) {
  return new Promise((resolve, reject) => {
    if (!pythonProcess || pythonProcess.killed) {
      reject(new Error('Python backend is not running.'));
      return;
    }

    const id = nextRequestId++;
    const message = JSON.stringify({ id, payload });

    pendingRequests.set(id, { resolve, reject });
    pythonProcess.stdin.write(`${message}\n`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createPythonProcess();
  createWindow();

  ipcMain.handle('python:invoke', async (_event, payload) => {
    return invokePython(payload);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
});
