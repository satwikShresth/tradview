import { createContextKey } from '@connectrpc/connect';
export * from "./middlewares"
export const uidKey = createContextKey<{ uid: string }>({ uid: "new_user" });
