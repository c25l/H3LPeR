// CodeMirror 5 Markdown Editor with inline rendering
let editor = null;
let currentContent = '';
let onChangeCallback = null;
let onHistoryCallback = null;
let mathWidgets = [];
let transclusionWidgets = [];
let transclusionCache = new Map();

// Custom fold range finder for markdown lists
function markdownListFold(cm, start) {
  const line = cm.getLine(start.line);
  const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/);

  if (!listMatch) return null;

  const baseIndent = listMatch[1].length;
  const lastLine = cm.lastLine();
  let end = start.line;

  // Find all lines that are part of this list item (more indented or continuation)
  for (let i = start.line + 1; i <= lastLine; i++) {
    const nextLine = cm.getLine(i);

    // Empty line - might continue if next non-empty line is indented
    if (nextLine.trim() === '') {
      // Look ahead for content
      let foundContent = false;
      for (let j = i + 1; j <= lastLine; j++) {
        const futureLine = cm.getLine(j);
        if (futureLine.trim() === '') continue;
        const futureIndent = futureLine.match(/^(\s*)/)[1].length;
        if (futureIndent > baseIndent) {
          foundContent = true;
          break;
        }
        break;
      }
      if (!foundContent) break;
      end = i;
      continue;
    }

    const nextIndent = nextLine.match(/^(\s*)/)[1].length;

    // If same or less indented, we've exited this fold
    if (nextIndent <= baseIndent) break;

    end = i;
  }

  // Only fold if there's something to fold
  if (end > start.line) {
    return {
      from: CodeMirror.Pos(start.line, line.length),
      to: CodeMirror.Pos(end, cm.getLine(end).length)
    };
  }

  return null;
}

// Register the fold helper
if (typeof CodeMirror !== 'undefined') {
  CodeMirror.registerHelper('fold', 'markdown-list', markdownListFold);
}

