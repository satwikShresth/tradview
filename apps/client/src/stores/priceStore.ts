"use client";

import { createStore } from "@xstate/store";

export interface PriceData {
  ticker: string;
  price: string;
  change?: string;
  timestamp?: Date;
  previousPrice?: string;
}

export interface PriceStoreContext {
  tickers: Record<string, PriceData>;
}

export const priceStore = createStore({
  context: {
    tickers: {},
  } as PriceStoreContext,
  on: {
    updateTicker: (
      context,
      event: {
        ticker: string;
        priceData: Omit<PriceData, "change" | "previousPrice">;
      },
    ) => {
      const existingTicker = context.tickers[event.ticker];
      const currentPrice = parseFloat(event.priceData.price.replace(/,/g, "")); // Remove commas
      const previousPrice = existingTicker
        ? parseFloat(existingTicker.price.replace(/,/g, ""))
        : currentPrice;

      // Calculate change
      let change: string | undefined;
      if (
        existingTicker &&
        !isNaN(currentPrice) &&
        !isNaN(previousPrice) &&
        currentPrice !== previousPrice
      ) {
        const diff = currentPrice - previousPrice;
        const percentChange = ((diff / previousPrice) * 100).toFixed(2);
        const sign = diff > 0 ? "+" : "";
        change = `${sign}${diff.toFixed(2)} (${sign}${percentChange}%)`;
      } else {
        // Preserve existing change if price hasn't changed
        change = existingTicker?.change;
      }

      const updatedPriceData: PriceData = {
        ...event.priceData,
        change,
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
