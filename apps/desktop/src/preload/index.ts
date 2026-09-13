import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IpcChannel, IpcEvent } from '../shared/ipc-channels.js';
import type { AgentStatusSnapshot, AtlasApi, LogEntryDto } from '../shared/ipc-types.js';

/**
 * The only bridge between the sandboxed renderer and Electron. The renderer
 * never sees ipcRenderer itself — only these whitelisted, typed functions.
 */
function listen<T>(channel: IpcEvent, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: AtlasApi = {
  agent: {
    getStatus: () => ipcRenderer.invoke(IpcChannel.AgentGetStatus),
    onStatusChanged: (listener) => listen<AgentStatusSnapshot>(IpcEvent.StatusChanged, listener),
  },
  browser: {
    launch: () => ipcRenderer.invoke(IpcChannel.BrowserLaunch),
    stop: () => ipcRenderer.invoke(IpcChannel.BrowserStop),
  },
  tasks: {
    run: (command) => ipcRenderer.invoke(IpcChannel.TaskRun, { command }),
  },
  extension: {
    getStatus: () => ipcRenderer.invoke(IpcChannel.ExtensionGetStatus),
  },
  search: {
    createCampaign: (request) => ipcRenderer.invoke(IpcChannel.SearchCreateCampaign, request),
    planCampaign: (campaignId) => ipcRenderer.invoke(IpcChannel.SearchPlanCampaign, { campaignId }),
    listCampaigns: () => ipcRenderer.invoke(IpcChannel.SearchListCampaigns),
    getCampaign: (campaignId) => ipcRenderer.invoke(IpcChannel.SearchGetCampaign, { campaignId }),
    getProgress: (campaignId) => ipcRenderer.invoke(IpcChannel.SearchGetProgress, { campaignId }),
    listJobs: (campaignId, page = {}) =>
      ipcRenderer.invoke(IpcChannel.SearchListJobs, { campaignId, ...page }),
  },
  logs: {
    subscribe: () => ipcRenderer.invoke(IpcChannel.LogsSubscribe),
    onEntry: (listener) => listen<LogEntryDto>(IpcEvent.LogEntry, listener),
  },
};

contextBridge.exposeInMainWorld('atlas', api);
