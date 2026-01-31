const https = require('https');
const http = require('http');

class WeatherService {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour
  }

  async fetch(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Writer-App/1.0 (contact@example.com)',
          'Accept': 'application/json'
        }
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Handle relative redirects
          const redirectUrl = response.headers.location.startsWith('http') 
            ? response.headers.location 
            : new URL(response.headers.location, url).href;
          this.fetch(redirectUrl).then(resolve).catch(reject);
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
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

  async fetchText(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Writer-App/1.0 (contact@example.com)',
          'Accept': 'text/plain'
        }
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          this.fetchText(response.headers.location).then(resolve).catch(reject);
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
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

  async getLocalWeather(lat, lon) {
    const cacheKey = `weather-${lat}-${lon}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // Get grid point info
      const pointUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointData = await this.fetch(pointUrl);

      if (!pointData.properties) {
        throw new Error('Invalid response from weather.gov');
      }

      // Get forecast
      const forecastUrl = pointData.properties.forecast;
      const forecastData = await this.fetch(forecastUrl);

      // Get current conditions from observation stations
      const stationsUrl = pointData.properties.observationStations;
      let currentConditions = null;

      try {
        const stationsData = await this.fetch(stationsUrl);
        if (stationsData.features && stationsData.features.length > 0) {
          const stationId = stationsData.features[0].properties.stationIdentifier;
          const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
          const obsData = await this.fetch(obsUrl);
          if (obsData.properties) {
            currentConditions = {
              temperature: obsData.properties.temperature?.value,
              temperatureUnit: 'C',
              humidity: obsData.properties.relativeHumidity?.value,
              windSpeed: obsData.properties.windSpeed?.value,
              windDirection: obsData.properties.windDirection?.value,
              description: obsData.properties.textDescription,
              icon: obsData.properties.icon
            };
          }
        }
      } catch (e) {
        console.warn('Could not fetch current conditions:', e.message);
      }

      const result = {
        location: {
          city: pointData.properties.relativeLocation?.properties?.city,
          state: pointData.properties.relativeLocation?.properties?.state,
          lat,
          lon
        },
        current: currentConditions,
        forecast: forecastData.properties?.periods?.slice(0, 7).map(period => ({
          name: period.name,
          temperature: period.temperature,
          temperatureUnit: period.temperatureUnit,
          windSpeed: period.windSpeed,
          windDirection: period.windDirection,
          shortForecast: period.shortForecast,
          detailedForecast: period.detailedForecast,
          icon: period.icon,
          isDaytime: period.isDaytime,
          startTime: period.startTime
        })) || []
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching local weather:', error);
      throw error;
    }
  }

  async getAlerts(lat, lon) {
    const cacheKey = `alerts-${lat}-${lon}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
      const data = await this.fetch(url);

      const alerts = (data.features || []).map(alert => {
        const normalized = this.normalizeAlertText(alert.properties);
        const isFire = this.isFireAlert(normalized);
        const isSevere = this.isSevereAlert(alert.properties?.severity, normalized);
        const tags = [];
        if (isSevere) tags.push('severe');
        if (isFire) tags.push('fire');

        return {
          id: alert.properties.id,
          event: alert.properties.event,
          headline: alert.properties.headline,
          description: alert.properties.description,
          severity: alert.properties.severity,
          urgency: alert.properties.urgency,
          effective: alert.properties.effective,
          expires: alert.properties.expires,
          senderName: alert.properties.senderName,
          isSevere,
          isFire,
          tags
        };
      });

      this.setCache(cacheKey, alerts);
      return alerts;
    } catch (error) {
      console.error('Error fetching weather alerts:', error);
      return [];
    }
  }

  normalizeAlertText(properties) {
    const fields = [
      properties?.event,
      properties?.headline,
      properties?.description,
      properties?.instruction
    ];
    return fields
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  isFireAlert(text) {
    if (!text) return false;
    const fireKeywords = [
      'fire weather',
      'red flag',
      'fire warning',
      'wildfire',
      'smoke',
      'burn ban',
      'extreme fire',
      'grass fire'
    ];
    return fireKeywords.some(keyword => text.includes(keyword));
  }

  isSevereAlert(severity, text) {
    const normalizedSeverity = (severity || '').toLowerCase();
    if (normalizedSeverity === 'severe' || normalizedSeverity === 'extreme') {
      return true;
    }
    if (!text) return false;
    const severeKeywords = [
      'tornado',
      'hurricane',
      'typhoon',
      'tropical storm',
      'severe thunderstorm',
      'flash flood',
      'flood warning',
      'blizzard',
      'ice storm',
      'derecho',
      'storm surge',
      'extreme wind',
      'high wind warning'
    ];
    return severeKeywords.some(keyword => text.includes(keyword));
  }

  async getSpaceWeather() {
    const cacheKey = 'space-weather';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const results = await Promise.allSettled([
        this.fetchKpIndex(),
        this.fetchSolarFlux(),
        this.fetchXrayFlux(),
        this.fetchSolarWind()
      ]);

      const result = {
        kp: results[0].status === 'fulfilled' ? results[0].value : null,
        solarFlux: results[1].status === 'fulfilled' ? results[1].value : null,
        xrayFlux: results[2].status === 'fulfilled' ? results[2].value : null,
        solarWind: results[3].status === 'fulfilled' ? results[3].value : null,
        lastUpdated: new Date().toISOString()
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching space weather:', error);
      throw error;
    }
  }

  async fetchKpIndex() {
    try {
      // 3-day Kp forecast
      const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
      const data = await this.fetch(url);

      if (Array.isArray(data) && data.length > 1) {
        // Skip header row
        const forecasts = data.slice(1).map(row => ({
          time: row[0],
          kp: parseFloat(row[1]),
          observed: row[2] === 'observed'
        }));

        // Find the last observed value as current
        const observedValues = forecasts.filter(f => f.observed);
        const current = observedValues.length > 0 
          ? observedValues[observedValues.length - 1] 
          : forecasts[0];
        
        // Max should only be from observed values in last 24 hours (8 3-hour periods)
        const recentObserved = observedValues.slice(-8);
        const max = recentObserved.length > 0
          ? Math.max(...recentObserved.map(f => f.kp))
          : current?.kp;

        return {
          current: current?.kp,
          max,
          forecasts: forecasts.slice(0, 12), // Next 12 periods
          level: this.getKpLevel(max || current?.kp || 0)
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching Kp index:', error);
      return null;
    }
  }

  getKpLevel(kp) {
    if (kp >= 8) return { level: 'extreme', color: '#ff0000', label: 'Extreme Storm (G4-G5)' };
    if (kp >= 6) return { level: 'severe', color: '#ff6600', label: 'Strong Storm (G3)' };
    if (kp >= 5) return { level: 'moderate', color: '#ffcc00', label: 'Moderate Storm (G1-G2)' };
    if (kp >= 4) return { level: 'active', color: '#99cc00', label: 'Active' };
    return { level: 'quiet', color: '#00cc00', label: 'Quiet' };
  }

  async fetchSolarFlux() {
    try {
      const url = 'https://services.swpc.noaa.gov/products/summary/10cm-flux.json';
      const data = await this.fetch(url);
      return {
        value: parseFloat(data.Flux),
        timeTag: data.TimeStamp
      };
    } catch (error) {
      console.error('Error fetching solar flux:', error);
      return null;
    }
  }

  async fetchXrayFlux() {
    try {
      const url = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json';
      const data = await this.fetch(url);

      if (Array.isArray(data) && data.length > 0) {
        const latest = data[data.length - 1];
        return {
          flux: latest.flux,
          time: latest.time_tag,
          level: this.getXrayLevel(latest.flux)
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching X-ray flux:', error);
      return null;
    }
  }

  getXrayLevel(flux) {
    if (flux >= 1e-4) return { class: 'X', color: '#ff0000' };
    if (flux >= 1e-5) return { class: 'M', color: '#ff6600' };
    if (flux >= 1e-6) return { class: 'C', color: '#ffcc00' };
    if (flux >= 1e-7) return { class: 'B', color: '#99cc00' };
    return { class: 'A', color: '#00cc00' };
  }

  async fetchSolarWind() {
    try {
      const url = 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json';
      const data = await this.fetch(url);
      return {
        speed: parseFloat(data.WindSpeed),
        timeTag: data.TimeStamp
      };
    } catch (error) {
      console.error('Error fetching solar wind:', error);
      return null;
    }
  }

  async getCombinedWeather(lat, lon) {
    const [localWeather, alerts, spaceWeather] = await Promise.all([
      this.getLocalWeather(lat, lon).catch(e => ({ error: e.message })),
      this.getAlerts(lat, lon).catch(() => []),
      this.getSpaceWeather().catch(e => ({ error: e.message }))
    ]);

    const severeAlerts = (alerts || []).filter(alert => alert.isSevere);
    const fireAlerts = (alerts || []).filter(alert => alert.isFire);

    return {
      local: localWeather,
      alerts,
      severeAlerts,
      fireAlerts,
      space: spaceWeather,
      location: {
        lat: lat.toFixed(4),
        lon: lon.toFixed(4),
        name: localWeather?.location?.city 
          ? `${localWeather.location.city}, ${localWeather.location.state}`
          : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`
      },
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = WeatherService;
