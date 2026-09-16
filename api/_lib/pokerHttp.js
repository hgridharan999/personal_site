import { sendError } from './http.js';

// 409, not 404: the outbox retries it, because the session row may simply not be saved yet.
export const sendSessionNotFound = (res, sessionIds) =>
  sendError(res, 409, 'SESSION_NOT_FOUND', 'Session not saved yet', { sessionIds });
