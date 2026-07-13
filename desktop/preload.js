const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shortDramaDesktop", {
  chooseOutputDir(currentPath) {
    return ipcRenderer.invoke("desktop:choose-output-dir", currentPath || "");
  },
});