// Define tag overlay mode for highlighting tags
CodeMirror.defineMode('tags-overlay', function() {
  // Tag pattern: whitespace + #[A-z0-9_-.]+[A-z0-9]
  const tagPattern = /(?:^|\s)(#[A-Za-z0-9_.-]*[A-Za-z0-9])/g;
  
  return {
    token: function(stream) {
      // Skip code blocks and inline code
      if (stream.match(/```/)) {
        stream.skipToEnd();
        return null;
      }
      if (stream.match(/`[^`]*`/)) {
        return null;
      }
      
      // Look for tags - only match if at start of line or after whitespace
      if (stream.sol() || /\s/.test(stream.string.charAt(stream.pos - 1))) {
        const match = stream.match(/#[A-Za-z0-9_.-]*[A-Za-z0-9]/);
        if (match) {
          return 'tag';
        }
      }
      
      // Skip to next potential tag or end of line
      while (stream.next() != null && stream.peek() !== '#') {}
      return null;
    }
  };
});

export async function initEditor(container, content, onChange, onHistory) {
  onChangeCallback = onChange;
  onHistoryCallback = onHistory || null;
  currentContent = content || '';

  // Clean up existing
  if (editor) {
    editor.toTextArea();
    editor = null;
  }

  // Create textarea
  container.innerHTML = '<textarea id="cm-editor"></textarea>';
  const textarea = container.querySelector('#cm-editor');
  textarea.value = currentContent;

  // Initialize CodeMirror
  editor = CodeMirror.fromTextArea(textarea, {
    mode: {
      name: 'gfm',
      gitHubSpice: false
    },
    theme: 'writer',
    lineNumbers: false,
    lineWrapping: true,
    autofocus: true,
    indentWithTabs: false,
    indentUnit: 2,
    tabSize: 2,
    foldGutter: {
      rangeFinder: markdownListFold
    },
    gutters: ['CodeMirror-foldgutter'],
    extraKeys: {
      'Enter': 'newlineAndIndentContinueMarkdownList',
      'Tab': (cm) => indentListItem(cm, 'add'),
      'Shift-Tab': (cm) => indentListItem(cm, 'subtract'),
      'Ctrl-B': () => toggleMark('**'),
      'Cmd-B': () => toggleMark('**'),
      'Ctrl-I': () => toggleMark('_'),
      'Cmd-I': () => toggleMark('_'),
      'Ctrl-K': () => insertLink(),
      'Cmd-K': () => insertLink(),
      'Alt-Up': (cm) => moveLine(cm, -1),
      'Alt-Down': (cm) => moveLine(cm, 1)
    }
  });

  // Add tag overlay mode
  editor.addOverlay({
    token: function(stream) {
      // Look for tags matching whitespace + #[A-z0-9_-.]+[A-z0-9]
      // Only match tags that start line or follow whitespace
      if (stream.sol() || /\s/.test(stream.string.charAt(stream.pos - 1))) {
        const match = stream.match(/#[A-Za-z0-9_.-]*[A-Za-z0-9]/);
        if (match) return 'tag';
      }
      stream.next();
      return null;
    }
  });

  // Add wiki-link overlay for [[link]] highlighting
  editor.addOverlay({
    token: function(stream) {
      if (stream.match(/\[\[[^\]]+\]\]/)) {
        return 'wikilink';
      }
      while (stream.next() != null && !stream.match(/\[\[/, false)) {}
      return null;
    }
  });

  // Set up change handler
  editor.on('change', () => {
    currentContent = editor.getValue();
    if (onChangeCallback) {
      onChangeCallback(currentContent);
    }
    // Re-render math and transclusions on change
    scheduleMathRender();
    scheduleTransclusionRender();
    // Update indent colors
    scheduleIndentColorUpdate();
    // Update undo/redo button state
    if (onHistoryCallback) {
      onHistoryCallback(editor.historySize());
    }
  });

  // Re-render when cursor moves (to show/hide source)
  editor.on('cursorActivity', () => {
    scheduleMathRender();
    scheduleTransclusionRender();
  });

  // Handle clicks
  editor.on('mousedown', handleClick);

  // Slash commands
  editor.on('inputRead', handleSlashCommand);

  // Initial math render, transclusions, and indent colors
  setTimeout(() => {
    editor.refresh();
    renderMath();
    renderTransclusions();
    updateIndentColors();
  }, 50);
}

// Apply indent-level classes to list lines for color coding
function updateIndentColors() {
  if (!editor) return;

  const lineCount = editor.lineCount();
  for (let i = 0; i < lineCount; i++) {
    const line = editor.getLine(i);
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s/);

    // Remove existing indent classes
    for (let level = 0; level <= 7; level++) {
      editor.removeLineClass(i, 'wrap', `indent-level-${level}`);
    }

    if (match) {
      const indentSpaces = match[1].length;
      const level = Math.floor(indentSpaces / 2); // 2 spaces per level
      const clampedLevel = Math.min(level, 7);
      editor.addLineClass(i, 'wrap', `indent-level-${clampedLevel}`);
    }
  }
}

let mathRenderTimeout = null;
function scheduleMathRender() {
  clearTimeout(mathRenderTimeout);
  mathRenderTimeout = setTimeout(renderMath, 100);
}

let indentColorTimeout = null;
function scheduleIndentColorUpdate() {
  clearTimeout(indentColorTimeout);
  indentColorTimeout = setTimeout(updateIndentColors, 100);
}

function renderMath() {
  if (!editor || !window.katex) return;

  // Clear existing widgets
  mathWidgets.forEach(w => w.clear());
  mathWidgets = [];

  const doc = editor.getDoc();
  const cursorLine = editor.getCursor().line;
  const text = editor.getValue();

  // Find block math: $$...$$
  const blockMathRegex = /\$\$([^$]+)\$\$/g;
  let match;

  while ((match = blockMathRegex.exec(text)) !== null) {
    const startPos = doc.posFromIndex(match.index);
    const endPos = doc.posFromIndex(match.index + match[0].length);

    // Don't render if cursor is on this line
    if (cursorLine >= startPos.line && cursorLine <= endPos.line) continue;

    try {
      const widget = document.createElement('div');
      widget.className = 'math-widget math-block';
      katex.render(match[1], widget, { displayMode: true, throwOnError: false });

      const marker = doc.markText(startPos, endPos, {
        replacedWith: widget,
        clearOnEnter: true,
        handleMouseEvents: true
      });
      mathWidgets.push(marker);
    } catch (e) {
      console.error('KaTeX error:', e);
    }
  }

  // Find inline math: $..$ (not preceded/followed by $)
  const inlineMathRegex = /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g;

  while ((match = inlineMathRegex.exec(text)) !== null) {
    const startPos = doc.posFromIndex(match.index);
    const endPos = doc.posFromIndex(match.index + match[0].length);

    // Don't render if cursor is on this line
    if (cursorLine === startPos.line) continue;

    try {
      const widget = document.createElement('span');
      widget.className = 'math-widget math-inline';
      katex.render(match[1], widget, { displayMode: false, throwOnError: false });

      const marker = doc.markText(startPos, endPos, {
        replacedWith: widget,
        clearOnEnter: true,
        handleMouseEvents: true
      });
      mathWidgets.push(marker);
    } catch (e) {
      console.error('KaTeX error:', e);
    }
  }
}

// Render transclusions: ![[filename]]
let transclusionRenderTimeout = null;
function scheduleTransclusionRender() {
  clearTimeout(transclusionRenderTimeout);
  transclusionRenderTimeout = setTimeout(renderTransclusions, 200);
}

async function renderTransclusions() {
  if (!editor) return;

  // Clear existing widgets
  transclusionWidgets.forEach(w => w.clear());
  transclusionWidgets = [];

  const doc = editor.getDoc();
  const cursorLine = editor.getCursor().line;
  const lineCount = editor.lineCount();

  for (let i = 0; i < lineCount; i++) {
    // Don't render on cursor line
    if (i === cursorLine) continue;

    const line = editor.getLine(i);
    const match = line.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$/);
    if (!match) continue;

    const target = match[1].trim();
    const filePath = target.endsWith('.md') ? target : target + '.md';

    // Fetch content (with cache)
    let content = transclusionCache.get(filePath);
    if (content === undefined) {
      try {
        const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`);
        if (response.ok) {
          const file = await response.json();
          content = file.content || '';
          transclusionCache.set(filePath, content);
        } else {
          content = null;
          transclusionCache.set(filePath, null);
        }
      } catch {
        content = null;
        transclusionCache.set(filePath, null);
      }
    }

    const startPos = { line: i, ch: 0 };
    const endPos = { line: i, ch: line.length };

    const widget = document.createElement('div');
    widget.className = 'transclusion-widget';

    if (content === null) {
      widget.innerHTML = `<div class="transclusion-header">
        <span class="transclusion-icon">!</span>
        <span class="transclusion-title">${escapeHtml(target)}</span>
        <span class="transclusion-missing">not found</span>
      </div>`;
    } else {
      // Show first ~15 lines of content
      const preview = content.split('\n').slice(0, 15).join('\n');
      const truncated = content.split('\n').length > 15;
      widget.innerHTML = `<div class="transclusion-header" onclick="window.openFile('${filePath.replace(/'/g, "\\'")}')">
        <span class="transclusion-icon">&#x1F4C4;</span>
        <span class="transclusion-title">${escapeHtml(target)}</span>
        <span class="transclusion-open">open</span>
      </div>
      <div class="transclusion-content">${escapeHtml(preview)}${truncated ? '\n...' : ''}</div>`;
    }

    try {
      const marker = doc.markText(startPos, endPos, {
        replacedWith: widget,
        clearOnEnter: true,
        handleMouseEvents: true
      });
      transclusionWidgets.push(marker);
    } catch (e) {
      // Ignore marking errors
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Slash command templates
const SLASH_TEMPLATES = [
  {
    name: 'today',
    label: '/today',
    description: 'Insert today\'s date heading',
    template: () => {
      const d = new Date();
      const formatted = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return `# ${formatted}\n\n`;
    }
  },
  {
    name: 'meeting',
    label: '/meeting',
    description: 'Meeting notes template',
    template: () => {
      const d = new Date();
      const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return `## Meeting Notes - ${date}\n\n**Attendees:** \n\n**Agenda:**\n- \n\n**Discussion:**\n\n\n**Action Items:**\n- [ ] \n`;
    }
  },
  {
    name: 'todo',
    label: '/todo',
    description: 'Todo list',
    template: () => '## Tasks\n\n- [ ] \n- [ ] \n- [ ] \n'
  },
  {
    name: 'note',
    label: '/note',
    description: 'Quick note with timestamp',
    template: () => {
      const d = new Date();
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `### ${time}\n\n`;
    }
  },
  {
    name: 'link',
    label: '/link',
    description: 'Wiki-link to another note',
    template: () => '[[]]'
  },
  {
    name: 'embed',
    label: '/embed',
    description: 'Embed content from another note',
    template: () => '![[]]'
  },
  {
    name: 'code',
    label: '/code',
    description: 'Code block',
    template: () => '```\n\n```'
  },
  {
    name: 'table',
    label: '/table',
    description: 'Markdown table',
    template: () => '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n|          |          |          |\n'
  }
];

let slashMenu = null;
let slashMenuLine = -1;

function handleSlashCommand(cm, change) {
  // Only trigger on single character input
  if (change.origin !== '+input') return;

  const cursor = cm.getCursor();
  const lineContent = cm.getLine(cursor.line);
  const beforeCursor = lineContent.slice(0, cursor.ch);

  // Check if we have a slash at the start of a line (possibly with whitespace)
  const slashMatch = beforeCursor.match(/^(\s*)\/(\w*)$/);

  if (slashMatch) {
    const query = slashMatch[2].toLowerCase();
    showSlashMenu(cm, cursor, query, slashMatch[1]);
  } else {
    hideSlashMenu();
  }
}

function showSlashMenu(cm, cursor, query, indent) {
  hideSlashMenu();

  const filtered = SLASH_TEMPLATES.filter(t =>
    t.name.startsWith(query) || t.label.startsWith('/' + query)
  );

  if (filtered.length === 0) return;

  slashMenu = document.createElement('div');
  slashMenu.className = 'slash-menu';
  slashMenuLine = cursor.line;

  let selectedIndex = 0;

  function render() {
    slashMenu.innerHTML = filtered.map((t, i) =>
      `<div class="slash-menu-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
        <span class="slash-menu-label">${t.label}</span>
        <span class="slash-menu-desc">${t.description}</span>
      </div>`
    ).join('');
  }

  render();

  // Position near cursor
  const coords = cm.cursorCoords(true, 'page');
  slashMenu.style.position = 'fixed';
  slashMenu.style.left = coords.left + 'px';
  slashMenu.style.top = (coords.bottom + 4) + 'px';
  slashMenu.style.zIndex = '1000';
  document.body.appendChild(slashMenu);

  // Click handler
  slashMenu.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.slash-menu-item');
    if (item) {
      const idx = parseInt(item.dataset.index);
      insertSlashTemplate(cm, filtered[idx], cursor, indent);
    }
  });

  // Keyboard handler
  const keyHandler = (cm, e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertSlashTemplate(cm, filtered[selectedIndex], cursor, indent);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
    }
  };

  cm.on('keydown', keyHandler);
  slashMenu._keyHandler = keyHandler;
  slashMenu._cm = cm;
}

