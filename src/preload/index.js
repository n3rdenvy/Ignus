import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  get_status:   ()      => ipcRenderer.invoke('get_status'),
  launch:       (names) => ipcRenderer.invoke('launch', names),
  stop_service: (name)  => ipcRenderer.invoke('stop_service', name),
  close:        ()      => ipcRenderer.send('close'),
})
