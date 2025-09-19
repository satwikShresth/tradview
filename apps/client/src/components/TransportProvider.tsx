'use client';

import { ReactNode } from "react";
import { TransportProvider } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { useAuthToken } from "@/hooks/useAuthToken";
import { env } from "@/env";

export function ConnectedTransportProvider({ children }: { children: ReactNode }) {
  const token = useAuthToken();

  const transport = createConnectTransport({
    baseUrl: env.NEXT_PUBLIC_CONNECTRPC_BASE_URL,
    interceptors: [
      (next) => (request) => {
        if (token) {
          request.header.set("Authorization", `Bearer ${token}`);
        }
        return next(request);
      },
    ],
  });

  return (
    <TransportProvider transport={transport}>
      {children}
    </TransportProvider>
  );
}
