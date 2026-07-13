const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");

const ROOT = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const LOG_PATH = path.join(process.env.TEMP || ROOT, "shortdrama-ai-desktop.log");
const HOST = "127.0.0.1";
const ICON_PATH = path.join(__dirname, "assets", "icon.ico");
const RELEASE_ROOT = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);

let serverProcess = null;
let mainWindow = null;
let currentPort = null;

function log(message) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch (_) {
    // ignore
  }
}

log("main loaded");

function existingFile(filePath) {
  try {
    return filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function resolvePythonExecutable() {
  const candidates = [
    process.env.SHORTDRAMA_PYTHON_EXE,
    path.join(RELEASE_ROOT, "python", "python.exe"),
    path.join(ROOT, "python", "python.exe"),
    path.join(path.dirname(process.execPath), "python", "python.exe"),
    path.join(process.resourcesPath || ROOT, "python", "python.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existingFile(candidate)) return candidate;
  }
  return "python";
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

process.on("uncaughtException", (error) => log(`uncaughtException: ${error.stack || error.message || error}`));
process.on("unhandledRejection", (error) => log(`unhandledRejection: ${error?.stack || error?.message || error}`));

app.on("ready", () => log("ready event"));
app.on("before-quit", () => log("before-quit"));
app.on("will-quit", () => log("will-quit"));
app.on("quit", (_event, exitCode) => log(`quit ${exitCode}`));
async function startServer() {
  const pythonExe = resolvePythonExecutable();
  currentPort = await findOpenPort();
  log(`start server: ${pythonExe}`);
  log(`runtime root: ${RELEASE_ROOT}`);
  log(`server root: ${ROOT}`);
  log(`server port: ${currentPort}`);
  const userData = app.getPath("userData");
  const serverEnv = {
    ...process.env,
    SHORTDRAMA_RUNTIME_ROOT: RELEASE_ROOT,
    SHORTDRAMA_PROJECTS_ROOT: path.join(userData, "review_projects"),
    PATH: [path.join(RELEASE_ROOT, "models"), path.join(RELEASE_ROOT, "python"), process.env.PATH || ""].filter(Boolean).join(path.delimiter),
  };
  serverProcess = spawn(pythonExe, ["review_server.py", "--host", HOST, "--port", String(currentPort)], {
    cwd: ROOT,
    env: serverEnv,
    windowsHide: true,
    stdio: "ignore",
  });
  serverProcess.on("exit", (code, signal) => log(`server exit: code=${code} signal=${signal || ""}`));
}

async function waitForServer(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://${HOST}:${currentPort}/api/version`);
      if (response.ok) return true;
    } catch (_) {
      // wait
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function createWindow() {
  const appUrl = `http://${HOST}:${currentPort}/v8/`;
  log(`create window: ${appUrl}`);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title: "短剧AI切片工具",
    icon: ICON_PATH,
    backgroundColor: "#f5f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  mainWindow.on("closed", () => {
    log("window closed");
    mainWindow = null;
  });
  await mainWindow.loadURL(appUrl);
  mainWindow.show();
  mainWindow.focus();
  log("loadURL ok");
}

ipcMain.handle("desktop:choose-output-dir", async (_event, currentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择导出文件夹",
    defaultPath: currentPath || ROOT,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, cancelled: true };
  }
  return { ok: true, path: result.filePaths[0] };
});

app.whenReady()
  .then(async () => {
    log("app ready");
    await startServer();
    const ok = await waitForServer();
    log(`server ready: ${ok}`);
    if (!ok) {
      dialog.showErrorBox("启动失败", "本地服务没有启动，请检查 Python 或端口占用。");
    }
    await createWindow();
  })
  .catch((error) => {
    log(`startup failed: ${error.stack || error.message || error}`);
    dialog.showErrorBox("桌面版启动失败", String(error.message || error));
  });

app.on("window-all-closed", () => {
  log("window-all-closed");
  if (serverProcess) serverProcess.kill();
  app.quit();
});
