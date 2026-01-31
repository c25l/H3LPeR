// Weather Tab - Local Weather + Space Weather + Star Chart
let weatherData = null;
let refreshInterval = null;
let userLocation = null;
let starChartModule = null;
let starChartInitialized = false;
let starChartExpanded = false;

// Default location (can be overridden by geolocation)
const DEFAULT_LOCATION = { lat: 40.7128, lon: -74.0060, name: 'New York, NY' };

export async function initWeatherTab() {
  console.log('Initializing Weather tab...');

  // Load star chart preference
  starChartExpanded = localStorage.getItem('star-chart-expanded') === 'true';

  // Try to get user's location
  await getUserLocation();

  // Initial load
  await loadWeatherData();

  // Setup refresh button
  document.getElementById('refresh-weather')?.addEventListener('click', () => {
    loadWeatherData(true);
  });

  // Auto-refresh every hour
  refreshInterval = setInterval(() => loadWeatherData(), 60 * 60 * 1000);
}

async function getUserLocation() {
  // Check for stored location preference
  const stored = localStorage.getItem('weather-location');
  if (stored) {
    try {
      userLocation = JSON.parse(stored);
      return;
    } catch (e) {
      // Invalid stored location
    }
  }

  // Try geolocation
  if ('geolocation' in navigator) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          maximumAge: 300000 // 5 minutes
        });
      });
      userLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        name: 'Current Location'
      };
      localStorage.setItem('weather-location', JSON.stringify(userLocation));
      return;
    } catch (e) {
      console.warn('Geolocation failed:', e.message);
    }
  }

  // Fall back to default
  userLocation = DEFAULT_LOCATION;
}

async function loadWeatherData(forceRefresh = false) {
  const container = document.getElementById('weather-content');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const url = `/api/helper/weather?lat=${userLocation.lat}&lon=${userLocation.lon}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to load weather data');
    }

    weatherData = await response.json();
    renderWeather();
  } catch (error) {
    console.error('Error loading weather:', error);
    container.innerHTML = `
      <div class="empty-state">
        <h2>Weather Unavailable</h2>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="window.loadWeatherData(true)">Retry</button>
      </div>
    `;
  }
}

function renderWeather() {
  const container = document.getElementById('weather-content');
  if (!container || !weatherData) return;

  const locationName = weatherData.location?.name
    || (weatherData.local?.location?.city
      ? `${weatherData.local.location.city}, ${weatherData.local.location.state}`
      : userLocation.name);

  const locationCoords = weatherData.location?.lat && weatherData.location?.lon
    ? `${weatherData.location.lat}°, ${weatherData.location.lon}°`
    : '';

  container.innerHTML = `
    <div class="weather-grid">
      <div class="weather-local">
        <div class="weather-section-header">
          <h3>Local Weather</h3>
          <span class="weather-location">
            ${escapeHtml(locationName)}
            ${locationCoords ? `<span class="weather-coords" style="font-size: 0.85em; opacity: 0.7; margin-left: 0.5rem;">${locationCoords}</span>` : ''}
          </span>
        </div>
        ${renderLocalWeather()}
        ${renderAlerts()}
      </div>
      <div class="weather-space">
        <div class="weather-section-header">
          <h3>Space Weather</h3>
          <span class="weather-updated">Updated: ${formatTime(weatherData.space?.lastUpdated)}</span>
        </div>
        ${renderSpaceWeather()}
      </div>
    </div>
    <div class="star-chart-section ${starChartExpanded ? 'expanded' : 'collapsed'}">
      <div class="orrery-section" style="width: 600px; height: 600px; margin: 0 auto;">
        <div class="orrery-header">
          <h3>Solar System Orrery</h3>
          <span class="orrery-subtitle">True-time positions · simplified distances</span>
        </div>
        <div class="orrery-content" id="orrery-container">
          <div class="loading-spinner"></div>
        </div>
      </div>
      <div class="night-sky-section" style="width: 600px; height: 600px; margin: 1rem auto 0;">
        <div class="star-chart-header" onclick="window.toggleStarChart()">
          <span class="star-chart-toggle">${starChartExpanded ? '▼' : '▶'}</span>
          <h3>Night Sky</h3>
          <span class="star-chart-subtitle">Interactive star chart with planets & ISS</span>
        </div>
        <div class="star-chart-content" id="star-chart-container" style="display: ${starChartExpanded ? 'block' : 'none'};">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;

  // Initialize star chart module for orrery + sky data
  initStarChartIfNeeded();
}

