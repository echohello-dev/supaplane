import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('supaplane', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});