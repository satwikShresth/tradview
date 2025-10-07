"use client";

import {
  // mutationOptions,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
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

export type TickerMap = Record<string, PriceData>;
export interface TokenResponse {
  token: string;
}

export interface TokenVerifyResponse {
  valid: boolean;
  uid?: string;
  message: string;
}

export interface TickerSuggestion {
  symbol: string; // BTC
  name: string; // Bitcoin
  price: number; // 115773.05
  fullSymbol: string; // CRYPTO:BTCUSD
  marketCap?: number; // Market capitalization
}

export interface TickerValidationResult {
  totalcount: boolean;
  suggestion?: TickerSuggestion;
}

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
      reducer: (_: null, chunk: StreamPricesResponse) => {
        // Just extract ticker and send to store - no accumulator needed
        const ticker = chunk.priceData?.ticker;
        if (ticker) {
          priceStore.send({
            type: "handleStreamUpdate",
            ticker: ticker,
            rawData: chunk.priceData,
          });
        }

        // No need to accumulate - store handles all state
        return null;
      },
      initialValue: null,
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

// export const verifyToken = (token: string) =>
//   mutationOptions({
//     mutationKey: ["token", "verify", token],
//     mutationFn: async (): Promise<TokenVerifyResponse> => {
//       const result = await authClient.verifyToken({ token });
//       return {
//         valid: result.valid,
//         message: result.message,
//         uid: result.uid,
//       };
//     },
//     onError
//   });

type FetchTradingViewDataResponse = {
  totalCount: number;
  data: Array<{
    s: string;
    d: Array<any>;
  }>;
};

// TradingView Scanner API proxy URL (Next.js API route)
const TRADINGVIEW_PROXY_URL = "/api/tradingview-proxy";

// Helper function for TradingView API calls via Next.js proxy
const fetchTradingViewData = async (
  payload: any,
): Promise<FetchTradingViewDataResponse> => {
  const response = await fetch(TRADINGVIEW_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `TradingView proxy error: ${response.status} - ${errorData.message || response.statusText}`,
    );
  }

  return response.json();
};

// Autocomplete query for ticker suggestions
export const tickerAutocomplete = (query: string) =>
  queryOptions({
    queryKey: ["ticker", "autocomplete", query.toUpperCase()],
    queryFn: async (): Promise<FetchTradingViewDataResponse> => {
      const payload = {
        columns: [
          "base_currency",
          "base_currency_desc",
          "close",
          "market_cap_calc",
        ],
        ignore_unknown_fields: false,
        options: { lang: "en" },
        range: [0, 10], // Limit to 10 suggestions
        filter: [
          {
            left: "name",
            operation: "match",
            right: `${query.toUpperCase()}`, // Match full symbol like BTCUSD
          },
        ],
        sort: {
          sortBy: "crypto_total_rank",
          sortOrder: "asc",
          nullsFirst: false,
        },
      };

      return await fetchTradingViewData(payload);
    },
    enabled: query.length >= 1, // Only run if query has at least 1 character
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    retry: 2,
  });

// Exact ticker validation query
export const validateTicker = (ticker: string) =>
  queryOptions({
    queryKey: ["ticker", "validate", ticker.toUpperCase()],
    queryFn: async (): Promise<FetchTradingViewDataResponse> => {
      const payload = {
        columns: [
          "base_currency",
          "base_currency_desc",
          "close",
          "market_cap_calc",
        ],
        ignore_unknown_fields: false,
        options: { lang: "en" },
        range: [0, 1],
        filter: [
          {
            left: "name",
            operation: "equal",
            right: `${ticker.toUpperCase()}`, // Match exact full symbol like BTCUSD
          },
        ],
      };

      return await fetchTradingViewData(payload);
    },
    enabled: ticker.length >= 1, // Only run if ticker has at least 1 character
    staleTime: 1000 * 60 * 10, // 10 minutes (validation results are stable)
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: 2,
  });
