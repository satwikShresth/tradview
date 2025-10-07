import {
   getInMemoryEventStore,
   CommandHandler,
   type Event,
} from '@event-driven-io/emmett';

// Define Price Events
export type PriceUpdated = Event<
   'PriceUpdated',
   {
      symbol: string;
      price: number;
      change: number;
      timestamp: number;
      volume?: number;
      exchange: string;
   }
>;

export type ConnectionEstablished = Event<
   'ConnectionEstablished',
   {
      symbol: string;
      exchange: string;
      timestamp: number;
   }
>;

export type ConnectionLost = Event<
   'ConnectionLost',
   {
      symbol: string;
      exchange: string;
      timestamp: number;
      reason?: string;
   }
>;

export type CryptoEvents = PriceUpdated | ConnectionEstablished | ConnectionLost;

// Define Price State
export type PriceState = {
   symbol: string;
   exchange: string;
   currentPrice?: number;
   previousPrice?: number;
   change?: number;
   lastUpdate?: number;
   priceHistory: Array<{ price: number; timestamp: number; change: number; volume?: number }>;
   isConnected: boolean;
   connectionCount: number;
   totalUpdates: number;
} | null;

// Business Logic Functions
export function handlePriceCommand(command: any, state: PriceState): CryptoEvents | CryptoEvents[] {
   const timestamp = Date.now();

   switch (command.type) {
      case 'EstablishConnection':
         return {
            type: 'ConnectionEstablished',
            data: {
               symbol: command.symbol,
               exchange: command.exchange,
               timestamp,
            },
         };

      case 'UpdatePrice':
         if (!state?.isConnected) {
            // Auto-establish connection if price update comes through
            return [
               {
                  type: 'ConnectionEstablished',
                  data: {
                     symbol: command.symbol,
                     exchange: command.exchange,
                     timestamp,
                  },
               },
               {
                  type: 'PriceUpdated',
                  data: {
                     symbol: command.symbol,
                     price: command.price,
                     change: command.change,
                     timestamp,
                     volume: command.volume,
                     exchange: command.exchange,
                  },
               }
            ];
         }

         return {
            type: 'PriceUpdated',
            data: {
               symbol: command.symbol,
               price: command.price,
               change: command.change,
               timestamp,
               volume: command.volume,
               exchange: command.exchange,
            },
         };

      case 'LoseConnection':
         if (!state?.isConnected) {
            throw new Error(`Connection for ${command.symbol} is already lost`);
         }
         return {
            type: 'ConnectionLost',
            data: {
               symbol: command.symbol,
               exchange: command.exchange,
               timestamp,
               reason: command.reason,
            },
         };

      default:
         throw new Error(`Unknown command type: ${command.type}`);
   }
}

// State Evolution Function
export function evolve(state: PriceState, event: CryptoEvents): PriceState {
   switch (event.type) {
      case 'ConnectionEstablished':
         return {
            symbol: event.data.symbol,
            exchange: event.data.exchange,
            currentPrice: state?.currentPrice,
            previousPrice: state?.previousPrice,
            change: state?.change,
            lastUpdate: state?.lastUpdate,
            priceHistory: state?.priceHistory || [],
            isConnected: true,
            connectionCount: (state?.connectionCount || 0) + 1,
            totalUpdates: state?.totalUpdates || 0,
         };

      case 'PriceUpdated':
         if (!state) return state;

         const newEntry = {
            price: event.data.price,
            timestamp: event.data.timestamp,
            change: event.data.change,
            volume: event.data.volume,
         };

         return {
            ...state,
            previousPrice: state.currentPrice,
            currentPrice: event.data.price,
            change: event.data.change,
            lastUpdate: event.data.timestamp,
            priceHistory: [...(state.priceHistory || []), newEntry].slice(-100), // Keep last 100 updates
            totalUpdates: state.totalUpdates + 1,
         };

      case 'ConnectionLost':
         if (!state) return state;
         return {
            ...state,
            isConnected: false,
         };

      default:
         return state;
   }
}

