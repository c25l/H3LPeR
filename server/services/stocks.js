const https = require('https');

class StocksService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.defaultSymbols = ['MSFT', 'NVDA', '^DJI', '^GSPC'];
  }

  async fetch(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getQuote(symbol) {
    const cacheKey = `quote-${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // Using Yahoo Finance v8 API
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const data = await this.fetch(url);

      if (!data.chart?.result?.[0]) {
        throw new Error(`No data for symbol: ${symbol}`);
      }

      const result = data.chart.result[0];
      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];

      const currentPrice = meta.regularMarketPrice || quote?.close?.[quote.close.length - 1];
      const previousClose = meta.previousClose || meta.chartPreviousClose;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;

      const quoteData = {
        symbol: meta.symbol,
        name: this.getSymbolName(symbol),
        price: currentPrice,
        previousClose,
        change,
        changePercent,
        currency: meta.currency || 'USD',
        marketState: meta.marketState,
        lastUpdated: new Date().toISOString()
      };

      this.setCache(cacheKey, quoteData);
      return quoteData;
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
      throw error;
    }
  }

  getSymbolName(symbol) {
    const names = {
      'MSFT': 'Microsoft',
      'NVDA': 'NVIDIA',
      '^DJI': 'Dow Jones',
      '^GSPC': 'S&P 500',
      'AAPL': 'Apple',
      'GOOGL': 'Alphabet',
      'AMZN': 'Amazon',
      'META': 'Meta',
      'TSLA': 'Tesla'
    };
    return names[symbol] || symbol;
  }

  async getQuotes(symbols = null) {
    const syms = symbols || this.defaultSymbols;
    const cacheKey = `quotes-${syms.join(',')}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const results = await Promise.allSettled(
      syms.map(symbol => this.getQuote(symbol))
    );

    const quotes = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    this.setCache(cacheKey, quotes);
    return quotes;
  }
}

module.exports = StocksService;
