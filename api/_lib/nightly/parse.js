import { z } from 'zod';
import { sendError } from '../http.js';

/** Validate req.body against a schema; on failure send 400 VALIDATION_ERROR and return null. */
export function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data;
  sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', z.flattenError(parsed.error));
  return null;
}