function hideSlashMenu() {
  if (slashMenu) {
    if (slashMenu._cm && slashMenu._keyHandler) {
      slashMenu._cm.off('keydown', slashMenu._keyHandler);
    }
    slashMenu.remove();
    slashMenu = null;
    slashMenuLine = -1;
  }
}

function insertSlashTemplate(cm, template, cursor, indent) {
  hideSlashMenu();

  // Replace the slash command text with the template content
  const lineContent = cm.getLine(cursor.line);
  const slashStart = lineContent.search(/\/\w*$/);
  const from = { line: cursor.line, ch: Math.max(0, slashStart - (indent ? indent.length : 0)) };
  const to = { line: cursor.line, ch: lineContent.length };

  const content = typeof template.template === 'function' ? template.template() : template.template;
  cm.replaceRange(content, from, to);

  // Position cursor at a useful location (first empty spot)
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const emptyIdx = lines[i].indexOf('[]');
    if (emptyIdx >= 0) {
      // Place cursor inside [[]] or []
      cm.setCursor({ line: from.line + i, ch: emptyIdx + 1 });
      return;
    }
  }
  // Default: end of first content line
  if (lines.length > 1) {
    cm.setCursor({ line: from.line + 1, ch: 0 });
  }
}

function handleClick(cm, event) {
  const target = event.target;

  // Check for wiki-link click
  const pos = cm.coordsChar({ left: event.clientX, top: event.clientY });
  const token = cm.getTokenAt(pos);
  const line = cm.getLine(pos.line);

  // Find wiki-links in the line
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiLinkRegex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (pos.ch >= start && pos.ch <= end) {
      event.preventDefault();
      openWikiLink(match[1]);
      return;
    }
  }
}

