const express = require('express');
const router = express.Router();
const WeatherService = require('../services/weather');
const NewsService = require('../services/news');
const ResearchService = require('../services/research');
const StocksService = require('../services/stocks');
const ClaudeService = require('../services/claude');
const OpenAIResponsesService = require('../services/openai-responses');
const AstronomyService = require('../services/astronomy');
const { AppError, asyncHandler } = require('../middleware/error-handler');
const logger = require('../logger');

// Initialize services (will be overridden in setupHelperRoutes)
let weatherService = null;
let newsService = null;
let researchService = null;
let researchServiceAlt = null;
let stocksService = null;
let claudeService = null;
let secondaryRankerService = null;
let astronomyService = null;

function setupHelperRoutes(config, embeddingsService) {
  // Initialize Claude service for ranking
  claudeService = new ClaudeService();
  if (claudeService.isAvailable()) {
    logger.info('helper', 'Claude service initialized for ranking');
  } else {
    logger.warn('helper', 'Claude service not available - ranking will use fallback');
  }

  secondaryRankerService = new OpenAIResponsesService();
  if (secondaryRankerService.isAvailable()) {
    logger.info('helper', 'Secondary AI service initialized for research ranking');
  } else {
    logger.warn('helper', 'Secondary AI service not available - secondary ranking will use fallback');
  }

  weatherService = new WeatherService(config);
  newsService = new NewsService(config, embeddingsService, claudeService);
  researchService = new ResearchService(config, claudeService, {
    dataDirName: 'research',
    cacheKeyPrefix: 'research',
    rankerLabel: 'Claude Ranker',
    rankerModel: claudeService?.model
  });
  researchServiceAlt = new ResearchService(config, secondaryRankerService, {
    dataDirName: 'research-alt',
    cacheKeyPrefix: 'research-alt',
    rankerLabel: 'Secondary Ranker',
    rankerModel: secondaryRankerService?.model
  });
  stocksService = new StocksService();
  astronomyService = new AstronomyService(config);
  astronomyService.initialize().catch(err => logger.error('helper', 'Failed to initialize astronomy service', err));

  // --- Scheduled refreshes ---

  // Research: refresh every 24 hours
  setInterval(async () => {
    try {
      logger.info('scheduler', 'Refreshing research...');
      await researchService.getResearch(null, true);
      await researchServiceAlt.getResearch(null, true);
      logger.info('scheduler', 'Research refreshed');
    } catch (err) {
      logger.error('scheduler', 'Research refresh failed', err);
    }
  }, 24 * 60 * 60 * 1000);

  // News + tech news: refresh every 6 hours
  setInterval(async () => {
    try {
      logger.info('scheduler', 'Refreshing news...');
      await newsService.getNews(true);
      logger.info('scheduler', 'News refreshed');
    } catch (err) {
      logger.error('scheduler', 'News refresh failed', err);
    }
  }, 6 * 60 * 60 * 1000);

  // Startup warm-up (staggered)
  setTimeout(() => researchService.getResearch().catch(e =>
    logger.error('scheduler', 'Initial research failed', e)), 5000);
  setTimeout(() => researchServiceAlt.getResearch().catch(e =>
    logger.error('scheduler', 'Initial secondary research failed', e)), 7000);
  setTimeout(() => newsService.getNews().catch(e =>
    logger.error('scheduler', 'Initial news failed', e)), 15000);
}

// === WEATHER ENDPOINTS ===

router.get('/weather', asyncHandler(async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    throw new AppError('lat and lon query parameters are required', 400, 'MISSING_PARAM');
  }

  const weather = await weatherService.getCombinedWeather(
    parseFloat(lat),
    parseFloat(lon)
  );
  res.json(weather);
}));

router.get('/weather/local', asyncHandler(async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    throw new AppError('lat and lon query parameters are required', 400, 'MISSING_PARAM');
  }

  const weather = await weatherService.getLocalWeather(
    parseFloat(lat),
    parseFloat(lon)
  );
  res.json(weather);
}));