// Initial state function
export function initialState(): PriceState {
   return null;
}

// Create store instance and handler (singleton pattern)
const eventStore = getInMemoryEventStore();
const handle = CommandHandler({
   evolve,
   initialState,
   mapToStreamId: (id: string) => id, // Optional: customize stream ID mapping
});

// Handle price commands
export async function handleCommand(streamId: string, command: any): Promise<any> {
   try {
      const result = await handle(
         eventStore,
         streamId,
         (state: PriceState) => handlePriceCommand(command, state)
      );

      return {
         success: true,
         newState: result.newState,
         newEvents: result.newEvents,
         nextExpectedStreamVersion: result.nextExpectedStreamVersion,
      };
   } catch (error) {
      console.error(`Error handling command for ${streamId}:`, error);
      return {
         success: false,
         error: error instanceof Error ? error.message : 'Unknown error',
      };
   }
}

// Get current price state for a symbol
export async function getPriceState(streamId: string): Promise<PriceState> {
   try {
      const result = await eventStore.aggregateStream(streamId, {
         evolve,
         initialState,
      });
      return result.state;
   } catch (error) {
      console.error(`Error getting price state for ${streamId}:`, error);
      return null;
   }
}

// Get all events for a symbol
export async function getSymbolEvents(streamId: string) {
   try {
      const events: any[] = [];
      const stream = eventStore.readStream(streamId);
      const result = await stream;
      if (result.events) {
         events.push(...result.events);
      }
      return events;
   } catch (error) {
      console.error(`Error reading events for ${streamId}:`, error);
      return [];
   }
}

// Get summary of all tracked symbols
export async function getSummary(symbols: string[]): Promise<Record<string, any>> {
   const summary: Record<string, any> = {};

   for (const symbol of symbols) {
      const streamId = `${symbol}_BINANCE`;
      const state = await getPriceState(streamId);

      if (state) {
         summary[symbol] = {
            currentPrice: state.currentPrice,
            change: state.change,
            lastUpdate: state.lastUpdate ? new Date(state.lastUpdate).toISOString() : null,
            totalUpdates: state.totalUpdates,
            isConnected: state.isConnected,
            priceHistory: state.priceHistory.slice(-10), // Last 10 updates
         };
      }
   }

   return summary;
}

// Get price alerts (example: significant price changes)
export async function checkAlerts(symbols: string[], threshold = 5): Promise<any[]> {
   const alerts = [];

   for (const symbol of symbols) {
      const streamId = `${symbol}_BINANCE`;
      const state = await getPriceState(streamId);

      if (state && Math.abs(state.change || 0) >= threshold) {
         alerts.push({
            symbol,
            price: state.currentPrice,
            change: state.change,
            severity: Math.abs(state.change || 0) >= 10 ? 'HIGH' : 'MEDIUM',
            timestamp: state.lastUpdate,
         });
      }
   }

   return alerts;
}

// Get price statistics
export async function getStatistics(symbols: string[]): Promise<any> {
   const stats = {
      totalSymbols: symbols.length,
      activeConnections: 0,
      totalUpdates: 0,
      avgPriceChange: 0,
      lastUpdate: 0,
   };

   let totalChange = 0;
   let connectedSymbols = 0;

   for (const symbol of symbols) {
      const streamId = `${symbol}_BINANCE`;
      const state = await getPriceState(streamId);

      if (state) {
         if (state.isConnected) {
            stats.activeConnections++;
            connectedSymbols++;
         }
         stats.totalUpdates += state.totalUpdates;
         if (state.change) totalChange += Math.abs(state.change);
         if (state.lastUpdate && state.lastUpdate > stats.lastUpdate) {
            stats.lastUpdate = state.lastUpdate;
         }
      }
   }

   if (connectedSymbols > 0) {
      stats.avgPriceChange = totalChange / connectedSymbols;
   }

   return stats;
}

// Export singleton instance with same interface as the original class
export const priceStore = {
   handleCommand,
   getPriceState,
   getSymbolEvents,
   getSummary,
   checkAlerts,
   getStatistics,
};
