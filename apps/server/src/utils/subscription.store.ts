import {
   getInMemoryEventStore,
   CommandHandler,
   type Event,
} from '@event-driven-io/emmett';

// Define Subscription Events
export type TickerSubscribed = Event<
   'TickerSubscribed',
   {
      userId: string;
      ticker: string;
      timestamp: number;
   }
>;

export type TickerUnsubscribed = Event<
   'TickerUnsubscribed',
   {
      userId: string;
      ticker: string;
      timestamp: number;
   }
>;

export type SubscriptionEvents = TickerSubscribed | TickerUnsubscribed;

// Define Subscription State
export type SubscriptionState = {
   ticker: string;
   subscribers: Set<string>; // Set of user IDs
   subscriberCount: number;
   createdAt: number;
   lastActivity: number;
} | null;

// Business Logic Functions
export function handleSubscriptionCommand(command: any, state: SubscriptionState): SubscriptionEvents | SubscriptionEvents[] {
   const timestamp = Date.now();

   switch (command.type) {
      case 'SubscribeTicker':
         // Check if user is already subscribed
         if (state?.subscribers.has(command.userId)) {
            throw new Error(`User ${command.userId} is already subscribed to ${command.ticker}`);
         }

         return {
            type: 'TickerSubscribed',
            data: {
               userId: command.userId,
               ticker: command.ticker,
               timestamp,
            },
         };

      case 'UnsubscribeTicker':
         // Check if user is subscribed - if not, return empty array (no new events)
         if (!state?.subscribers.has(command.userId)) {
            console.log(`[SubscriptionStore] User ${command.userId} not subscribed to ${command.ticker} - ignoring unsubscribe`);
            return []; // Return empty array - no new events to emit
         }

         return {
            type: 'TickerUnsubscribed',
            data: {
               userId: command.userId,
               ticker: command.ticker,
               timestamp,
            },
         };

      default:
         throw new Error(`Unknown command type: ${command.type}`);
   }
}

// State Evolution Function
export function evolve(state: SubscriptionState, event: SubscriptionEvents): SubscriptionState {
   switch (event.type) {
      case 'TickerSubscribed':
         const subscribers = new Set(state?.subscribers || []);
         subscribers.add(event.data.userId);

         return {
            ticker: event.data.ticker,
            subscribers,
            subscriberCount: subscribers.size,
            createdAt: state?.createdAt || event.data.timestamp,
            lastActivity: event.data.timestamp,
         };

      case 'TickerUnsubscribed':
         if (!state) return state;

         const remainingSubscribers = new Set(state.subscribers);
         remainingSubscribers.delete(event.data.userId);

         // If no subscribers left, return null to indicate cleanup
         if (remainingSubscribers.size === 0) {
            return null;
         }

         return {
            ...state,
            subscribers: remainingSubscribers,
            subscriberCount: remainingSubscribers.size,
            lastActivity: event.data.timestamp,
         };

      default:
         return state;
   }
}

// Initial state function
export function initialState(): SubscriptionState {
   return null;
}

// Create store instance and handler (singleton pattern)
const eventStore = getInMemoryEventStore();
const handle = CommandHandler({
   evolve,
   initialState,
   mapToStreamId: (id: string) => id,
});

// Handle subscription commands
export async function handleCommand(streamId: string, command: any): Promise<any> {
   try {
      const result = await handle(
         eventStore,
         streamId,
         (state: SubscriptionState) => handleSubscriptionCommand(command, state)
      );

      // Update caches based on the new state and events
      if (result.newEvents) {
         for (const event of result.newEvents) {
            if (event.type === 'TickerSubscribed') {
               updateUserSubscriptionsCache(event.data.userId, event.data.ticker, true);
            } else if (event.type === 'TickerUnsubscribed') {
               updateUserSubscriptionsCache(event.data.userId, event.data.ticker, false);
            }
         }

         // Update active tickers cache
         updateActiveTickersCache(streamId, result.newState);
      }

      return {
         success: true,
         newState: result.newState,
         newEvents: result.newEvents,
         nextExpectedStreamVersion: result.nextExpectedStreamVersion,
      };
   } catch (error) {
      console.error(`Error handling subscription command for ${streamId}:`, error);
      return {
         success: false,
         error: error instanceof Error ? error.message : 'Unknown error',
      };
   }
}

// Get current subscription state for a ticker
export async function getSubscriptionState(streamId: string): Promise<SubscriptionState> {
   try {
      const result = await eventStore.aggregateStream(streamId, {
         evolve,
         initialState,
      });
      return result.state;
   } catch (error) {
      console.error(`Error getting subscription state for ${streamId}:`, error);
      return null;
   }
}

// Get all events for a ticker subscription
export async function getSubscriptionEvents(streamId: string) {
   try {
      const events: any[] = [];
      const stream = eventStore.readStream(streamId);
      const result = await stream;
      if (result.events) {
         events.push(...result.events);
      }
      return events;
   } catch (error) {
      console.error(`Error reading subscription events for ${streamId}:`, error);
      return [];
   }
}

// In-memory cache for user subscriptions (for performance)
const userSubscriptionsCache = new Map<string, Set<string>>();

// Get all tickers a user is subscribed to
export async function getUserSubscriptions(userId: string): Promise<string[]> {
   const cachedSubscriptions = userSubscriptionsCache.get(userId);
   if (cachedSubscriptions) {
      return Array.from(cachedSubscriptions);
   }

   // If not in cache, return empty array - subscriptions will be tracked via commands
   return [];
}

// Helper function to update user subscriptions cache
function updateUserSubscriptionsCache(userId: string, ticker: string, isSubscribed: boolean) {
   if (!userSubscriptionsCache.has(userId)) {
      userSubscriptionsCache.set(userId, new Set());
   }

   const userSubs = userSubscriptionsCache.get(userId)!;
   if (isSubscribed) {
      userSubs.add(ticker);
   } else {
      userSubs.delete(ticker);
      if (userSubs.size === 0) {
         userSubscriptionsCache.delete(userId);
      }
   }
}

// In-memory cache for active tickers
const activeTickersCache = new Map<string, { subscriberCount: number; subscribers: string[] }>();

// Get all active tickers with their subscriber counts
export async function getActiveTickersWithCounts(): Promise<Record<string, { subscriberCount: number; subscribers: string[] }>> {
   const activeTickers: Record<string, { subscriberCount: number; subscribers: string[] }> = {};

   for (const [ticker, info] of activeTickersCache.entries()) {
      if (info.subscriberCount > 0) {
         activeTickers[ticker] = info;
      }
   }

   return activeTickers;
}

// Helper function to update active tickers cache
function updateActiveTickersCache(ticker: string, state: SubscriptionState) {
   if (state && state.subscriberCount > 0) {
      activeTickersCache.set(ticker, {
         subscriberCount: state.subscriberCount,
         subscribers: Array.from(state.subscribers),
      });
   } else {
      activeTickersCache.delete(ticker);
   }
}

// Check if a ticker has any subscribers
export async function hasSubscribers(ticker: string): Promise<boolean> {
   const state = await getSubscriptionState(ticker);
   return state !== null && state.subscriberCount > 0;
}

// Get subscriber count for a ticker
export async function getSubscriberCount(ticker: string): Promise<number> {
   const state = await getSubscriptionState(ticker);
   return state?.subscriberCount || 0;
}

// Export singleton instance
export const subscriptionStore = {
   handleCommand,
   getSubscriptionState,
   getSubscriptionEvents,
   getUserSubscriptions,
   getActiveTickersWithCounts,
   hasSubscribers,
   getSubscriberCount,
};
