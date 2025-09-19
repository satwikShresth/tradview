import { scraper } from './scraper.service';

interface PriceData {
   ticker: string;
   price: string | null;
   change?: string;
   timestamp: Date;
}

interface Consumer {
   id: string;
   callback: (data: PriceData) => void;
   ticker: string;
}

class Streamer {
   private consumers = new Map<string, Consumer>();
   private tickerConsumers = new Map<string, Set<string>>();
   private consumerCounter = 0;
   private globalUnsubscribe?: () => void;

   constructor() {
      this.globalUnsubscribe = scraper.onPrice((priceData: PriceData) => {
         this.broadcastToConsumers(priceData);
      });

      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());
   }

   private broadcastToConsumers(priceData: PriceData): void {
      const consumerIds = this.tickerConsumers.get(priceData.ticker);
      if (!consumerIds) return;

      for (const consumerId of consumerIds) {
         const consumer = this.consumers.get(consumerId);
         if (consumer) {
            Promise
               .resolve(consumer.callback(priceData))
               .catch((error) => console.error(`Error sending price data to consumer ${consumerId}:`, error))
         }
      }
   }

   public async subscribe(ticker: string, callback: (data: PriceData) => void): Promise<string> {
      const consumerId = `consumer_${++this.consumerCounter}`;

      const consumer: Consumer = {
         id: consumerId,
         callback,
         ticker
      };

      this.consumers.set(consumerId, consumer);

      if (!this.tickerConsumers.has(ticker)) {
         this.tickerConsumers.set(ticker, new Set());
      }

      this.tickerConsumers.get(ticker)!.add(consumerId);

      await scraper.addTicker(ticker);

      console.log(`Consumer ${consumerId} subscribed to ${ticker}. Total consumers: ${this.getConsumerCount(ticker)}`);

      return consumerId;
   }

   public async unsubscribe(consumerId: string): Promise<void> {

      const consumer = this.consumers.get(consumerId);
      if (!consumer) return;

      const ticker = consumer.ticker;
      this.consumers.delete(consumerId);

      const tickerConsumerSet = this.tickerConsumers.get(ticker);
      if (tickerConsumerSet) {
         tickerConsumerSet.delete(consumerId);

         console.log(`Consumer ${consumerId} unsubscribed from ${ticker}. Remaining consumers: ${tickerConsumerSet.size}`);

         if (tickerConsumerSet.size === 0) {
            this.tickerConsumers.delete(ticker);
            await scraper.removeTicker(ticker);
         }
      }
   }

   public getStreamInfo(): Array<{ ticker: string, consumerCount: number, isActive: boolean }> {
      return Array.from(this.tickerConsumers.entries()).map(([ticker, consumerSet]) => ({
         ticker,
         consumerCount: consumerSet.size,
         isActive: scraper.hasActiveTicker(ticker)
      }));
   }

   public getActiveTickers(): string[] {
      return Array.from(this.tickerConsumers.keys());
   }

   public hasConsumers(ticker: string): boolean {
      const consumerSet = this.tickerConsumers.get(ticker);
      return consumerSet ? consumerSet.size > 0 : false;
   }

   public getConsumerCount(ticker: string): number {
      const consumerSet = this.tickerConsumers.get(ticker);
      return consumerSet ? consumerSet.size : 0;
   }

   public getTotalConsumerCount(): number {
      return this.consumers.size;
   }

   public async cleanup(): Promise<void> {
      console.log('Streamer: Cleaning up all streams...');

      if (this.globalUnsubscribe) {
         this.globalUnsubscribe();
      }

      this.consumers.clear();
      this.tickerConsumers.clear();

      console.log('Streamer: Cleanup completed');
   }
}

export const streamer = new Streamer();
