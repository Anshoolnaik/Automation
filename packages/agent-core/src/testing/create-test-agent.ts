import { createPhaseOneCommandParser } from '@atlas/command-parser';
import { openAtlasDatabase, type AtlasDatabase } from '@atlas/database';
import { createLogManager, MemoryTransport } from '@atlas/logger';

import { AgentService } from '../agent-service.js';
import type { AgentStatus } from '../agent-status.js';
import { BrowserSession } from '../browser/browser-session.js';
import type { BrowserEventRecorder } from '../ports.js';
import { TaskRunner } from '../tasks/task-runner.js';
import { FakeBrowserController } from './fake-browser-controller.js';
import { FakeExtensionChannel } from './fake-extension-channel.js';

/** Wires a complete agent with an in-memory database and fake browser/extension. */
export function createTestAgent() {
  const database: AtlasDatabase = openAtlasDatabase({ filePath: ':memory:' });
  const logs = new MemoryTransport({ capacity: 1_000 });
  const logManager = createLogManager({ transports: [logs], minLevel: 'debug' });
  const controller = new FakeBrowserController();
  const extension = new FakeExtensionChannel();
  const events: BrowserEventRecorder = {
    record: (event) =>
      database.browserEvents.create({
        eventType: event.type,
        taskId: event.taskId ?? null,
        url: event.url ?? null,
        details: event.details ?? {},
      }),
  };
  const run = database.agentRuns.start();
  const browser = new BrowserSession(controller, logManager.forComponent('browser'), events);
  const tasks = new TaskRunner({
    tasks: database.tasks,
    checkpoints: database.checkpoints,
    events,
    parser: createPhaseOneCommandParser(),
    getBrowser: () => browser.requireRunningController(),
    logger: logManager.forComponent('tasks'),
    agentRunId: run.id,
  });
  const service = new AgentService({
    browser,
    tasks,
    extension,
    events,
    logger: logManager.forComponent('agent'),
  });
  const statuses: AgentStatus[] = [];
  service.onStatusChanged((status) => statuses.push(status));

  return {
    database,
    logs,
    controller,
    extension,
    browser,
    tasks,
    service,
    statuses,
    agentRunId: run.id,
  };
}
