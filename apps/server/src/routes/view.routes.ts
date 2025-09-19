import type { ConnectRouter } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { TradViewService } from "@TradView/proto";
import { uidKey } from "../utils";
import { EventEmitter } from 'events';
import { streamer } from '../services/streamer.service';
import { scraper } from '../services/scraper.service';

const userTickers: Record<string, string[]> = {};
const tickerEmitter = new EventEmitter();
tickerEmitter.setMaxListeners(0);

export default (router: ConnectRouter) =>
  router.service(
    TradViewService,
    {
      addTicker: async (req, context) => {
        const { uid } = context.values.get(uidKey);
        console.log(`[AddTicker] Adding ticker: ${req.tickerId} for user: ${uid}`);

        try {
          if (!req.tickerId || req.tickerId.trim().length === 0) {
            throw new ConnectError(
              "Ticker ID cannot be empty",
              Code.InvalidArgument
            );
          }

          const tickerId = req.tickerId.trim().toUpperCase();

          if (!/^[A-Z0-9]{3,15}$/.test(tickerId)) {
            throw new ConnectError(
              "Invalid ticker format. Ticker must be 3-15 alphanumeric characters (e.g., BTCUSD, ETHUSD)",
              Code.InvalidArgument
            );
          }

          await scraper
            .addTicker(tickerId)
            .then(() => console.log(`[AddTicker] Scraper validation successful for ${tickerId}`)
            ).catch(error => {
              console.error(`[AddTicker] Scraper validation failed for ${tickerId}:`, error);
              throw new ConnectError(
                `Ticker ${tickerId} is not valid or not available for scraping. Please check the ticker symbol.`,
                Code.InvalidArgument
              );
            })

          if (!userTickers[uid]) { userTickers[uid] = []; }

          if (userTickers[uid].includes(tickerId)) {
            return {
              success: false,
              message: `Ticker ${tickerId} is already in your watchlist`,
              tickerId: tickerId
            };
          }

          userTickers[uid].push(tickerId);
          console.log(`[AddTicker] Successfully added ${tickerId} for user ${uid}`);
          tickerEmitter.emit('tickerUpdate', { userId: uid, tickers: [...userTickers[uid]] }); // Send a copy

          return {
            success: true,
            message: `Successfully added ticker ${tickerId} to your watchlist`,
            tickerId: tickerId
          };

        } catch (error) {
          console.error(`[AddTicker] Error adding ticker for user ${uid}:`, error);
          return {
            success: false,
            message: `Failed to add ticker: ${(error as Error).message}`,
            tickerId: req.tickerId
          };
        }
      },

      removeTicker: async (req, context) => {
        const { uid } = context.values.get(uidKey);
        console.log(`[RemoveTicker] Removing ticker: ${req.tickerId} for user: ${uid}`);

        try {
          if (!req.tickerId || req.tickerId.trim().length === 0) {
            throw new ConnectError("Ticker ID cannot be empty", Code.InvalidArgument);
          }

          const tickerId = req.tickerId.trim().toUpperCase();

          // Check if user has any tickers
          if (!userTickers[uid] || userTickers[uid].length === 0) {
            return {
              success: false,
              message: "No tickers found in your watchlist",
              tickerId: tickerId
            };
          }

          const index = userTickers[uid].indexOf(tickerId);
          if (index === -1) {
            return {
              success: false,
              message: `Ticker ${tickerId} not found in your watchlist`,
              tickerId: tickerId
            };
          }

          userTickers[uid].splice(index, 1);
          console.log(`[RemoveTicker] Successfully removed ${tickerId} for user ${uid}`);
          tickerEmitter.emit('tickerUpdate', { userId: uid, tickers: [...userTickers[uid]] });

          return {
            success: true,
            message: `Successfully removed ticker ${tickerId} from your watchlist`,
            tickerId: tickerId
          };

        } catch (error) {
          console.error(`[RemoveTicker] Error removing ticker for user ${uid}:`, error);
          return {
            success: false,
            message: `Failed to remove ticker: ${(error as Error).message}`,
            tickerId: req.tickerId
          };
        }
      },

      healthCheck: async (_req, context) => {
        const { uid } = context.values.get(uidKey)
        console.log(`[STUB] Health check requested`);
        console.log(`[STUB] Uid: `, uid);
        // TODO: Implement health check logic

        return {
          healthy: true,
          status: "Service is running",
          activeTickers: ["BTCUSD", "ETHUSD"]
        };
      },

      streamPrices: async function*(_req, context) {
        const { uid } = context.values.get(uidKey);
        console.log(`[StreamPrices] Starting price stream for user: ${uid}`);

        const signal = context.signal;
        let currentTickers = [...(userTickers[uid] || [])];
        const priceDataQueue: Array<{ ticker: string; price: string; change?: string }> = [];
        const consumerIds = new Map<string, string>();

        const tickerUpdateListener = async (data: { userId: string; tickers: string[] }) => {
          if (data.userId === uid) {
            const oldTickers = new Set(currentTickers);
            const newTickers = new Set(data.tickers);

            for (const ticker of oldTickers) {
              if (!newTickers.has(ticker)) {
                const consumerId = consumerIds.get(ticker);
                if (consumerId) {
                  await streamer.unsubscribe(consumerId);
                  consumerIds.delete(ticker);
                }
              }
            }

            for (const ticker of newTickers) {
              if (!oldTickers.has(ticker)) {
                await streamer
                  .subscribe(ticker, (priceData) => {
                    priceDataQueue.push({
                      ticker: priceData.ticker,
                      price: priceData.price || "0.00",
                      change: priceData.change
                    });
                  })
                  .then((consumerId) => consumerIds.set(ticker, consumerId))
                  .catch((error) => console.error(`[StreamPrices] Error subscribing to ${ticker}:`, error))
              }
            }

            currentTickers = [...data.tickers];
          }
        };

        for (const ticker of currentTickers) {
          await streamer
            .subscribe(ticker, (priceData) => {
              priceDataQueue.push({
                ticker: priceData.ticker,
                price: priceData.price || "0.00",
                change: priceData.change
              });
            })
            .then((consumerId) => consumerIds.set(ticker, consumerId))
            .catch(error => console.error(`[StreamPrices] Error initially subscribing to ${ticker}:`, error))
        }

        tickerEmitter.on('tickerUpdate', tickerUpdateListener);

        const cleanup = async () => {
          tickerEmitter.off('tickerUpdate', tickerUpdateListener);

          for (const [ticker, consumerId] of consumerIds.entries()) {
            await streamer
              .unsubscribe(consumerId)
              .catch((error) => console.error(`[StreamPrices] Cleanup error unsubscribing from ${ticker}:`, error))
          }
          consumerIds.clear();
          console.log(`[StreamPrices] Price stream ended for user: ${uid}`);
        };

        try {
          while (!signal.aborted) {
            if (priceDataQueue.length > 0) {
              const priceData = priceDataQueue.shift()!;
              yield {
                priceData: priceData
              };
            } else {
              await new Promise(resolve => setTimeout(resolve, 100))
                .catch(error => {
                  console.error(`[StreamPrices] Error in queue check delay:`, error);
                });
            }
          }
        } catch (error) {
          console.error(`[StreamPrices] Error in price streaming for user ${uid}:`, error);
        } finally {
          await cleanup();
        }
      }
    });
