import 'server-only';
import type { QlooClient } from './client';
import { createQlooClientFromEnv } from './index';

let client: QlooClient | undefined;

/** Shared server-side Qloo client. Offline unless QLOO_LIVE=1. */
export function getQloo(): QlooClient {
  client ??= createQlooClientFromEnv();
  return client;
}