function renderLocalWeather() {
  const local = weatherData.local;
  if (local?.error) {
    return `<div class="weather-error">${escapeHtml(local.error)}</div>`;
  }

  let html = '';

  // Current conditions
  if (local?.current) {
    const tempF = local.current.temperatureUnit === 'C'
      ? (local.current.temperature * 9/5) + 32
      : local.current.temperature;

    html += `
      <div class="weather-current">
        <div class="current-temp">${Math.round(tempF)}°F</div>
        <div class="current-conditions">
          <span class="current-desc">${escapeHtml(local.current.description || 'N/A')}</span>
          ${local.current.humidity ? `<span class="current-humidity">Humidity: ${Math.round(local.current.humidity)}%</span>` : ''}
        </div>
      </div>
    `;
  }

  // Forecast
  if (local?.forecast?.length > 0) {
    html += '<div class="weather-forecast">';
    local.forecast.forEach(period => {
      const icon = getWeatherIcon(period.shortForecast, period.isDaytime);
      html += `
        <div class="forecast-period ${period.isDaytime ? 'daytime' : 'nighttime'}">
          <div class="period-name">${escapeHtml(period.name)}</div>
          <div class="period-icon">${icon}</div>
          <div class="period-temp">${period.temperature}°${period.temperatureUnit}</div>
          <div class="period-desc">${escapeHtml(period.shortForecast)}</div>
          <div class="period-wind">${escapeHtml(period.windSpeed)} ${escapeHtml(period.windDirection)}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  return html || '<p class="text-muted">No forecast available</p>';
}

function renderAlerts() {
  const alerts = weatherData.alerts || [];
  const severeAlerts = weatherData.severeAlerts || alerts.filter(alert => alert.isSevere);
  const fireAlerts = weatherData.fireAlerts || alerts.filter(alert => alert.isFire);
  const otherAlerts = alerts.filter(alert => !alert.isSevere && !alert.isFire);

  if (alerts.length === 0) {
    return '';
  }

  let html = '<div class="weather-alerts">';

  if (severeAlerts.length > 0) {
    html += renderAlertGroup('Severe Weather Alerts', severeAlerts, 'severe');
  }

  if (fireAlerts.length > 0) {
    html += renderAlertGroup('Fire Weather Alerts', fireAlerts, 'fire');
  }

  if (otherAlerts.length > 0) {
    html += renderAlertGroup('Other Alerts', otherAlerts, 'other');
  }

  html += '</div>';
  return html;
}

function renderAlertGroup(title, alerts, groupType) {
  let html = `
    <div class="weather-alert-group weather-alert-group-${groupType}">
      <div class="alert-group-title">${escapeHtml(title)}</div>
  `;

  alerts.forEach(alert => {
    html += renderAlertItem(alert, groupType);
  });

  html += '</div>';
  return html;
}

function renderAlertItem(alert, groupType) {
  const severityClass = getSeverityClass(alert.severity);
  const fireClass = alert.isFire ? 'fire-alert' : '';
  const severeClass = alert.isSevere ? 'severe-alert' : '';
  const tags = (alert.tags || []).map(tag => {
    const label = tag === 'fire' ? 'Fire' : 'Severe';
    const tagClass = tag === 'fire' ? 'alert-badge-fire' : 'alert-badge-severe';
    return `<span class="alert-badge ${tagClass}">${label}</span>`;
  }).join('');

  return `
    <div class="weather-alert ${severityClass} ${fireClass} ${severeClass}" data-group="${groupType}">
      <div class="alert-header">
        <span class="alert-event">${escapeHtml(alert.event)}</span>
        <span class="alert-severity">${escapeHtml(alert.severity)}</span>
      </div>
      ${tags ? `<div class="alert-tags">${tags}</div>` : ''}
      <div class="alert-headline">${escapeHtml(alert.headline)}</div>
      <div class="alert-expires">Expires: ${formatTime(alert.expires)}</div>
    </div>
  `;
}

function renderSpaceWeather() {
  const space = weatherData.space;
  if (space?.error) {
    return `<div class="weather-error">${escapeHtml(space.error)}</div>`;
  }

  if (!space) {
    return '<p class="text-muted">Space weather data unavailable</p>';
  }

  let html = '<div class="space-weather-cards">';

  // Kp Index
  if (space.kp) {
    const kpLevel = space.kp.level || { color: '#888', label: 'Unknown' };
    html += `
      <div class="space-card kp-card">
        <div class="space-card-title">Kp Index</div>
        <div class="kp-gauge">
          <div class="kp-value" style="color: ${kpLevel.color}">${space.kp.current?.toFixed(1) || 'N/A'}</div>
          <div class="kp-max">Max: ${space.kp.max?.toFixed(1) || 'N/A'}</div>
        </div>
        <div class="kp-level" style="background-color: ${kpLevel.color}">${kpLevel.label}</div>
      </div>
    `;
  }

  // Solar Flux
  if (space.solarFlux) {
    html += `
      <div class="space-card">
        <div class="space-card-title">10.7cm Solar Flux</div>
        <div class="space-card-value">${space.solarFlux.value || 'N/A'} SFU</div>
        <div class="space-card-time">${formatTime(space.solarFlux.timeTag)}</div>
      </div>
    `;
  }

  // X-ray Flux
  if (space.xrayFlux) {
    const xrayLevel = space.xrayFlux.level || { class: '?', color: '#888' };
    html += `
      <div class="space-card">
        <div class="space-card-title">X-ray Flux</div>
        <div class="space-card-value">
          <span class="xray-class" style="color: ${xrayLevel.color}">${xrayLevel.class}</span>
          <span class="xray-flux">${space.xrayFlux.flux?.toExponential(2) || 'N/A'}</span>
        </div>
        <div class="space-card-time">${formatTime(space.xrayFlux.time)}</div>
      </div>
    `;
  }

  // Solar Wind
  if (space.solarWind) {
    html += `
      <div class="space-card">
        <div class="space-card-title">Solar Wind Speed</div>
        <div class="space-card-value">${space.solarWind.speed || 'N/A'} km/s</div>
        <div class="space-card-time">${formatTime(space.solarWind.timeTag)}</div>
      </div>
    `;
  }

  html += '</div>';

  // Activity summary
  html += `
    <div class="space-activity-summary">
      <h4>Activity Level</h4>
      ${getActivitySummary(space)}
    </div>
  `;

  return html;
}

function getActivitySummary(space) {
  const indicators = [];

  if (space.kp?.current) {
    const kp = space.kp.current;
    if (kp >= 5) indicators.push({ level: 'high', text: 'Geomagnetic storm conditions' });
    else if (kp >= 4) indicators.push({ level: 'moderate', text: 'Active geomagnetic conditions' });
    else indicators.push({ level: 'low', text: 'Quiet geomagnetic conditions' });
  }

  if (space.xrayFlux?.level) {
    const cls = space.xrayFlux.level.class;
    if (cls === 'X') indicators.push({ level: 'high', text: 'X-class flare activity' });
    else if (cls === 'M') indicators.push({ level: 'moderate', text: 'M-class flare activity' });
    else indicators.push({ level: 'low', text: 'Low solar flare activity' });
  }

  if (indicators.length === 0) {
    return '<p class="text-muted">Activity data unavailable</p>';
  }

  return indicators.map(ind =>
    `<div class="activity-indicator ${ind.level}">${escapeHtml(ind.text)}</div>`
  ).join('');
}

function getWeatherIcon(forecast, isDaytime) {
  const f = forecast.toLowerCase();
  if (f.includes('thunder') || f.includes('storm')) return '⛈️';
  if (f.includes('rain') || f.includes('shower')) return '🌧️';
  if (f.includes('snow')) return '❄️';
  if (f.includes('cloudy') || f.includes('overcast')) return '☁️';
  if (f.includes('partly')) return isDaytime ? '⛅' : '☁️';
  if (f.includes('fog') || f.includes('mist')) return '🌫️';
  if (f.includes('wind')) return '💨';
  if (f.includes('clear') || f.includes('sunny')) return isDaytime ? '☀️' : '🌙';
  return isDaytime ? '🌤️' : '🌙';
}

function getSeverityClass(severity) {
  switch (severity?.toLowerCase()) {
    case 'extreme': return 'severity-extreme';
    case 'severe': return 'severity-severe';
    case 'moderate': return 'severity-moderate';
    case 'minor': return 'severity-minor';
    default: return '';
  }
}

function formatTime(isoString) {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

async function initStarChartIfNeeded() {
  if (starChartInitialized) {
    // Just refresh if already initialized
    if (starChartModule) {
      starChartModule.refreshChart();
    }
    return;
  }

  try {
    starChartModule = await import('./star-chart.js');
    starChartModule.initStarChart('star-chart-container', userLocation);
    starChartInitialized = true;
  } catch (error) {
    console.error('Error loading star chart:', error);
    const container = document.getElementById('star-chart-container');
    if (container) {
      container.innerHTML = `
        <div class="star-chart-error">
          <p>Failed to load star chart</p>
          <p class="text-muted">${error.message}</p>
        </div>
      `;
    }
  }
}

function toggleStarChart() {
  starChartExpanded = !starChartExpanded;

  const section = document.querySelector('.star-chart-section');
  const content = document.getElementById('star-chart-container');
  const toggle = document.querySelector('.star-chart-toggle');

  if (section) {
    section.classList.toggle('expanded', starChartExpanded);
    section.classList.toggle('collapsed', !starChartExpanded);
  }

  if (content) {
    content.style.display = starChartExpanded ? 'block' : 'none';
  }

  if (toggle) {
    toggle.textContent = starChartExpanded ? '▼' : '▶';
  }

  if (starChartExpanded) {
    initStarChartIfNeeded();
  }

  // Save preference
  localStorage.setItem('star-chart-expanded', starChartExpanded);
}

// Expose for global access
window.loadWeatherData = loadWeatherData;
window.toggleStarChart = toggleStarChart;

export function cleanupWeatherTab() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
