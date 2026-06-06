import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  get_status:       ()       => ipcRenderer.invoke('get_status'),
  launch:           (names)  => ipcRenderer.invoke('launch', names),
  stop_service:     (name)   => ipcRenderer.invoke('stop_service', name),
  open_url:         (url)    => ipcRenderer.invoke('open_url', url),
  close:            ()       => ipcRenderer.send('close'),
  send_tray_frames: (frames) => ipcRenderer.send('tray-frames', frames),
})
