import { z } from 'zod';

import { PROTOCOL_VERSION } from './constants.js';
import { TaskStatusSchema } from './states.js';

/**
 * The single source of truth for messages exchanged between the desktop agent
 * and the Chrome extension over the localhost WebSocket.
 */

export const MAX_MESSAGE_BYTES = 64 * 1024;

const MessageIdSchema = z.string().min(1).max(64);

const envelope = {
  v: z.literal(PROTOCOL_VERSION),
  id: MessageIdSchema,
  sentAt: z.iso.datetime(),
};

export const TabMetadataSchema = z
  .object({
    tabId: z.number().int(),
    windowId: z.number().int(),
    url: z.string().max(4096),
    title: z.string().max(1024),
    status: z.enum(['loading', 'complete', 'unknown']),
    incognito: z.boolean(),
    favIconUrl: z.string().max(4096).optional(),
  })
  .strict();

export type TabMetadata = z.infer<typeof TabMetadataSchema>;

// ---------------------------------------------------------------- Extension -> Desktop

export const ExtensionConnectedMessageSchema = z
  .object({
    ...envelope,
    type: z.literal('EXTENSION_CONNECTED'),
    payload: z.object({ extensionVersion: z.string().min(1).max(32) }).strict(),
  })
  .strict();

export const PageChangedMessageSchema = z
  .object({
    ...envelope,
    type: z.literal('PAGE_CHANGED'),
    payload: z
      .object({ reason: z.enum(['activated', 'updated']), tab: TabMetadataSchema })
      .strict(),
  })
  .strict();

export const PageMetadataMessageSchema = z
  .object({
    ...envelope,
    type: z.literal('PAGE_METADATA'),
    payload: z.object({ requestId: MessageIdSchema, tab: TabMetadataSchema.nullable() }).strict(),
  })
  .strict();

export const HeartbeatMessageSchema = z
  .object({
    ...envelope,
    type: z.literal('HEARTBEAT'),
    payload: z.object({ replyTo: MessageIdSchema.optional() }).strict(),
  })
  .strict();

export const ExtensionToDesktopMessageSchema = z.discriminatedUnion('type', [
  ExtensionConnectedMessageSchema,
  PageChangedMessageSchema,
  PageMetadataMessageSchema,
  HeartbeatMessageSchema,
]);

export type ExtensionToDesktopMessage = z.infer<typeof ExtensionToDesktopMessageSchema>;
export type ExtensionMessageType = ExtensionToDesktopMessage['type'];

// ---------------------------------------------------------------- Desktop -> Extension

export const PingMessageSchema = z
  .object({ ...envelope, type: z.literal('PING'), payload: z.object({}).strict() })
  .strict();

export const GetPageMetadataMessageSchema = z
  .object({
    ...envelope,
    type: z.literal('GET_PAGE_METADATA'),
    payload: z.object({ requestId: MessageIdSchema }).strict(),
  })
  .strict();

export const TaskStatusMessageSchema = z
  .object({
    ...envelope,
    type: z.literal('TASK_STATUS'),
    payload: z
      .object({
        taskId: MessageIdSchema,
        status: TaskStatusSchema,
        command: z.string().max(500),
        message: z.string().max(1000).optional(),
      })
      .strict(),
  })
  .strict();

export const DesktopToExtensionMessageSchema = z.discriminatedUnion('type', [
  PingMessageSchema,
  GetPageMetadataMessageSchema,
  TaskStatusMessageSchema,
]);

export type DesktopToExtensionMessage = z.infer<typeof DesktopToExtensionMessageSchema>;
export type DesktopMessageType = DesktopToExtensionMessage['type'];

// ---------------------------------------------------------------- Helpers

type AnyMessage = ExtensionToDesktopMessage | DesktopToExtensionMessage;
type PayloadOf<M extends AnyMessage, T extends M['type']> = Extract<M, { type: T }>['payload'];

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

function createMessage<M extends AnyMessage, T extends M['type']>(
  type: T,
  payload: PayloadOf<M, T>,
  options: { id?: string; now?: Date } = {},
): Extract<M, { type: T }> {
  return {
    v: PROTOCOL_VERSION,
    id: options.id ?? globalThis.crypto.randomUUID(),
    sentAt: (options.now ?? new Date()).toISOString(),
    type,
    payload,
  } as Extract<M, { type: T }>;
}

export function createExtensionMessage<T extends ExtensionMessageType>(
  type: T,
  payload: PayloadOf<ExtensionToDesktopMessage, T>,
  options?: { id?: string; now?: Date },
): Extract<ExtensionToDesktopMessage, { type: T }> {
  return createMessage<ExtensionToDesktopMessage, T>(type, payload, options);
}

export function createDesktopMessage<T extends DesktopMessageType>(
  type: T,
  payload: PayloadOf<DesktopToExtensionMessage, T>,
  options?: { id?: string; now?: Date },
): Extract<DesktopToExtensionMessage, { type: T }> {
  return createMessage<DesktopToExtensionMessage, T>(type, payload, options);
}

export function parseExtensionMessage(raw: string): ParseResult<ExtensionToDesktopMessage> {
  return parseWith(ExtensionToDesktopMessageSchema, raw);
}

export function parseDesktopMessage(raw: string): ParseResult<DesktopToExtensionMessage> {
  return parseWith(DesktopToExtensionMessageSchema, raw);
}

export function serializeMessage(message: AnyMessage): string {
  return JSON.stringify(message);
}

function parseWith<S extends z.ZodType>(schema: S, raw: string): ParseResult<z.output<S>> {
  if (raw.length > MAX_MESSAGE_BYTES) {
    return { ok: false, error: `Message exceeds ${MAX_MESSAGE_BYTES} bytes` };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Message is not valid JSON' };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    return { ok: false, error: `Invalid message${where}: ${issue?.message ?? 'unknown issue'}` };
  }
  return { ok: true, message: result.data };
}
