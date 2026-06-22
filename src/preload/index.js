import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  get_status:       ()       => ipcRenderer.invoke('get_status'),
  launch:           (names)  => ipcRenderer.invoke('launch', names),
  stop_service:     (name)   => ipcRenderer.invoke('stop_service', name),
  open_url:         (url)    => ipcRenderer.invoke('open_url', url),
  close:            ()       => ipcRenderer.send('close'),
  send_tray_frames: (frames) => ipcRenderer.send('tray-frames', frames),
  on_idle_reset:    (cb)     => ipcRenderer.on('idle-reset', (_e, ts) => cb(ts)),

  // Cockpit
  open_cockpit:     ()             => ipcRenderer.invoke('open_cockpit'),
  machines_status:  ()             => ipcRenderer.invoke('machines_status'),
  list_assets:      ()             => ipcRenderer.invoke('list_assets'),
  asset_action:     (sku, action)  => ipcRenderer.invoke('asset_action', sku, action),
  open_path:        (p)            => ipcRenderer.invoke('open_path', p),
  get_config:       ()             => ipcRenderer.invoke('get_config'),
  save_config:      (partial)      => ipcRenderer.invoke('save_config', partial),

  // ComfyUI generation
  comfy_presets:    ()             => ipcRenderer.invoke('comfy_presets'),
  comfy_generate:   (preset, params) => ipcRenderer.invoke('comfy_generate', preset, params),
  pick_image:       ()             => ipcRenderer.invoke('pick_image'),
  pick_images:      ()             => ipcRenderer.invoke('pick_images'),
  read_thumb:       (p)            => ipcRenderer.invoke('read_thumb', p),
  export_views:     (views)        => ipcRenderer.invoke('export_views', views),
  // Resolve a dropped File → absolute path (Electron 33 removed File.path).
  path_for_file:    (file)         => webUtils.getPathForFile(file),
  comfy_queue:      ()             => ipcRenderer.invoke('comfy_queue'),
  open_queue:       ()             => ipcRenderer.invoke('open_queue'),
})
