// Star Chart Module - D3-based interactive sky map
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

let skyData = null;
let svg = null;
let projection = null;
let zoom = null;
let currentRotation = [0, 0];
let observerLocation = null;
let showConstellations = false;
let showLabels = true;
let magnitudeLimit = 2.5;
let selectedTime = null;

const specialTargets = [
  { name: 'Galactic Center', ra: 17.7611, dec: -29.0078, color: '#d8b36a' },
  { name: 'Andromeda (M31)', ra: 0.7122, dec: 41.2692, color: '#9fc6ff' },
  { name: 'Alpha Centauri', ra: 14.6600, dec: -60.8339, color: '#ffd2a1' }
];

// Color mapping from B-V index to star color
function starColor(bv) {
  if (bv === null || bv === undefined) return '#ffffff';
  if (bv < -0.33) return '#9bb0ff'; // O - blue
  if (bv < -0.02) return '#aabfff'; // B - blue-white
  if (bv < 0.30) return '#cad7ff';  // A - white
  if (bv < 0.58) return '#f8f7ff';  // F - yellow-white
  if (bv < 0.81) return '#fff4ea';  // G - yellow (like Sun)
  if (bv < 1.40) return '#ffd2a1';  // K - orange
  return '#ffcc6f';                  // M - red-orange
}

// Planet colors
const planetColors = {
  Mercury: '#b5b5b5',
  Venus: '#ffffcc',
  Earth: '#7db3ff',
  Mars: '#ff6b4a',
  Jupiter: '#ffcc99',
  Saturn: '#ffe4b5',
  Uranus: '#b5f4ea',
  Neptune: '#5b5ddf',
  Pluto: '#b7b7b7'
};

const orreryColors = {
  ...planetColors,
  Sun: '#ffd27f'
};

// Calculate star display radius from magnitude
function starRadius(mag) {
  // Brighter stars (lower magnitude) get larger radius
  const minMag = -1.5;
  const maxMag = 6.0;
  const minRadius = 0.8;
  const maxRadius = 5;
  const normalized = (maxMag - mag) / (maxMag - minMag);
  return minRadius + normalized * (maxRadius - minRadius);
}

// Convert RA/Dec to projection coordinates
function celestialToScreen(ra, dec) {
  // RA is in hours (0-24), convert to degrees (0-360)
  // Dec is already in degrees (-90 to 90)
  const lambda = (ra * 15) - 180; // Convert to longitude (-180 to 180)
  const phi = dec; // Latitude
  return projection([lambda, phi]);
}

// Check if a point is visible (not clipped by projection)
function isVisible(ra, dec) {
  const coords = celestialToScreen(ra, dec);
  return coords !== null;
}

// Calculate current sidereal time for centering the view
function getLocalSiderealTime(longitude, date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
             0.000387933 * t * t - t * t * t / 38710000;
  gmst = gmst % 360;
  if (gmst < 0) gmst += 360;
  return (gmst + longitude + 360) % 360;
}

