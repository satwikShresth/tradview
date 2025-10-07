"use client";

import { createStore } from "@xstate/store";

export interface PriceData {
  ticker: string;
  price: string;
  timestamp?: Date;
  previousPrice?: string;
}

export interface PriceStoreContext {
  tickers: Record<string, PriceData>;
}

const store = createStore({
  context: {
    tickers: {},
  } as PriceStoreContext,
  on: {
    handleStreamUpdate: (
      context,
      event: {
        ticker: string;
        rawData: any;
      },
    ) => {
      const { ticker, rawData } = event;

      // Store handles all validation and processing
      if (!rawData?.price || rawData.price === "0.00") {
        return context;
      }

      // Ensure ticker exists
      if (!context.tickers[ticker]) {
        context = {
          ...context,
          tickers: {
            ...context.tickers,
            [ticker]: {
              ticker,
              price: "",
              timestamp: new Date(),
            },
          },
        };
      }

      // Update ticker data
      const priceData: PriceData = {
        ticker,
        price: rawData.price,
        timestamp: rawData.timestamp
          ? new Date(Number(rawData.timestamp.seconds) * 1000)
          : new Date(),
        previousPrice: context.tickers[ticker]?.price,
      };

      return {
        ...context,
        tickers: {
          ...context.tickers,
          [ticker]: priceData,
        },
      };
    },

    updateTicker: (
      context,
      event: {
        ticker: string;
        priceData: PriceData;
      },
    ) => {
      const existingTicker = context.tickers[event.ticker];

      const updatedPriceData: PriceData = {
        ...event.priceData,
        previousPrice: existingTicker?.price,
      };

      return {
        ...context,
        tickers: {
          ...context.tickers,
          [event.ticker]: updatedPriceData,
        },
      };
    },

    addPlaceholderTicker: (context, event: { ticker: string }) => {
      if (context.tickers[event.ticker]) {
        return context;
      }

      return {
        ...context,
        tickers: {
          ...context.tickers,
          [event.ticker]: {
            ticker: event.ticker,
            price: "",
            timestamp: new Date(),
          },
        },
      };
    },

    removeTicker: (context, event: { ticker: string }) => {
      const { [event.ticker]: removed, ...remainingTickers } = context.tickers;
      return {
        ...context,
        tickers: remainingTickers,
      };
    },

    updateMultipleTickers: (
      context,
      event: { updates: Record<string, PriceData> },
    ) => ({
      ...context,
      tickers: {
        ...context.tickers,
        ...event.updates,
      },
    }),

    clearTickers: (context) => ({
      ...context,
      tickers: {},
    }),
  },
});

export const priceStore = store;