function toggleMark(mark) {
  const selection = editor.getSelection();
  if (selection) {
    editor.replaceSelection(mark + selection + mark);
  } else {
    const cursor = editor.getCursor();
    editor.replaceRange(mark + mark, cursor);
    editor.setCursor({ line: cursor.line, ch: cursor.ch + mark.length });
  }
}

function insertLink() {
  const selection = editor.getSelection() || 'link text';
  editor.replaceSelection(`[${selection}](url)`);
}

function moveLine(cm, direction) {
  const cursor = cm.getCursor();
  const line = cursor.line;
  const targetLine = line + direction;

  if (targetLine < 0 || targetLine >= cm.lineCount()) return;

  const lineContent = cm.getLine(line);
  const targetContent = cm.getLine(targetLine);

  cm.operation(() => {
    if (direction === -1) {
      // Moving up: replace target with current, current with target
      cm.replaceRange(lineContent, { line: targetLine, ch: 0 }, { line: targetLine, ch: targetContent.length });
      cm.replaceRange(targetContent, { line: line, ch: 0 }, { line: line, ch: lineContent.length });
    } else {
      // Moving down
      cm.replaceRange(targetContent, { line: line, ch: 0 }, { line: line, ch: lineContent.length });
      cm.replaceRange(lineContent, { line: targetLine, ch: 0 }, { line: targetLine, ch: targetContent.length });
    }
    cm.setCursor({ line: targetLine, ch: cursor.ch });
  });
}