export function initStarChart(container, location) {
  observerLocation = {
    ...location,
    lat: Number(location.lat),
    lon: Number(location.lon)
  };

  const containerEl = typeof container === 'string'
    ? document.getElementById(container)
    : container;

  if (!containerEl) {
    console.error('Star chart container not found');
    return;
  }

  setupOrrery();

  // Clear existing content
  containerEl.innerHTML = `
    <div class="star-chart-wrapper">
      <div class="star-chart-controls">
        <div class="star-chart-control-group">
          <label>
            <input type="checkbox" id="show-constellations" ${showConstellations ? 'checked' : ''}>
            Constellations
          </label>
          <label>
            <input type="checkbox" id="show-labels" ${showLabels ? 'checked' : ''}>
            Labels
          </label>
        </div>
        <div class="star-chart-control-group star-chart-time">
          <span>Time</span>
          <span id="sky-time-value"></span>
          <div class="star-chart-time-controls">
            <button id="sky-time-back" class="btn btn-sm btn-secondary">-1h</button>
            <button id="sky-time-now" class="btn btn-sm btn-secondary">Now</button>
            <button id="sky-time-forward" class="btn btn-sm btn-secondary">+1h</button>
          </div>
        </div>
        <div class="star-chart-control-group">
          <label>
            Mag limit:
            <input type="range" id="mag-limit" min="2" max="6" step="0.5" value="${magnitudeLimit}">
            <span id="mag-limit-value">${magnitudeLimit.toFixed(1)}</span>
          </label>
        </div>
        <div class="star-chart-control-group">
          <button id="center-sky" class="btn btn-sm btn-secondary">Center on Zenith</button>
          <button id="reset-zoom" class="btn btn-sm btn-secondary">Reset Zoom</button>
        </div>
      </div>
      <div class="star-chart-svg-container" id="star-chart-svg-container">
        <div class="loading-spinner"></div>
      </div>
      <div class="star-chart-legend">
        <div class="legend-item"><span class="legend-dot planet"></span> Planets</div>
        <div class="legend-item"><span class="legend-dot moon"></span> Moon</div>
        <div class="legend-item"><span class="legend-dot iss"></span> ISS</div>
      </div>
      <div class="star-chart-info" id="star-chart-info"></div>
    </div>
  `;

  // Setup event listeners
  document.getElementById('show-constellations').addEventListener('change', (e) => {
    showConstellations = e.target.checked;
    updateChart();
  });

  document.getElementById('show-labels').addEventListener('change', (e) => {
    showLabels = e.target.checked;
    updateChart();
  });

  document.getElementById('mag-limit').addEventListener('input', (e) => {
    magnitudeLimit = parseFloat(e.target.value);
    document.getElementById('mag-limit-value').textContent = magnitudeLimit.toFixed(1);
    updateChart();
  });

  const timeValue = document.getElementById('sky-time-value');
  setSelectedTime(new Date(), { refresh: false });

  document.getElementById('sky-time-now').addEventListener('click', () => {
    setSelectedTime(new Date(), { refresh: true });
  });

  document.getElementById('sky-time-back').addEventListener('click', () => {
    shiftTimeByMinutes(-60);
  });

  document.getElementById('sky-time-forward').addEventListener('click', () => {
    shiftTimeByMinutes(60);
  });

  document.getElementById('center-sky').addEventListener('click', centerOnZenith);
  document.getElementById('reset-zoom').addEventListener('click', resetZoom);

  // Load sky data
  loadSkyData();
}

function setSelectedTime(date, { refresh = true } = {}) {
  if (!date) return;
  selectedTime = new Date(date);

  const timeValue = document.getElementById('sky-time-value');
  if (timeValue) {
    timeValue.textContent = formatTimeLabel(selectedTime);
  }

  if (refresh) {
    updateRotationForTime(selectedTime);
    loadSkyData();
  }
}

function shiftTimeByMinutes(deltaMinutes) {
  const base = selectedTime ? new Date(selectedTime) : new Date();
  const totalMinutes = (base.getHours() * 60) + base.getMinutes() + deltaMinutes;
  const wrappedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const shifted = buildTimeFromMinutes(base, wrappedMinutes);
  setSelectedTime(shifted, { refresh: true });
}

function setupOrrery() {
  const orreryContainer = document.getElementById('orrery-container');
  if (!orreryContainer) return;

  orreryContainer.innerHTML = `
    <div class="orrery-svg-container" id="orrery-svg-container">
      <div class="loading-spinner"></div>
    </div>
    <div class="orrery-footer">
      <span id="orrery-timestamp"></span>
      <span>Sun-centered · equal spacing (true angles)</span>
    </div>
  `;
}

