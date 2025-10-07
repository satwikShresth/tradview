import type { ConnectRouter } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { TradViewService } from "@TradView/proto";
import { uidKey } from "../utils";
import { subscriptionStore } from "../utils/subscription.store";
import { priceStore } from "../utils/price.store";
import { EventEmitter } from 'events';
import { scraper, globalPriceEmitter } from '../services/scraper.service';

// Legacy variables - can be removed in future cleanup
const tickerEmitter = new EventEmitter();
tickerEmitter.setMaxListeners(0);

export default (router: ConnectRouter) =>
  router.service(
    TradViewService,
    {
      addTicker: async (req, context) => {
        const { uid } = context.values.get(uidKey);
        const userIdShort = uid.substring(0, 8);
        const ticker = req.tickerId.toUpperCase();

        try {
          console.log(`[Routes] 📈 User ${userIdShort} requesting to add ticker: ${ticker}`);

          // Add subscription to the subscription store
          const subscriptionResult = await subscriptionStore
            .handleCommand(
              ticker,
              {
                type: 'SubscribeTicker',
                userId: uid,
                ticker,
              }
            );

          if (!subscriptionResult.success) {
            throw new ConnectError(`Failed to handle subscription for ${ticker}`, Code.Internal);
          }

          // Check if this was a new subscription or existing one
          const isNewSubscription = subscriptionResult.newEvents && subscriptionResult.newEvents.length > 0;

          if (!isNewSubscription) {
            console.log(`[Routes] 🔄 User ${userIdShort} already subscribed to ${ticker} - allowing duplicate connection`);
            // Still return success and current price data for new browser/session
            return {
              success: true,
              message: `Already subscribed to ${ticker} - sending current data`,
              tickerId: ticker,
            };
          }

          // Start tracking with polling scraper if not already tracking
          if (!scraper.isTracking(ticker)) {
            console.log(`[Routes] 🎯 Starting polling scraper for ${ticker}...`);
            try {
              await scraper.addTicker(ticker);
              console.log(`[Routes] ✅ Polling scraper started for ${ticker}`);
            } catch (error) {
              // If scraper failed, rollback the subscription
              await subscriptionStore.handleCommand(ticker, {
                type: 'UnsubscribeTicker',
                userId: uid,
                ticker,
              });

              throw new ConnectError(`Failed to start tracking ${ticker}: ${error}`, Code.Internal);
            }
          } else {
            console.log(`[Routes] ♻️ ${ticker} already being tracked by polling scraper`);
          }

          console.log(`[Routes] ✅ User ${userIdShort} successfully subscribed to ${ticker}`);

          return {
            success: true,
            message: `Successfully subscribed to ${ticker}`,
            tickerId: ticker,
          };

        } catch (error) {
          console.error(`[Routes] ❌ Error adding ticker ${ticker} for user ${userIdShort}:`, error);

          if (error instanceof ConnectError) {
            throw error;
          }

          throw new ConnectError(
            error instanceof Error ? error.message : 'Unknown error occurred',
            Code.Internal
          );
        }
      },
      removeTicker: async (req, context) => {
        const { uid } = context.values.get(uidKey);
        const userIdShort = uid.substring(0, 8);
        const ticker = req.tickerId.toUpperCase();

        try {
          console.log(`[Routes] 📉 User ${userIdShort} requesting to remove ticker: ${ticker}`);

          // Remove subscription from the subscription store
          const subscriptionResult = await subscriptionStore.handleCommand(ticker, {
            type: 'UnsubscribeTicker',
            userId: uid,
            ticker,
          });

          if (!subscriptionResult.success) {
            throw new ConnectError(`Failed to handle unsubscription for ${ticker}`, Code.Internal);
          }

          // Check if this was an actual unsubscription or user wasn't subscribed
          const wasActualUnsubscription = subscriptionResult.newEvents && subscriptionResult.newEvents.length > 0;

          if (!wasActualUnsubscription) {
            console.log(`[Routes] ⚠️ User ${userIdShort} was not subscribed to ${ticker}`);
            return {
              success: true, // Return success even if not subscribed
              message: `Not subscribed to ${ticker}`,
              tickerId: ticker,
            };
          }

          // Check if there are any remaining subscribers for this ticker
          const subscriptionState = await subscriptionStore.getSubscriptionState(ticker);
          const hasRemainingSubscribers = subscriptionState && subscriptionState.subscribers.size > 0;

          // If no more subscribers, stop the polling scraper
          if (!hasRemainingSubscribers && scraper.isTracking(ticker)) {
            console.log(`[Routes] 🛑 No more subscribers for ${ticker}, stopping polling scraper...`);
            try {
              await scraper.removeTicker(ticker);
              console.log(`[Routes] ✅ Polling scraper stopped for ${ticker}`);
            } catch (error) {
              console.log(`[Routes] ⚠️ Error stopping scraper for ${ticker}:`, error);
            }
          } else if (hasRemainingSubscribers) {
            console.log(`[Routes] 👥 ${ticker} still has ${subscriptionState?.subscribers.size} subscribers, keeping scraper active`);
          }

          console.log(`[Routes] ✅ User ${userIdShort} successfully unsubscribed from ${ticker}`);

          return {
            success: true,
            message: `Successfully unsubscribed from ${ticker}`,
            tickerId: ticker,
          };

        } catch (error) {
          console.error(`[Routes] ❌ Error removing ticker ${ticker} for user ${userIdShort}:`, error);

          if (error instanceof ConnectError) {
            throw error;
          }

          throw new ConnectError(
            error instanceof Error ? error.message : 'Unknown error occurred',
            Code.Internal
          );
        }
      },
      healthCheck: async () => {
        try {
          const activeTickers = await subscriptionStore.getActiveTickersWithCounts();
          const tickerList = Object.keys(activeTickers);
          const scraperTickers = scraper.getTrackedTickers();
          
          // Check if scraper is tracking all subscribed tickers
          const missingTickers = tickerList.filter(ticker => !scraperTickers.includes(ticker));
          const extraTickers = scraperTickers.filter(ticker => !tickerList.includes(ticker));

          return {
            healthy: true,
            status: `Polling scraper working - tracking ${scraperTickers.length} tickers, ${tickerList.length} subscribed`,
            activeTickers: tickerList,
            scraperStatus: {
              tracking: scraperTickers,
              missing: missingTickers,
              extra: extraTickers,
            },
          };
        } catch (error) {
          console.error('[Routes] ❌ Error in health check:', error);
          return {
            healthy: false,
            status: 'Service error',
            activeTickers: [],
            scraperStatus: { tracking: [], missing: [], extra: [] },
          };
        }
      },
      streamPrices: async function*(_req, context) {
        const { uid } = context.values.get(uidKey);
        const userIdShort = uid.substring(0, 8);

        console.log(`[Routes] 🌊 Starting price stream for user ${userIdShort}`);

        try {
          // Get user's subscriptions
          const userSubscriptions = await subscriptionStore.getUserSubscriptions(uid);
          console.log(`[Routes] 📊 User ${userIdShort} subscribed to: ${userSubscriptions.join(', ')}`);

          // Simple event queue for price updates
          const priceQueue: any[] = [];

          // Listen directly to Emmett price events
          const priceUpdateListener = async (_: string, event: any) => {
            if (event.type === 'PriceUpdated') {
              const symbol = event.data.symbol;

              // Check if user is subscribed to this ticker
              const subscriptionState = await subscriptionStore.getSubscriptionState(symbol);
              if (subscriptionState?.subscribers.has(uid)) {
                priceQueue.push({
                  ticker: symbol,
                  price: event.data.price.toString(),
                  change: "", // Simplified - no change data sent to frontend
                  timestamp: {
                    seconds: Math.floor(event.data.timestamp / 1000),
                    nanos: (event.data.timestamp % 1000) * 1000000,
                  },
                });
              }
            }
          };

          // Set up listener
          globalPriceEmitter.on('priceUpdate', priceUpdateListener);

          // Send initial prices for user's subscriptions
          for (const ticker of userSubscriptions) {
            const streamId = `${ticker}_BINANCE`;
            const priceState = await priceStore.getPriceState(streamId);

            if (priceState && priceState.currentPrice !== undefined) {
              // For initial prices from store, we need to format the number back to a string with commas
              const formattedPrice = priceState.currentPrice.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              
              priceQueue.push({
                ticker,
                price: formattedPrice,
                change: "", // Simplified - no change data sent to frontend
                timestamp: {
                  seconds: Math.floor((priceState.lastUpdate || Date.now()) / 1000),
                  nanos: ((priceState.lastUpdate || Date.now()) % 1000) * 1000000,
                },
              });
            }
          }

          // Clean up function
          const cleanup = () => {
            console.log(`[Routes] 🧹 Cleaning up price stream for user ${userIdShort}`);
            globalPriceEmitter.off('priceUpdate', priceUpdateListener);
          };

          // Handle client disconnect
          context.signal.addEventListener('abort', cleanup);

          try {
            // Stream price updates
            while (!context.signal.aborted) {
              if (priceQueue.length > 0) {
                const priceData = priceQueue.shift();
                if (priceData && !context.signal.aborted) {
                  yield { priceData };
                }
              } else {
                // Wait briefly when no data
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          } finally {
            cleanup();
          }

        } catch (error) {
          console.error(`[Routes] ❌ Error in price stream for user ${userIdShort}:`, error);
          throw new ConnectError(
            error instanceof Error ? error.message : 'Stream error occurred',
            Code.Internal
          );
        }
      }
    });
