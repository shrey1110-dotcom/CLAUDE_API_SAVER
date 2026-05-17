export class SessionStore {
  create(userId: string) { return { id: userId }; }
}
export function refreshSession(sessionId: string) { return sessionId; }