async function loadSkyData() {
  const svgContainer = document.getElementById('star-chart-svg-container');

  try {
    const timeParam = selectedTime ? `&time=${encodeURIComponent(selectedTime.toISOString())}` : '';
    const url = `/api/helper/sky?lat=${observerLocation.lat}&lon=${observerLocation.lon}${timeParam}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to load sky data');
    }

    skyData = await response.json();
    renderOrrery();
    updateRotationForTime(selectedTime || new Date());
    if (!svg) {
      await waitForContainer(svgContainer);
      if ((svgContainer?.clientWidth || 0) > 0 && (svgContainer?.clientHeight || 0) > 0) {
        createChart();
      }
    } else {
      updateChart();
    }
    updateInfo();
  } catch (error) {
    console.error('Error loading sky data:', error);
    svgContainer.innerHTML = `
      <div class="star-chart-error">
        <p>Failed to load sky data</p>
        <p class="text-muted">${error.message}</p>
      </div>
    `;
  }
}

function renderOrrery() {
  const orreryData = skyData?.orrery;
  const svgContainer = document.getElementById('orrery-svg-container');
  if (!svgContainer) return;
  if (!orreryData || !Array.isArray(orreryData.planets)) {
    svgContainer.innerHTML = '<div class="star-chart-error"><p>Orrery data unavailable</p></div>';
    return;
  }

  const timestampEl = document.getElementById('orrery-timestamp');
  if (timestampEl && skyData?.observer?.timestamp) {
    timestampEl.textContent = `Time: ${formatTimeLabel(new Date(skyData.observer.timestamp))}`;
  }

  const planets = [...orreryData.planets]
    .filter(p => Number.isFinite(p.distanceAu) && Number.isFinite(p.angleDeg))
    .sort((a, b) => a.distanceAu - b.distanceAu);

  if (planets.length === 0) {
    svgContainer.innerHTML = '<div class="star-chart-error"><p>Orrery data unavailable</p></div>';
    return;
  }

  svgContainer.innerHTML = '';
  const width = svgContainer.clientWidth || 640;
  const height = svgContainer.clientHeight || 240;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 18;

  const ringCount = planets.length;
  const minRing = 12;
  const ringStep = ringCount > 1 ? (radius - minRing) / (ringCount - 1) : 0;

  const svgOrrery = d3.select(svgContainer)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'orrery-svg');

  const g = svgOrrery.append('g')
    .attr('transform', `translate(${centerX}, ${centerY})`);

  // Axes
  g.append('line')
    .attr('x1', -radius)
    .attr('y1', 0)
    .attr('x2', radius)
    .attr('y2', 0)
    .attr('stroke', '#2f3b55')
    .attr('stroke-width', 0.7);

  g.append('line')
    .attr('x1', 0)
    .attr('y1', -radius)
    .attr('x2', 0)
    .attr('y2', radius)
    .attr('stroke', '#2f3b55')
    .attr('stroke-width', 0.7);

  // Orbit rings (equal spacing)
  planets.forEach((planet, index) => {
    const r = minRing + (ringStep * index);
    g.append('circle')
      .attr('r', r)
      .attr('fill', 'none')
      .attr('stroke', '#3a4a66')
      .attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '2,4')
      .attr('stroke-opacity', 0.7);
  });

  // Sun
  g.append('circle')
    .attr('r', 5)
    .attr('fill', orreryColors.Sun)
    .attr('stroke', '#bfa15a')
    .attr('stroke-width', 1.2);

  g.append('text')
    .attr('x', 8)
    .attr('y', 4)
    .attr('fill', '#c8b98a')
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .text('Sun');

  // Planets
  planets.forEach((planet, index) => {
    const angleRad = (planet.angleDeg * Math.PI) / 180;
    const r = minRing + (ringStep * index);
    const x = Math.cos(angleRad) * r;
    const y = Math.sin(angleRad) * r;

    const color = orreryColors[planet.name] || '#d6dbe6';

    g.append('circle')
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', planet.name === 'Jupiter' ? 4 : 3)
      .attr('fill', color)
      .attr('stroke', '#1a1f2b')
      .attr('stroke-width', 0.8);

    g.append('text')
      .attr('x', x + 6)
      .attr('y', y + 3)
      .attr('fill', '#c8d2e8')
      .attr('font-size', '9px')
      .text(planet.name);
  });

  // Deep-sky targets (fixed reference markers)
  const targetRing = radius + 8;
  specialTargets.forEach((target) => {
    const angleRad = (target.ra / 24) * Math.PI * 2;
    const x = Math.cos(angleRad) * targetRing;
    const y = Math.sin(angleRad) * targetRing;

    g.append('circle')
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', 3.5)
      .attr('fill', target.color)
      .attr('stroke', '#f5f7ff')
      .attr('stroke-width', 0.9)
      .attr('opacity', 0.95);

    g.append('text')
      .attr('x', x + 6)
      .attr('y', y + 3)
      .attr('fill', '#e6ecff')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .text(target.name);
  });

}

function createChart() {
  const container = document.getElementById('star-chart-svg-container');
  container.innerHTML = '';

  const width = container.clientWidth || 600;
  const height = container.clientHeight || 500;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 20;

  // Create SVG
  svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'star-chart-svg');

  // Add definitions for gradients and filters
  const defs = svg.append('defs');

  // Sky gradient
  const skyGradient = defs.append('radialGradient')
    .attr('id', 'sky-gradient')
    .attr('cx', '50%')
    .attr('cy', '50%')
    .attr('r', '50%');

  skyGradient.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', '#0b1020');

  skyGradient.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', '#020308');

  // Glow filter for bright stars
  const glow = defs.append('filter')
    .attr('id', 'star-glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');

  glow.append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', '2')
    .attr('result', 'blur');

  glow.append('feMerge')
    .selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic'])
    .enter()
    .append('feMergeNode')
    .attr('in', d => d);

  // Subtle glow for constellation lines
  const constellationGlow = defs.append('filter')
    .attr('id', 'constellation-glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');

  constellationGlow.append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', '0.7')
    .attr('result', 'blur');

  constellationGlow.append('feMerge')
    .selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic'])
    .enter()
    .append('feMergeNode')
    .attr('in', d => d);

  const clipPath = defs.append('clipPath')
    .attr('id', 'sky-clip');

  clipPath.append('circle')
    .attr('r', radius);

  // Create main group for transformations
  const g = svg.append('g')
    .attr('class', 'star-chart-main')
    .attr('transform', `translate(${centerX}, ${centerY})`);

  // Sky background circle
  g.append('circle')
    .attr('class', 'sky-background')
    .attr('r', radius)
    .attr('fill', 'url(#sky-gradient)')
    .attr('stroke', '#2b3448')
    .attr('stroke-width', 1.25);

  // Setup projection - stereographic for star chart
  // Center on local sidereal time for current sky
  const lst = getLocalSiderealTime(observerLocation.lon, selectedTime || new Date());
  currentRotation = [lst - 180, -observerLocation.lat];

  projection = d3.geoStereographic()
    .scale(radius)
    .translate([0, 0])
    .rotate(currentRotation)
    .clipAngle(90);

  // Disable zoom/pan drag behavior
  zoom = null;

  // Create zoomable group
  const zoomGroup = g.append('g')
    .attr('class', 'zoomable')
    .attr('clip-path', 'url(#sky-clip)');

  // Draw coordinate grid
  drawGrid(zoomGroup, radius);

  // Draw constellation lines
  const constellationGroup = zoomGroup.append('g').attr('class', 'constellations');

  // Draw stars
  const starsGroup = zoomGroup.append('g').attr('class', 'stars');

  // Draw planets
  const planetsGroup = zoomGroup.append('g').attr('class', 'planets');

  // Draw moon
  const moonGroup = zoomGroup.append('g').attr('class', 'moon');

  // Draw ISS
  const issGroup = zoomGroup.append('g').attr('class', 'iss');

  // Draw labels (on top)
  const labelsGroup = zoomGroup.append('g').attr('class', 'labels');

  // Initial render
  updateChart();

  // Tooltip
  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'star-chart-tooltip')
    .style('opacity', 0);

  // Store references for updates
  svg.node().__chartData = {
    g, zoomGroup, constellationGroup, starsGroup, planetsGroup,
    moonGroup, issGroup, labelsGroup, tooltip, radius
  };
}

function drawGrid(group, radius) {
  const path = d3.geoPath().projection(projection);

  // Create graticule
  const graticuleMajor = d3.geoGraticule()
    .step([15, 10]); // 15° in RA (1 hour), 10° in Dec

  const graticuleMinor = d3.geoGraticule()
    .step([5, 5]); // finer grid for classic star map look

  group.append('path')
    .datum(graticuleMinor)
    .attr('class', 'graticule graticule-minor')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#2a3b55')
    .attr('stroke-width', 0.4)
    .attr('stroke-opacity', 0.35)
    .attr('stroke-dasharray', '2,4');

  group.append('path')
    .datum(graticuleMajor)
    .attr('class', 'graticule graticule-major')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#3c506f')
    .attr('stroke-width', 0.7)
    .attr('stroke-opacity', 0.6);

  // Horizon circle (Dec = 0 from observer's perspective)
  group.append('circle')
    .attr('class', 'horizon')
    .attr('r', radius)
    .attr('fill', 'none')
    .attr('stroke', '#506a86')
    .attr('stroke-width', 1.4)
    .attr('stroke-dasharray', '6,4');

  // Cardinal direction labels
  const directions = [
    { angle: 0, label: 'N' },
    { angle: 90, label: 'E' },
    { angle: 180, label: 'S' },
    { angle: 270, label: 'W' }
  ];

  directions.forEach(d => {
    const x = (radius + 15) * Math.sin(d.angle * Math.PI / 180);
    const y = -(radius + 15) * Math.cos(d.angle * Math.PI / 180);
    group.append('text')
      .attr('class', 'direction-label')
      .attr('x', x)
      .attr('y', y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#9aa7bf')
      .attr('font-size', '12px')
      .text(d.label);
  });
}

function updateChart() {
  if (!svg || !skyData) return;

  const data = svg.node()?.__chartData;
  if (!data) return;

  const { constellationGroup, starsGroup, planetsGroup, moonGroup, issGroup, labelsGroup, tooltip, radius } = data;

  // Update projection
  const path = d3.geoPath().projection(projection);

  // Clear and redraw constellation lines
  constellationGroup.selectAll('*').remove();
  if (showConstellations && skyData.constellations) {
    drawConstellations(constellationGroup, path, radius);
  }

  // Clear and redraw stars
  starsGroup.selectAll('*').remove();
  drawStars(starsGroup, tooltip, radius);

  // Clear and redraw planets
  planetsGroup.selectAll('*').remove();
  drawPlanets(planetsGroup, tooltip);

  // Clear and redraw moon
  moonGroup.selectAll('*').remove();
  if (skyData.moon && skyData.moon.visible) {
    drawMoon(moonGroup, tooltip);
  }

  // Clear and redraw ISS
  issGroup.selectAll('*').remove();
  if (skyData.iss && skyData.iss.equatorial && skyData.iss.equatorial.visible) {
    drawISS(issGroup, tooltip);
  }

  // Clear and redraw labels
  labelsGroup.selectAll('*').remove();
  if (showLabels) {
    drawLabels(labelsGroup);
  }

}

function drawConstellations(group, path, radius) {
  const constellations = skyData.constellations;
  const starMap = new Map(skyData.stars.map(s => [s.hr, s]));

  Object.entries(constellations).forEach(([abbr, con]) => {
    const lines = con.lines || [];

    lines.forEach(([hr1, hr2]) => {
      const star1 = starMap.get(hr1);
      const star2 = starMap.get(hr2);

      if (!star1 || !star2) return;

      const pos1 = celestialToScreen(star1.ra, star1.dec);
      const pos2 = celestialToScreen(star2.ra, star2.dec);

      if (!pos1 || !pos2) return;
      if (!isInsideSky(pos1, radius) || !isInsideSky(pos2, radius)) return;

      group.append('line')
        .attr('class', 'constellation-line')
        .attr('x1', pos1[0])
        .attr('y1', pos1[1])
        .attr('x2', pos2[0])
        .attr('y2', pos2[1])
        .attr('stroke', '#7c8fb6')
        .attr('stroke-width', 1.6)
        .attr('stroke-opacity', 0.9)
        .attr('stroke-linecap', 'round')
        .attr('filter', 'url(#constellation-glow)');
    });
  });
}

function drawStars(group, tooltip, radius) {
  const visibleStars = skyData.stars.filter(s => {
    const magValue = Number.isFinite(s.mag) ? s.mag : 6;
    if (magValue > magnitudeLimit) return false;
    const pos = celestialToScreen(s.ra, s.dec);
    if (!pos) return false;
    return isInsideSky(pos, radius);
  });

  group.selectAll('.star')
    .data(visibleStars)
    .enter()
    .append('circle')
    .attr('class', 'star')
    .attr('cx', d => celestialToScreen(d.ra, d.dec)?.[0] || 0)
    .attr('cy', d => celestialToScreen(d.ra, d.dec)?.[1] || 0)
    .attr('r', d => starRadius(Number.isFinite(d.mag) ? d.mag : 6))
    .attr('fill', d => starColor(d.bv))
    .attr('fill-opacity', d => {
      const magValue = Number.isFinite(d.mag) ? d.mag : 6;
      return Math.max(0.35, 1 - (magValue - 0.5) * 0.12);
    })
    .attr('filter', d => {
      const magValue = Number.isFinite(d.mag) ? d.mag : 6;
      return magValue < 2 ? 'url(#star-glow)' : null;
    })
    .on('mouseover', (event, d) => {
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>${d.name || `HR ${d.hr}`}</strong><br>
        Mag: ${(Number.isFinite(d.mag) ? d.mag : 6).toFixed(2)}<br>
        ${d.con ? `Constellation: ${d.con}` : ''}
      `)
        .style('left', (event.offsetX + 10) + 'px')
        .style('top', (event.offsetY - 28) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition().duration(500).style('opacity', 0);
    });
}

