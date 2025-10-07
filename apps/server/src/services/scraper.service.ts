import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { priceStore } from '../utils/price.store';
import { EventEmitter } from 'events';

// Global event emitter for price updates
export const globalPriceEmitter = new EventEmitter();
globalPriceEmitter.setMaxListeners(0);

interface PriceData {
   ticker: string;
   price: string | null;
   timestamp: Date;
}

interface TickerInfo {
   page: Page;
   lastPrice: string | null;
   controller: AbortController;
   watcher: Promise<void>;
}

class Scraper {
   private browser: Browser | null = null;
   private context: BrowserContext | null = null;
   private tickers = new Map<string, TickerInfo>();

   constructor() {
      process.on('SIGINT', async () => await this.cleanup());
      process.on('SIGTERM', async () => await this.cleanup());
   }

   private async init(): Promise<void> {
      if (this.browser) return;

      console.log('[Scraper] 🚀 Initializing browser context...');
      this.browser = await chromium.launch({
         headless: false,
         args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-plugins',
            '--disable-images',
            '--disable-javascript-harmony-shipping',
            '--disable-background-networking'
         ]
      });
      this.context = await this.browser.newContext();
      console.log('[Scraper] ✅ Browser context initialized successfully');
   }

   private checkExistingTicker(ticker: string): boolean {
      const existing = this.tickers.get(ticker);
      if (existing && !existing.page.isClosed()) {
         console.log(`[Scraper] ♻️ ${ticker} stream already exists and is healthy, reusing...`);
         return true;
      }
      if (existing) {
         console.log(`[Scraper] 💀 ${ticker} stream exists but page is closed, will recreate...`);
      }
      return false;
   }

   private async setupResourceBlocking(page: Page): Promise<void> {
      await page.route('**/*', (route) => {
         const resourceType = route.request().resourceType();
         ['image', 'font', 'media'].includes(resourceType)
            ? route.abort()
            : route.continue();
      });
   }

   private async navigateAndValidate(ticker: string, page: Page): Promise<void> {
      console.log(`[Scraper] 🌐 Navigating to TradingView page for ${ticker}...`);
      return page.goto(`https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`, {
         waitUntil: 'domcontentloaded',
         timeout: 5000
      })
         .then(async () => {
            console.log(`[Scraper] ✅ Page loaded for ${ticker}, checking for errors...`);
            const pageNotFoundText = await page
               .getByText('This isn\'t the page you\'re looking for Head back, or move along to the homepage')
               .first()
               .isVisible();

            if (pageNotFoundText) {
               console.error(`[Scraper] ❌ ${ticker} failed: Page not found on TradingView`);
               await page.close();
               throw new Error(`Ticker ${ticker} not found on TradingView`);
            }

            console.log(`[Scraper] 🔍 Waiting for price selector for ${ticker}...`);
            await page.waitForSelector('.js-symbol-last', { timeout: 5000 });
            console.log(`[Scraper] ✅ Price selector found for ${ticker}`);
         });
   }

   private async setupTicker(ticker: string, page: Page, controller: AbortController): Promise<void> {
      console.log(`[Scraper] 🎯 Setting up ticker ${ticker}...`);

      console.log(`[Scraper] ⏳ Waiting for network idle for ${ticker}...`);
      await page.waitForLoadState('networkidle');

      console.log(`[Scraper] 👀 Starting price watcher for ${ticker}...`);
      const watcher = this.watchPrice(ticker, page, controller.signal);

      this.tickers.set(ticker, {
         page,
         lastPrice: null,
         controller,
         watcher
      });

      console.log(`[Scraper] ✅ ${ticker} stream created and active`);
   }

   private async attemptAddTicker(ticker: string, page: Page, controller: AbortController): Promise<void> {
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
         console.log(`[Scraper] Adding ${ticker} - attempt ${attempt}/${maxRetries}`);

         await this.navigateAndValidate(ticker, page)
            .then(() => this.setupTicker(ticker, page, controller))
            .catch(async (error) => {
               console.log(`[Scraper] ${ticker} attempt ${attempt} failed:`, (error as Error).message);

               if (attempt === maxRetries) {
                  console.log(`[Scraper] ${ticker} failed after ${maxRetries} attempts`);
                  if (!page.isClosed()) {
                     await page.close();
                  }
                  throw new Error(`Failed to add ticker ${ticker}: ${(error as Error).message}`);
               }

               await new Promise(resolve => setTimeout(resolve, 500));
            });

         if (this.tickers.has(ticker)) {
            return;
         }
      }
   }

   public async addTicker(ticker: string): Promise<void> {
      await this.init();

      if (this.checkExistingTicker(ticker)) {
         return;
      }

      const existing = this.tickers.get(ticker);
      if (existing) {
         await this.removeTicker(ticker);
      }

      const page = await this.context!.newPage();

      // Setup resource blocking with stylesheets allowed
      await this.setupResourceBlocking(page);
      console.log(`[Scraper] 🚫 Resource blocking configured for ${ticker} (stylesheets allowed)`);

      const controller = new AbortController();

      await this.attemptAddTicker(ticker, page, controller);
   }

   // Legacy method for compatibility with existing routes
   public async trackTicker(ticker: string): Promise<void> {
      return this.addTicker(ticker);
   }

   private async handlePageRestart(ticker: string): Promise<Page | null> {
      console.log(`[Scraper] Page for ${ticker} was closed but consumers exist. Restarting...`);

      return this.context!.newPage()
         .then(async (newPage) => {
            // Setup resource blocking for the new page
            await this.setupResourceBlocking(newPage);

            return newPage.goto(`https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`, {
               waitUntil: 'domcontentloaded',
               timeout: 10000
            })
               .then(() => newPage.waitForSelector('.js-symbol-last', { timeout: 5000 }))
               .then(() => newPage.waitForLoadState('networkidle'))
               .then(() => {
                  const tickerInfo = this.tickers.get(ticker);
                  if (tickerInfo) {
                     tickerInfo.page = newPage;
                     console.log(`[Scraper] Successfully restarted page for ${ticker}`);
                     return newPage;
                  }
                  return null;
               });
         })
         .catch(async (error) => {
            console.error(`[Scraper] Failed to restart page for ${ticker}:`, (error as Error).message);
            return null;
         });
   }

   private async handlePriceChange(ticker: string, page: Page): Promise<void> {
      return this.extractPrice(ticker, page)
         .then((priceData) => {
            if (priceData) {
               // Store-based approach: directly update the price store
               this.updatePriceStore(priceData);
            }
         })
         .catch((error) => {
            console.warn(`${ticker} price extraction error:`, (error as Error).message);
         });
   }

   private async updatePriceStore(priceData: PriceData): Promise<void> {
      const streamId = `${priceData.ticker}_BINANCE`;
      // Remove commas before parsing to handle prices like "115,730.65"
      const price = parseFloat((priceData.price || '0').replace(/,/g, ''));

      try {
         console.log(`[Scraper] 💾 Updating price store for ${priceData.ticker}:`);
         console.log(`  Original string: "${priceData.price}"`);
         console.log(`  Parsed number: ${price}`);

         // Update the Emmett price store
         const result = await priceStore.handleCommand(streamId, {
            type: 'UpdatePrice',
            symbol: priceData.ticker,
            price: price,
            change: 0, // We don't calculate change in polling mode
            volume: undefined,
            exchange: 'BINANCE',
         });

         // Emit price update event for real-time streaming to routes
         // Send the original formatted string to preserve formatting
         if (result.success && result.newEvents) {
            for (const event of result.newEvents) {
               // Override the price with the original formatted string
               const modifiedEvent = {
                  ...event,
                  data: {
                     ...event.data,
                     price: priceData.price, // Use original string format
                  }
               };
               globalPriceEmitter.emit('priceUpdate', streamId, modifiedEvent);
            }
         }

         console.log(`[Scraper] ✅ Price store updated and emitted for ${priceData.ticker}: "${priceData.price}"`);
      } catch (error) {
         console.error(`[Scraper] ❌ Error updating price store for ${priceData.ticker}:`, error);
      }
   }

   private async handleWatchError(ticker: string, page: Page, error: any, signal: AbortSignal): Promise<void> {
      if (signal.aborted) return;

      if (page.isClosed()) {
         return;
      }

      if (error.name !== 'TimeoutError') {
         console.warn(`${ticker} watcher error:`, error.message);
         await page.waitForTimeout(2000);
      }
   }

   private async watchPrice(ticker: string, page: Page, signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
         // Handle page closure
         if (page.isClosed()) {
            if (this.hasConsumers(ticker)) {
               const newPage = await this.handlePageRestart(ticker);
               if (newPage) {
                  page = newPage;
                  continue;
               } else {
                  if (this.hasConsumers(ticker)) {
                     await new Promise(resolve => setTimeout(resolve, 5000));
                     continue;
                  } else {
                     break;
                  }
               }
            } else {
               console.log(`[Scraper] Page for ${ticker} was closed and no consumers exist. Stopping watcher.`);
               break;
            }
         }

         await page
            .waitForFunction(
               (currentPrice) => {
                  // Use the same selector logic as extractPrice
                  const selectors = ['.js-symbol-last', '[data-symbol-price]', '.price-value'];
                  let priceElement = null;

                  for (const selector of selectors) {
                     const element = document.querySelector(selector);
                     if (element) {
                        priceElement = element;
                        break;
                     }
                  }

                  if (!priceElement) return false;

                  const newPrice = priceElement.textContent?.replace(/\s+/g, '').trim();
                  return newPrice && newPrice !== currentPrice;
               },
               this.tickers.get(ticker)?.lastPrice || '',
               { timeout: 30000, polling: 1000 }
            )
            .then(() => this.handlePriceChange(ticker, page))
            .catch((error) => this.handleWatchError(ticker, page, error, signal));
      }

      console.log(`[Scraper] Watcher for ${ticker} stopped`);
   }

   private async extractPrice(ticker: string, page: Page): Promise<PriceData | null> {
      const currentPrice = await page
         .evaluate(() => {
            // Try multiple selectors and log what we find
            const selectors = ['.js-symbol-last', '[data-symbol-price]', '.price-value'];
            let priceElement = null;
            let usedSelector = '';

            for (const selector of selectors) {
               const element = document.querySelector(selector);
               if (element) {
                  priceElement = element;
                  usedSelector = selector;
                  break;
               }
            }

            if (!priceElement) {
               // Log available elements for debugging
               const allPriceElements = document.querySelectorAll('[class*="price"], [class*="last"], [data-symbol-price]');
               console.log('Available price-related elements:', Array.from(allPriceElements).map(el => ({
                  tagName: el.tagName,
                  className: el.className,
                  textContent: el.textContent?.trim().substring(0, 50)
               })));
               return null;
            }

            const text = priceElement.textContent?.trim() || null;
            console.log(`Found price using selector "${usedSelector}": "${text}"`);
            return text;
         })
         .then((priceText) => {
            if (!priceText) {
               console.log(`[Scraper] 🔍 No price text found for ${ticker}`);
               return null;
            }

            console.log(`[Scraper] 🔍 Raw price text for ${ticker}: "${priceText}"`);

            const cleanPrice = priceText.replace(/\s+/g, '').trim();
            console.log(`[Scraper] 🔍 Cleaned price for ${ticker}: "${cleanPrice}"`);

            const priceMatch = cleanPrice.match(/^[\d,]+\.?\d*$/);
            if (priceMatch) {
               console.log(`[Scraper] ✅ Valid price extracted for ${ticker}: "${cleanPrice}"`);
               return cleanPrice;
            } else {
               console.log(`[Scraper] ❌ Invalid price format for ${ticker}: "${cleanPrice}"`);
               return null;
            }
         })
         .catch((error) => {
            console.log(`[Scraper] ❌ ${ticker} price extraction error:`, error);
            return null;
         });

      if (!currentPrice) {
         console.log(`[Scraper] ⚠️ No current price extracted for ${ticker}`);
         return null;
      }

      const tickerInfo = this.tickers.get(ticker);

      if (tickerInfo) {
         tickerInfo.lastPrice = currentPrice;
      }

      console.log(`[Scraper] 💰 Price data created for ${ticker}: $${currentPrice}`);

      return {
         ticker,
         price: currentPrice,
         timestamp: new Date()
      };
   }

   // Removed broadcastPrice method - now using store-based approach

   public async removeTicker(ticker: string): Promise<void> {
      console.log(`[Scraper] 🗑️ Removing ticker: ${ticker}...`);
      const tickerInfo = this.tickers.get(ticker);

      if (!tickerInfo) {
         console.warn(`[Scraper] ⚠️ Ticker ${ticker} not found, nothing to remove`);
         return;
      }

      console.log(`[Scraper] 🛑 Aborting watcher for ${ticker}...`);
      tickerInfo.controller.abort();

      console.log(`[Scraper] ⏳ Waiting for watcher cleanup for ${ticker}...`);
      await Promise
         .race([tickerInfo.watcher, new Promise(resolve => setTimeout(resolve, 1000))])
         .catch(error => console.error(`[Scraper] ❌ Watcher cleanup error for ${ticker}:`, error))

      console.log(`[Scraper] 🚪 Closing page for ${ticker}...`);
      await tickerInfo
         .page
         .close()
         .catch((error) => console.error(`[Scraper] ❌ Error closing ${ticker} page:`, error))

      this.tickers.delete(ticker);
      console.log(`[Scraper] ✅ Successfully removed ticker: ${ticker}`);
   }

   // Legacy method for compatibility
   public async stopTicker(ticker: string): Promise<void> {
      return this.removeTicker(ticker);
   }

   // Removed onPrice callback method - now using store-based approach
   // Use globalPriceEmitter.on('priceUpdate', ...) for listening to price updates

   public getTickers(): string[] {
      return Array.from(this.tickers.keys());
   }

   // Legacy method for compatibility
   public getTrackedTickers(): string[] {
      return this.getTickers();
   }

   // Legacy method for compatibility
   public isTracking(ticker: string): boolean {
      return this.hasActiveTicker(ticker);
   }

   public hasActiveTicker(ticker: string): boolean {
      const tickerInfo = this.tickers.get(ticker);
      return !!(tickerInfo && !tickerInfo.page.isClosed());
   }

   // Helper method to check if ticker has consumers (for compatibility)
   private hasConsumers(ticker: string): boolean {
      // In the polling version, we assume there are always consumers if the ticker exists
      return this.tickers.has(ticker);
   }

   public getCurrentPrices(): Record<string, string> {
      const result: Record<string, string> = {};
      this.tickers
         .forEach((info, ticker) => {
            if (info.lastPrice) { result[ticker] = info.lastPrice; }
         });
      return result;
   }

   // Legacy method for compatibility
   public async getTrackingStatus(): Promise<Record<string, any>> {
      const status: Record<string, any> = {};

      for (const [ticker, info] of this.tickers.entries()) {
         status[ticker] = {
            isTracking: true,
            isConnected: !info.page.isClosed(),
            lastUpdate: info.lastPrice ? new Date().toISOString() : null,
            totalUpdates: 0, // Not tracked in polling mode
            currentPrice: info.lastPrice || null,
         };
      }

      return status;
   }

   // Legacy method for compatibility
   public async restartTicker(ticker: string): Promise<void> {
      console.log(`[Scraper] 🔄 Restarting ticker: ${ticker}`);
      await this.removeTicker(ticker);
      await this.addTicker(ticker);
   }

   public async cleanup(): Promise<void> {
      console.log('[Scraper] 🧹 Starting scraper cleanup...');

      const tickerCount = this.tickers.size;
      console.log(`[Scraper] 📊 Cleaning up ${tickerCount} active tickers...`);

      const cleanupPromises = Array
         .from(this.tickers.keys())
         .map(ticker => this.removeTicker(ticker));

      await Promise.allSettled(cleanupPromises);

      if (this.context) {
         console.log('[Scraper] 🚪 Closing browser context...');
         await this.context.close();
         this.context = null;
      }
      if (this.browser) {
         console.log('[Scraper] 🚪 Closing browser...');
         await this.browser.close();
         this.browser = null;
      }

      console.log(`[Scraper] ✅ Cleanup completed - removed ${tickerCount} tickers`);
   }
}

export const scraper = new Scraper();
