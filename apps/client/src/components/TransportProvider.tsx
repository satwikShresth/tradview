'use client';

import { ReactNode } from "react";
import { TransportProvider } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { useAuthToken } from "@/hooks/useAuthToken";
import { env } from "@/env";
import Cookies from 'js-cookie';

export function ConnectedTransportProvider({ children }: { children: ReactNode }) {
  const token = useAuthToken();

  const transport = createConnectTransport({
    baseUrl: env.NEXT_PUBLIC_CONNECTRPC_BASE_URL,
    interceptors: [
      (next) => async (request) => {
        // Add authorization header if token exists
        if (token) {
          request.header.set("Authorization", `Bearer ${token}`);
        }

        return await next(request)
          .then((res) => {
            console.log('[TransportProvider] Request successful:', request.url);
            return res;
          })
          .catch((error: any) => {
            console.error('[TransportProvider] Request failed:', {
              url: request.url,
              error: error?.message,
              code: error?.code
            });
            
            if (error?.code === 401 || error?.message?.includes('unauthenticated')) {
              console.warn('[TransportProvider] Unauthorized request, clearing session and reloading');
              Cookies.remove(env.NEXT_PUBLIC_SESSION_COOKIE_NAME);
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }
            throw error;
          });
      },
    ],
  });

  return (
    <TransportProvider transport={transport}>
      {children}
    </TransportProvider>
  );
}