function drawPlanets(group, tooltip) {
  const visiblePlanets = skyData.planets.filter(p => p.visible);

  visiblePlanets.forEach(planet => {
    const pos = celestialToScreen(planet.ra, planet.dec);
    if (!pos) return;

    // Planet circle
    group.append('circle')
      .attr('class', 'planet')
      .attr('cx', pos[0])
      .attr('cy', pos[1])
      .attr('r', Math.max(4, starRadius(planet.magnitude) * 1.5))
      .attr('fill', planetColors[planet.name] || '#ffffff')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1)
      .attr('filter', 'url(#star-glow)')
      .on('mouseover', (event) => {
        tooltip.transition().duration(200).style('opacity', 0.9);
        tooltip.html(`
          <strong>${planet.name}</strong><br>
          Mag: ${planet.magnitude.toFixed(1)}<br>
          Alt: ${planet.altitude.toFixed(1)}°<br>
          Az: ${planet.azimuth.toFixed(1)}°
        `)
          .style('left', (event.offsetX + 10) + 'px')
          .style('top', (event.offsetY - 28) + 'px');
      })
      .on('mouseout', () => {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    // Planet label
    if (showLabels) {
      group.append('text')
        .attr('class', 'planet-label')
        .attr('x', pos[0])
        .attr('y', pos[1] - 10)
        .attr('text-anchor', 'middle')
        .attr('fill', planetColors[planet.name] || '#ffffff')
        .attr('font-size', '10px')
        .text(planet.name);
    }
  });
}

function drawMoon(group, tooltip) {
  const moon = skyData.moon;
  const pos = celestialToScreen(moon.ra, moon.dec);
  if (!pos) return;

  // Moon circle with phase indication
  const moonRadius = 8;

  // Draw moon background
  group.append('circle')
    .attr('class', 'moon')
    .attr('cx', pos[0])
    .attr('cy', pos[1])
    .attr('r', moonRadius)
    .attr('fill', '#1a1a1a')
    .attr('stroke', '#888')
    .attr('stroke-width', 1);

  // Draw illuminated portion (simplified)
  const illumination = moon.illumination / 100;
  group.append('circle')
    .attr('cx', pos[0])
    .attr('cy', pos[1])
    .attr('r', moonRadius)
    .attr('fill', '#ffffcc')
    .attr('opacity', illumination)
    .attr('filter', 'url(#star-glow)')
    .on('mouseover', (event) => {
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>Moon</strong><br>
        Phase: ${moon.phaseName}<br>
        Illumination: ${moon.illumination.toFixed(0)}%<br>
        Alt: ${moon.altitude.toFixed(1)}°
      `)
        .style('left', (event.offsetX + 10) + 'px')
        .style('top', (event.offsetY - 28) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition().duration(500).style('opacity', 0);
    });

  if (showLabels) {
    group.append('text')
      .attr('x', pos[0])
      .attr('y', pos[1] - 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffcc')
      .attr('font-size', '10px')
      .text('Moon');
  }
}

function drawISS(group, tooltip) {
  const iss = skyData.iss.equatorial;
  const pos = celestialToScreen(iss.ra, iss.dec);
  if (!pos) return;

  // ISS icon (small cross)
  const size = 6;

  group.append('line')
    .attr('x1', pos[0] - size)
    .attr('y1', pos[1])
    .attr('x2', pos[0] + size)
    .attr('y2', pos[1])
    .attr('stroke', '#ff6600')
    .attr('stroke-width', 2);

  group.append('line')
    .attr('x1', pos[0])
    .attr('y1', pos[1] - size)
    .attr('x2', pos[0])
    .attr('y2', pos[1] + size)
    .attr('stroke', '#ff6600')
    .attr('stroke-width', 2);

  // Animated pulse
  group.append('circle')
    .attr('cx', pos[0])
    .attr('cy', pos[1])
    .attr('r', 4)
    .attr('fill', 'none')
    .attr('stroke', '#ff6600')
    .attr('stroke-width', 1)
    .attr('class', 'iss-pulse');

  group.selectAll('.iss-marker, line')
    .on('mouseover', (event) => {
      const issData = skyData.iss.position;
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>ISS</strong><br>
        Alt: ${iss.altitude.toFixed(1)}°<br>
        Az: ${iss.azimuth.toFixed(1)}°<br>
        ${issData ? `Height: ${issData.altitude.toFixed(0)} km` : ''}
      `)
        .style('left', (event.offsetX + 10) + 'px')
        .style('top', (event.offsetY - 28) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition().duration(500).style('opacity', 0);
    });

  if (showLabels) {
    group.append('text')
      .attr('x', pos[0])
      .attr('y', pos[1] - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ff6600')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .text('ISS');
  }
}

function drawLabels(group) {
  // Draw labels for bright named stars
  const namedStars = skyData.stars.filter(s =>
    s.name && s.mag < 2.5 && isVisible(s.ra, s.dec)
  );

  namedStars.forEach(star => {
    const pos = celestialToScreen(star.ra, star.dec);
    if (!pos) return;

    group.append('text')
      .attr('class', 'star-label')
      .attr('x', pos[0] + starRadius(star.mag) + 3)
      .attr('y', pos[1] + 3)
      .attr('fill', '#aaa')
      .attr('font-size', '9px')
      .text(star.name);
  });
}

function centerOnZenith() {
  if (!observerLocation) return;

  const lst = getLocalSiderealTime(observerLocation.lon, selectedTime || new Date());
  currentRotation = [lst - 180, -observerLocation.lat];
  projection.rotate(currentRotation);
  updateChart();
}

function resetZoom() {
  if (!svg || !zoom) return;
  svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
}

function updateInfo() {
  const infoEl = document.getElementById('star-chart-info');
  if (!infoEl || !skyData) return;

  const sun = skyData.sun;
  const visiblePlanets = skyData.planets.filter(p => p.visible);
  const observerTime = skyData.observer?.timestamp ? new Date(skyData.observer.timestamp) : null;

  let html = '<div class="star-chart-info-content">';

  if (observerTime) {
    html += `<div class="info-item">
      <span class="info-label">Time:</span>
      <span class="info-value">${formatTimeLabel(observerTime)}</span>
    </div>`;
  }

  // Sun/twilight info
  if (sun) {
    html += `<div class="info-item">
      <span class="info-label">Sky:</span>
      <span class="info-value">${sun.twilight === 'day' ? 'Daytime' :
        sun.twilight.charAt(0).toUpperCase() + sun.twilight.slice(1) + ' twilight'}</span>
    </div>`;
  }

  // Moon
  if (skyData.moon) {
    html += `<div class="info-item">
      <span class="info-label">Moon:</span>
      <span class="info-value">${skyData.moon.phaseName} (${skyData.moon.illumination.toFixed(0)}%)</span>
    </div>`;
  }

  // Visible planets
  if (visiblePlanets.length > 0) {
    html += `<div class="info-item">
      <span class="info-label">Planets visible:</span>
      <span class="info-value">${visiblePlanets.map(p => p.name).join(', ')}</span>
    </div>`;
  }

  // ISS
  if (skyData.iss?.equatorial?.visible) {
    html += `<div class="info-item">
      <span class="info-label">ISS:</span>
      <span class="info-value">Visible! Alt: ${skyData.iss.equatorial.altitude.toFixed(1)}°</span>
    </div>`;
  }

  html += '</div>';
  infoEl.innerHTML = html;
}

export function updateLocation(location) {
  observerLocation = {
    ...location,
    lat: Number(location.lat),
    lon: Number(location.lon)
  };
  if (skyData) {
    loadSkyData();
  }
}

export function refreshChart() {
  loadSkyData();
}

function updateRotationForTime(date) {
  if (!observerLocation) return;
  const lst = getLocalSiderealTime(observerLocation.lon, date || new Date());
  currentRotation = [lst - 180, -observerLocation.lat];
  if (projection) {
    projection.rotate(currentRotation);
  }
}

function isInsideSky(pos, radius) {
  if (!pos || !radius) return false;
  return Math.hypot(pos[0], pos[1]) <= (radius - 2);
}

function buildTimeFromMinutes(baseDate, minutes) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutes);
  return date;
}

function formatTimeLabel(date) {
  try {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return date.toISOString();
  }
}

async function waitForContainer(container) {
  if (!container) return;
  for (let i = 0; i < 10; i += 1) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width > 0 && height > 0) return;
    await new Promise(requestAnimationFrame);
  }
}
