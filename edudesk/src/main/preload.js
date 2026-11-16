'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('edudesk', {
  call: (service, method, ...args) => ipcRenderer.invoke('edudesk:api', service, method, args),
  onChanged: (fn) => {
    const h = (_e, what) => fn(what);
    ipcRenderer.on('edudesk:changed', h);
    return () => ipcRenderer.removeListener('edudesk:changed', h);
  },
  onNotice: (fn) => {
    const h = (_e, n) => fn(n);
    ipcRenderer.on('edudesk:notice', h);
    return () => ipcRenderer.removeListener('edudesk:notice', h);
  },
  // path of a file dropped onto the window (drag & drop attachments)
  pathForFile: (file) => (webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path),
});
