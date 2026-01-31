// Graph Tab - Interactive D3 force-directed backlink graph
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import db from './db.js';

let graphData = null;
let svg = null;
let simulation = null;
let currentFile = null;
let colorMode = 'folder';
let linkCounts = new Map();
let folderColorScale = null;
let densityScale = null;
let initialized = false;

const CACHE_KEY = 'graph-data';

export async function initGraphTab() {
  if (initialized) return;
  initialized = true;
  console.log('Initializing Graph tab...');

  document.getElementById('refresh-graph')?.addEventListener('click', () => {
    loadGraphData(true);
  });

  document.getElementById('graph-color-mode')?.addEventListener('change', (e) => {
    colorMode = e.target.value;
    updateColors();
  });

  await loadGraphData();
}

export function setCurrentFile(filePath) {
  currentFile = filePath;
  highlightCurrentFile();
}

async function loadGraphData(forceRefresh = false) {
  const container = document.getElementById('graph-content');

  // Try cache first
  if (!forceRefresh && !graphData) {
    try {
      const cached = await db.getCachedCalendarData(CACHE_KEY);
      if (cached && cached.data) {
        graphData = cached.data;
        createGraph();
        return;
      }
    } catch (e) { /* ignore */ }
  }

  if (!graphData) {
    container.innerHTML = '<div class="loading-spinner"></div>';
  }

  if (!navigator.onLine && graphData) return;

  try {
    const response = await fetch('/api/graph');
    if (!response.ok) throw new Error('Failed to load graph data');
    graphData = await response.json();
    try { await db.cacheCalendarData(CACHE_KEY, graphData); } catch (e) { /* ignore */ }
    createGraph();
  } catch (error) {
    console.error('Error loading graph:', error);
    if (!graphData) {
      container.innerHTML = `<div class="empty-state">
        <p>Unable to load graph</p>
        <button class="btn btn-primary" onclick="document.getElementById('refresh-graph').click()">Retry</button>
      </div>`;
    }
  }
}

function createGraph() {
  const container = document.getElementById('graph-content');
  container.innerHTML = '';

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No notes found in vault</p></div>';
    return;
  }

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // Compute link counts per node
  linkCounts = new Map();
  graphData.links.forEach(l => {
    linkCounts.set(l.source, (linkCounts.get(l.source) || 0) + 1);
    linkCounts.set(l.target, (linkCounts.get(l.target) || 0) + 1);
  });

  // Build color scales
  const folders = [...new Set(graphData.nodes.map(n => n.folder || '(root)'))];
  folderColorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(folders);

  const maxLinks = Math.max(...linkCounts.values(), 1);
  densityScale = d3.scaleSequential(d3.interpolateViridis).domain([0, maxLinks]);

  // Create SVG
  svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'graph-svg');

  const g = svg.append('g');

  // Zoom
  const zoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  svg.call(zoom);

  // Links
  const link = g.append('g')
    .attr('class', 'graph-links')
    .selectAll('line')
    .data(graphData.links)
    .enter()
    .append('line')
    .attr('stroke', '#555')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-width', 1);

  // Nodes group
  const node = g.append('g')
    .attr('class', 'graph-nodes')
    .selectAll('g')
    .data(graphData.nodes)
    .enter()
    .append('g')
    .attr('class', 'graph-node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Node circles
  node.append('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', '#333')
    .attr('stroke-width', 1)
    .attr('class', 'graph-node-circle');

  // Node labels
  node.append('text')
    .text(d => d.name)
    .attr('dx', d => nodeRadius(d) + 4)
    .attr('dy', '0.35em')
    .attr('fill', '#999')
    .attr('font-size', '10px')
    .attr('class', 'graph-node-label')
    .attr('pointer-events', 'none');

  // Click handler - open file in editor
  node.on('click', (event, d) => {
    event.stopPropagation();
    document.querySelector('.tab-btn[data-tab="writer"]').click();
    setTimeout(() => window.openFile(d.id), 100);
  });

  // Tooltip
  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'graph-tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('pointer-events', 'none');

  node.on('mouseover', (event, d) => {
    const count = linkCounts.get(d.id) || 0;
    tooltip.transition().duration(200).style('opacity', 0.95);
    tooltip.html(`
      <strong>${escapeHtml(d.name)}</strong><br>
      ${d.folder ? `Folder: ${escapeHtml(d.folder)}<br>` : ''}
      Links: ${count}
    `);
    // Position tooltip near the mouse
    const rect = container.getBoundingClientRect();
    tooltip
      .style('left', (event.clientX - rect.left + 12) + 'px')
      .style('top', (event.clientY - rect.top - 10) + 'px');

    // Highlight connected links
    link.attr('stroke-opacity', l =>
      (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id ? 0.8 : 0.1
    ).attr('stroke-width', l =>
      (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id ? 2 : 1
    );
  })
  .on('mousemove', (event) => {
    const rect = container.getBoundingClientRect();
    tooltip
      .style('left', (event.clientX - rect.left + 12) + 'px')
      .style('top', (event.clientY - rect.top - 10) + 'px');
  })
  .on('mouseout', () => {
    tooltip.transition().duration(300).style('opacity', 0);
    link.attr('stroke-opacity', 0.3).attr('stroke-width', 1);
  });

  // Force simulation
  const chargeStrength = graphData.nodes.length > 100 ? -100 : -200;
  const linkDistance = graphData.nodes.length > 100 ? 50 : 80;

  simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(linkDistance))
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 3))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  // Store refs
  svg.node().__graph = { g, link, node, tooltip };

  highlightCurrentFile();
}

function nodeRadius(d) {
  const count = linkCounts.get(d.id) || 0;
  return Math.max(4, Math.min(20, 4 + count * 2));
}

function getNodeColor(d) {
  if (colorMode === 'folder') {
    return folderColorScale ? folderColorScale(d.folder || '(root)') : '#569cd6';
  } else {
    const count = linkCounts.get(d.id) || 0;
    return densityScale ? densityScale(count) : '#569cd6';
  }
}

function updateColors() {
  if (!svg) return;
  const refs = svg.node()?.__graph;
  if (!refs) return;

  refs.node.selectAll('.graph-node-circle')
    .transition().duration(300)
    .attr('fill', d => getNodeColor(d));
}

function highlightCurrentFile() {
  if (!svg) return;
  const refs = svg.node()?.__graph;
  if (!refs) return;

  refs.node.selectAll('.graph-node-circle')
    .attr('stroke', d => d.id === currentFile ? '#569cd6' : '#333')
    .attr('stroke-width', d => d.id === currentFile ? 3 : 1);

  refs.node.selectAll('.graph-node-label')
    .attr('fill', d => d.id === currentFile ? '#569cd6' : '#999')
    .attr('font-weight', d => d.id === currentFile ? 'bold' : 'normal');
}

// Drag handlers
function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