function indentListItem(cm, direction) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);
  const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/);

  if (listMatch) {
    // It's a list item - indent/unindent the whole line
    const currentIndent = listMatch[1];
    const indentUnit = '  ';

    if (direction === 'add') {
      cm.replaceRange(indentUnit, { line: cursor.line, ch: 0 });
    } else if (direction === 'subtract' && currentIndent.length >= 2) {
      cm.replaceRange('', { line: cursor.line, ch: 0 }, { line: cursor.line, ch: 2 });
    }
  } else {
    // Not a list item - default behavior
    if (direction === 'add') {
      cm.replaceSelection('  ');
    }
  }
}

async function openWikiLink(target) {
  const filePath = target.endsWith('.md') ? target : target + '.md';

  try {
    const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`);
    if (response.ok) {
      window.openFile(filePath);
    } else if (response.status === 404) {
      if (confirm(`Create "${filePath}"?`)) {
        await fetch(`/api/files/${encodeURIComponent(filePath)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `# ${target}\n\n` })
        });
        window.openFile(filePath);
        location.reload();
      }
    }
  } catch (err) {
    console.error('Wiki-link error:', err);
  }
}

export function undo() {
  if (editor) editor.undo();
}

export function redo() {
  if (editor) editor.redo();
}

export function getHistorySize() {
  if (!editor) return { undo: 0, redo: 0 };
  return editor.historySize();
}

export function getContent() {
  return editor ? editor.getValue() : currentContent;
}

export function setContent(content) {
  currentContent = content;
  if (editor) {
    editor.setValue(content);
  }
}

export function setEditorOptions(options = {}) {
  if (!editor) return;
  Object.entries(options).forEach(([key, value]) => {
    editor.setOption(key, value);
  });
}

export function insertTextAtCursor(text) {
  if (!text) return;
  if (editor) {
    const doc = editor.getDoc();
    doc.replaceRange(text, doc.getCursor());
    editor.focus();
  } else {
    currentContent = (currentContent || '') + text;
  }
}

export async function destroyEditor() {
  if (editor) {
    mathWidgets.forEach(w => w.clear());
    mathWidgets = [];
    transclusionWidgets.forEach(w => w.clear());
    transclusionWidgets = [];
    transclusionCache.clear();
    editor.toTextArea();
    editor = null;
  }
}
