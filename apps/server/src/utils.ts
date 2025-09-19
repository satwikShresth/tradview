import { createContextKey } from "@connectrpc/connect";

export const uidKey = createContextKey<{ uid: string }>({ uid: "new_user" });
