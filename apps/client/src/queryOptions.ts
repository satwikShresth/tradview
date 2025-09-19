"use client";

import { experimental_streamedQuery as streamedQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  type PriceData,
  type StreamPricesResponse,
  AuthService,
} from "@tradview/proto";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { priceStore } from "@/stores/priceStore";
import { env } from "@/env";

// Define a map type for ticker data
export type TickerMap = Record<string, PriceData>;
export interface TokenResponse {
  token: string;
}

export interface TokenVerifyResponse {
  valid: boolean;
  uid?: string;
  message: string;
}

// Create auth transport and client (no token required for auth endpoints)
const authTransport = createConnectTransport({
  baseUrl: env.NEXT_PUBLIC_CONNECTRPC_BASE_URL,
});
const authClient = createClient(AuthService, authTransport);

export const priceStreamQuery = (client: any) =>
  queryOptions({
    queryKey: ["prices", "stream"],
    queryFn: streamedQuery({
      streamFn: async () => {
        return client.streamPrices({});
      },
      reducer: (accumulator: TickerMap, chunk: StreamPricesResponse) => {
        const newPrice = chunk.priceData;
        if (!newPrice) return accumulator;

        const isValidTicker =
          newPrice.ticker &&
          newPrice.ticker.length >= 3 &&
          newPrice.ticker.length <= 15 &&
          newPrice.price &&
          newPrice.price !== "0.00";

        if (!isValidTicker) {
          return accumulator;
        }

        const priceData = {
          ticker: newPrice.ticker,
          price: newPrice.price || "0.00",
          timestamp: newPrice.timestamp
            ? new Date(Number(newPrice.timestamp.seconds) * 1000)
            : new Date(),
        };

        // Check if ticker exists in store, if not add it automatically
        const currentState = priceStore.getSnapshot();
        const tickerExists = !!currentState.context.tickers[newPrice.ticker];

        if (!tickerExists) {
          priceStore.send({
            type: "addPlaceholderTicker",
            ticker: newPrice.ticker,
          });
        }

        priceStore.send({
          type: "updateTicker",
          ticker: newPrice.ticker,
          priceData,
        });

        return {
          ...accumulator,
          [newPrice.ticker]: newPrice,
        };
      },
      initialValue: {} as TickerMap,
    }),
  });

export const getToken = queryOptions({
  queryKey: ["token"],
  queryFn: async (): Promise<TokenResponse> => {
    const result = await authClient.generateToken({});
    return { token: result.token };
  },
  staleTime: 1000 * 60 * 60 * 24, // 24 hours (since we're storing in cookie)
  gcTime: 1000 * 60 * 60 * 24, // 24 hours
  retry: 3,
  select: (data) => data.token,
  refetchOnWindowFocus: false,
});

export const verifyToken = (token: string) =>
  queryOptions({
    queryKey: ["token", "verify", token],
    queryFn: async (): Promise<TokenVerifyResponse> => {
      const result = await authClient.verifyToken({ token });
      return {
        valid: result.valid,
        message: result.message,
        uid: result.uid,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1, // Only retry once for token verification
  });
