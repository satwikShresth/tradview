import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { streamer } from './streamer.service';

interface PriceData {
   ticker: string;
   price: string | null;
   timestamp: Date;
}

type PriceCallback = (data: PriceData) => void;

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
   private callbacks = new Set<PriceCallback>();

   constructor() {
      process.on('SIGINT', async () => await scraper.cleanup());
      process.on('SIGTERM', async () => await scraper.cleanup());
   }

   private async init(): Promise<void> {
      if (this.browser) return;

      this.browser = await chromium.launch({ headless: false });
      this.context = await this.browser.newContext();
   }

   private checkExistingTicker(ticker: string): boolean {
      const existing = this.tickers.get(ticker);
      if (existing && !existing.page.isClosed()) {
         console.log(`${ticker} stream already exists and is healthy, reusing...`);
         return true;
      }
      return false;
   }

   private async navigateAndValidate(ticker: string, page: Page): Promise<void> {
      return page.goto(`https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`, {
         waitUntil: 'domcontentloaded',
         timeout: 5000
      })
         .then(async () => {
            const pageNotFoundText = await page
               .getByText('This isn\'t the page you\'re looking for Head back, or move along to the homepage')
               .first()
               .isVisible();

            if (pageNotFoundText) {
               console.log(`[Scraper] ${ticker} failed: Page not found`);
               await page.close();
               throw new Error(`Ticker ${ticker} not found on TradingView`);
            }

            await page.waitForSelector('.js-symbol-last', { timeout: 1000 });
         });
   }

   private async setupTicker(ticker: string, page: Page, controller: AbortController): Promise<void> {
      console.log(`[Scraper] ${ticker} validation successful`);

      await page.waitForLoadState('networkidle');
      const watcher = this.watchPrice(ticker, page, controller.signal);

      this.tickers.set(ticker, {
         page,
         lastPrice: null,
         controller,
         watcher
      });

      console.log(`${ticker} stream created and active`);
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
      const controller = new AbortController();

      await this.attemptAddTicker(ticker, page, controller);
   }

   private async handlePageRestart(ticker: string): Promise<Page | null> {
      console.log(`[Scraper] Page for ${ticker} was closed but consumers exist. Restarting...`);

      return this.context!.newPage()
         .then(async (newPage) => {
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
               this.broadcastPrice(priceData);
            }
         })
         .catch((error) => {
            console.warn(`${ticker} price extraction error:`, (error as Error).message);
         });
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
            if (streamer.hasConsumers(ticker)) {
               const newPage = await this.handlePageRestart(ticker);
               if (newPage) {
                  page = newPage;
                  continue;
               } else {
                  if (streamer.hasConsumers(ticker)) {
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
                  const priceElement = document.querySelector('.js-symbol-last') ||
                     document.querySelector('[data-symbol-price]') ||
                     document.querySelector('.price-value');

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
            const priceElement = document.querySelector('.js-symbol-last') ||
               document.querySelector('[data-symbol-price]') ||
               document.querySelector('.price-value');
            return priceElement?.textContent?.trim() || null;
         })
         .then((priceText) => {
            const cleanPrice = priceText!.replace(/\s+/g, '').trim();
            const priceMatch = cleanPrice.match(/^[\d,]+\.?\d*$/);
            return priceMatch
               ? cleanPrice
               : null;

         })
         .catch((error) => {
            console.log(`${ticker} price extraction error:`, error)
            return
         })

      if (!currentPrice) return null;

      const tickerInfo = this.tickers.get(ticker);

      if (tickerInfo) { tickerInfo.lastPrice = currentPrice }

      return {
         ticker,
         price: currentPrice,
         timestamp: new Date()
      };

   }

   private broadcastPrice(priceData: PriceData): void {
      console.log(`[${priceData.timestamp.toLocaleTimeString()}] ${priceData.ticker}: $${priceData.price}`);

      this.callbacks
         .forEach(callback => {
            Promise.resolve(callback(priceData)).catch(error => console.error('Callback error:', error))
         });
   }

   public async removeTicker(ticker: string): Promise<void> {
      const tickerInfo = this.tickers.get(ticker);

      if (!tickerInfo) return;
      tickerInfo.controller.abort();

      await Promise
         .race([tickerInfo.watcher, new Promise(resolve => setTimeout(resolve, 1000))])
         .catch(console.error)

      await tickerInfo
         .page
         .close()
         .catch((error) => console.error(`Error closing ${ticker} page:`, error))

      this.tickers.delete(ticker);
      console.log(`Removed ticker: ${ticker}`);
   }

   public onPrice(callback: PriceCallback) {
      this.callbacks.add(callback);
      return () => this.callbacks.delete(callback);
   }

   public getTickers(): string[] { return Array.from(this.tickers.keys()); }

   public hasActiveTicker(ticker: string): boolean {
      const tickerInfo = this.tickers.get(ticker);
      return !!(tickerInfo && !tickerInfo.page.isClosed());
   }

   public getCurrentPrices(): Record<string, string> {
      const result: Record<string, string> = {};
      this.tickers
         .forEach((info, ticker) => {
            if (info.lastPrice) { result[ticker] = info.lastPrice; }
         });
      return result;
   }

   public async cleanup(): Promise<void> {
      console.log('Cleaning up scraper...');

      const cleanupPromises = Array
         .from(this.tickers.keys())
         .map(ticker => this.removeTicker(ticker));

      await Promise.allSettled(cleanupPromises);

      if (this.context) {
         await this.context.close();
         this.context = null;
      }
      if (this.browser) {
         await this.browser.close();
         this.browser = null;
      }

      this.callbacks.clear();
      console.log('Cleanup completed');
   }
}

export const scraper = new Scraper();