router.get('/weather/space', asyncHandler(async (req, res) => {
  const space = await weatherService.getSpaceWeather();
  res.json(space);
}));

router.get('/weather/alerts', asyncHandler(async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    throw new AppError('lat and lon query parameters are required', 400, 'MISSING_PARAM');
  }

  const alerts = await weatherService.getAlerts(
    parseFloat(lat),
    parseFloat(lon)
  );
  res.json(alerts);
}));

// === SKY / ASTRONOMY ENDPOINTS ===

router.get('/sky', asyncHandler(async (req, res) => {
  const { lat, lon, time } = req.query;

  if (!lat || !lon) {
    throw new AppError('lat and lon query parameters are required', 400, 'MISSING_PARAM');
  }

  let date = new Date();
  if (time) {
    const parsed = Number.isNaN(Number(time)) ? new Date(time) : new Date(Number(time));
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError('time query parameter must be a valid ISO string or epoch milliseconds', 400, 'INVALID_PARAM');
    }
    date = parsed;
  }

  const skyData = await astronomyService.getSkyData(
    parseFloat(lat),
    parseFloat(lon),
    date
  );
  res.json(skyData);
}));

// === NEWS ENDPOINTS ===

router.get('/news', asyncHandler(async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const news = await newsService.getNews(forceRefresh);
  res.json(news);
}));

// === RESEARCH ENDPOINTS ===

router.get('/research', asyncHandler(async (req, res) => {
  const { date } = req.query;
  const forceRefresh = req.query.refresh === 'true';
  const research = await researchService.getResearch(date, forceRefresh);
  res.json(research);
}));

router.get('/research/alt', asyncHandler(async (req, res) => {
  const { date } = req.query;
  const forceRefresh = req.query.refresh === 'true';
  const research = await researchServiceAlt.getResearch(date, forceRefresh);
  res.json(research);
}));

router.get('/research/dates', (req, res) => {
  const dates = researchService.getAvailableDates();
  res.json(dates);
});

router.get('/research/alt/dates', (req, res) => {
  const dates = researchServiceAlt.getAvailableDates();
  res.json(dates);
});

// === STOCKS ENDPOINTS ===

router.get('/stocks', asyncHandler(async (req, res) => {
  const { symbols } = req.query;
  const symbolList = symbols ? symbols.split(',') : null;
  const quotes = await stocksService.getQuotes(symbolList);
  res.json(quotes);
}));

// === REFRESH ENDPOINT ===

router.post('/refresh', asyncHandler(async (req, res) => {
  const { service } = req.body;

  switch (service) {
    case 'weather': {
      if (!req.body.lat || !req.body.lon) {
        throw new AppError('lat and lon required for weather refresh', 400, 'MISSING_PARAM');
      }
      const weather = await weatherService.getCombinedWeather(
        parseFloat(req.body.lat),
        parseFloat(req.body.lon)
      );
      res.json({ service: 'weather', data: weather });
      break;
    }

    case 'news': {
      const news = await newsService.getNews(true);
      res.json({ service: 'news', data: news });
      break;
    }

    case 'research': {
      const research = await researchService.getResearch(null, true);
      res.json({ service: 'research', data: research });
      break;
    }

    case 'research-alt': {
      const researchAlt = await researchServiceAlt.getResearch(null, true);
      res.json({ service: 'research-alt', data: researchAlt });
      break;
    }

    case 'stocks': {
      const stocks = await stocksService.getQuotes();
      res.json({ service: 'stocks', data: stocks });
      break;
    }

    default:
      throw new AppError('Unknown service. Valid options: weather, news, research, stocks', 400, 'INVALID_PARAM');
  }
}));

module.exports = router;
module.exports.setupHelperRoutes = setupHelperRoutes;
