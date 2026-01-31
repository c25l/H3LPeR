const https = require('https');
const Astronomy = require('astronomy-engine');

class AstronomyService {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes for dynamic data
    this.starCatalog = null;
    this.constellationLines = null;
  }

  async initialize() {
    // Load star catalog and constellation data
    this.starCatalog = require('../data/stars.json');
    this.constellationLines = require('../data/constellations.json');
    console.log(`Loaded ${this.starCatalog.length} stars and ${Object.keys(this.constellationLines).length} constellations`);
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

  async fetch(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'User-Agent': 'Writer-App/1.0',
          'Accept': 'application/json'
        }
      }, (response) => {
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

  // Get ISS position
  async getISSPosition() {
    const cacheKey = 'iss-position';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetch('https://api.wheretheiss.at/v1/satellites/25544');
      const result = {
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        velocity: data.velocity,
        visibility: data.visibility,
        timestamp: data.timestamp
      };
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching ISS position:', error);
      return null;
    }
  }

  // Get ISS passes for a location
  async getISSPasses(lat, lon) {
    const cacheKey = `iss-passes-${lat.toFixed(2)}-${lon.toFixed(2)}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${this.getNextHourTimestamps()}&units=kilometers`;
      const data = await this.fetch(url);
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching ISS passes:', error);
      return [];
    }
  }

  getNextHourTimestamps() {
    const now = Math.floor(Date.now() / 1000);
    const timestamps = [];
    for (let i = 0; i < 60; i += 5) {
      timestamps.push(now + i * 60);
    }
    return timestamps.join(',');
  }

  // Calculate planet positions using astronomy-engine
  getPlanetPositions(lat, lon, date = new Date()) {
    const observer = new Astronomy.Observer(lat, lon, 0);
    const planets = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
    const positions = [];

    for (const planet of planets) {
      try {
        const body = Astronomy.Body[planet];
        const equ = Astronomy.Equator(body, date, observer, true, true);
        const hor = Astronomy.Horizon(date, observer, equ.ra, equ.dec, 'normal');

        // Get elongation from sun to determine visibility
        const elongation = Astronomy.Elongation(body, date);

        positions.push({
          name: planet,
          ra: equ.ra,
          dec: equ.dec,
          altitude: hor.altitude,
          azimuth: hor.azimuth,
          magnitude: this.getPlanetMagnitude(planet, date),
          elongation: elongation.elongation,
          visible: hor.altitude > 0
        });
      } catch (e) {
        console.warn(`Could not calculate position for ${planet}:`, e.message);
      }
    }

    return positions;
  }

  getPlanetMagnitude(planet, date) {
    // Approximate visual magnitudes (these vary)
    const baseMagnitudes = {
      'Mercury': 0.0,
      'Venus': -4.0,
      'Mars': 0.5,
      'Jupiter': -2.0,
      'Saturn': 0.5,
      'Uranus': 5.7,
      'Neptune': 7.8
    };
    return baseMagnitudes[planet] || 0;
  }

  // Heliocentric orrery data (true-time positions)
  getOrreryData(date = new Date()) {
    const bodies = [
      { name: 'Mercury', body: Astronomy.Body.Mercury },
      { name: 'Venus', body: Astronomy.Body.Venus },
      { name: 'Earth', body: Astronomy.Body.Earth },
      { name: 'Mars', body: Astronomy.Body.Mars },
      { name: 'Jupiter', body: Astronomy.Body.Jupiter },
      { name: 'Saturn', body: Astronomy.Body.Saturn },
      { name: 'Uranus', body: Astronomy.Body.Uranus },
      { name: 'Neptune', body: Astronomy.Body.Neptune },
      { name: 'Pluto', body: Astronomy.Body.Pluto }
    ];

    const planets = [];

    bodies.forEach(({ name, body }) => {
      if (!body) return;
      try {
        const vector = Astronomy.HelioVector(body, date);
        if (!vector) return;

        const x = vector.x;
        const y = vector.y;
        const z = vector.z;
        const distanceAu = Math.sqrt(x * x + y * y + z * z);
        const angleDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

        planets.push({
          name,
          x,
          y,
          z,
          distanceAu,
          angleDeg
        });
      } catch (e) {
        console.warn(`Could not calculate heliocentric vector for ${name}:`, e.message);
      }
    });

    return {
      timestamp: date.toISOString(),
      planets
    };
  }

  // Get moon phase and position
  getMoonInfo(lat, lon, date = new Date()) {
    const observer = new Astronomy.Observer(lat, lon, 0);

    try {
      const equ = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
      const hor = Astronomy.Horizon(date, observer, equ.ra, equ.dec, 'normal');
      const phase = Astronomy.MoonPhase(date);
      const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);

      return {
        ra: equ.ra,
        dec: equ.dec,
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        phase: phase,
        phaseName: this.getMoonPhaseName(phase),
        illumination: illum.phase_fraction * 100,
        visible: hor.altitude > 0
      };
    } catch (e) {
      console.warn('Could not calculate moon position:', e.message);
      return null;
    }
  }

  getMoonPhaseName(phase) {
    if (phase < 22.5) return 'New Moon';
    if (phase < 67.5) return 'Waxing Crescent';
    if (phase < 112.5) return 'First Quarter';
    if (phase < 157.5) return 'Waxing Gibbous';
    if (phase < 202.5) return 'Full Moon';
    if (phase < 247.5) return 'Waning Gibbous';
    if (phase < 292.5) return 'Last Quarter';
    if (phase < 337.5) return 'Waning Crescent';
    return 'New Moon';
  }

  // Get sun position (for twilight calculations)
  getSunInfo(lat, lon, date = new Date()) {
    const observer = new Astronomy.Observer(lat, lon, 0);

    try {
      const equ = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
      const hor = Astronomy.Horizon(date, observer, equ.ra, equ.dec, 'normal');

      // Calculate twilight times
      const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, date, 1);
      const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, date, 1);

      return {
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        sunrise: sunrise?.date?.toISOString() || null,
        sunset: sunset?.date?.toISOString() || null,
        isDaytime: hor.altitude > 0,
        twilight: this.getTwilightType(hor.altitude)
      };
    } catch (e) {
      console.warn('Could not calculate sun position:', e.message);
      return null;
    }
  }

  getTwilightType(altitude) {
    if (altitude > 0) return 'day';
    if (altitude > -6) return 'civil';
    if (altitude > -12) return 'nautical';
    if (altitude > -18) return 'astronomical';
    return 'night';
  }

  // Get complete sky data
  async getSkyData(lat, lon, date = new Date()) {
    if (!this.starCatalog) {
      await this.initialize();
    }

    const [issPosition, issPasses] = await Promise.all([
      this.getISSPosition(),
      this.getISSPasses(lat, lon)
    ]);

    // Calculate ISS equatorial position from lat/lon
    let issEquatorial = null;
    if (issPosition) {
      issEquatorial = this.issToEquatorial(issPosition, lat, lon, date);
    }

    return {
      stars: this.starCatalog,
      constellations: this.constellationLines,
      planets: this.getPlanetPositions(lat, lon, date),
      orrery: this.getOrreryData(date),
      moon: this.getMoonInfo(lat, lon, date),
      sun: this.getSunInfo(lat, lon, date),
      iss: {
        position: issPosition,
        equatorial: issEquatorial,
        passes: issPasses
      },
      observer: {
        latitude: lat,
        longitude: lon,
        timestamp: date.toISOString()
      }
    };
  }

  // Convert ISS geodetic position to equatorial coordinates as seen from observer
  issToEquatorial(issPos, obsLat, obsLon, date) {
    // This is a simplified calculation - for accurate tracking you'd want
    // to use the full SGP4 propagator with TLE data
    const observer = new Astronomy.Observer(obsLat, obsLon, 0);

    // Calculate the ISS position vector relative to observer
    // Using a simplified approach: treat ISS as a point at its altitude
    const issAlt = issPos.altitude; // km
    const issLat = issPos.latitude;
    const issLon = issPos.longitude;

    // Calculate angular distance
    const dLat = (issLat - obsLat) * Math.PI / 180;
    const dLon = (issLon - obsLon) * Math.PI / 180;
    const lat1 = obsLat * Math.PI / 180;
    const lat2 = issLat * Math.PI / 180;

    // Haversine for angular separation
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    // Calculate altitude angle (simplified)
    const earthRadius = 6371; // km
    const distance = Math.sqrt((earthRadius + issAlt)**2 + earthRadius**2 -
                               2 * (earthRadius + issAlt) * earthRadius * Math.cos(c));
    const altitude = Math.asin((earthRadius + issAlt) * Math.sin(c) / distance) * 180 / Math.PI;

    // Calculate azimuth
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const azimuth = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    // Convert alt/az back to RA/Dec (approximate)
    // This requires knowing the local sidereal time
    const lst = this.getLocalSiderealTime(obsLon, date);

    // Alt/Az to RA/Dec
    const altRad = altitude * Math.PI / 180;
    const azRad = azimuth * Math.PI / 180;
    const latRad = obsLat * Math.PI / 180;

    const sinDec = Math.sin(altRad) * Math.sin(latRad) +
                   Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
    const dec = Math.asin(sinDec) * 180 / Math.PI;

    const cosHA = (Math.sin(altRad) - Math.sin(latRad) * sinDec) /
                  (Math.cos(latRad) * Math.cos(Math.asin(sinDec)));
    let ha = Math.acos(Math.max(-1, Math.min(1, cosHA))) * 180 / Math.PI;
    if (Math.sin(azRad) > 0) ha = 360 - ha;

    const ra = (lst - ha + 360) % 360;

    return {
      ra: ra / 15, // Convert to hours
      dec: dec,
      altitude: altitude,
      azimuth: azimuth,
      visible: altitude > 0
    };
  }

  getLocalSiderealTime(longitude, date) {
    // Calculate Local Sidereal Time
    const jd = this.dateToJulian(date);
    const t = (jd - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
               0.000387933 * t * t - t * t * t / 38710000;
    gmst = gmst % 360;
    if (gmst < 0) gmst += 360;
    return (gmst + longitude + 360) % 360;
  }

  dateToJulian(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }
}

module.exports = AstronomyService;
