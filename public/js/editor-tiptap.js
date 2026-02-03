// Tiptap Markdown Editor with custom extensions
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Mathematics } from '@tiptap/extension-mathematics';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Suggestion } from '@tiptap/suggestion';

let editor = null;
let currentContent = '';
let onChangeCallback = null;
let onHistoryCallback = null;
let transclusionCache = new Map();

// Custom extension for wiki-links
const WikiLink = Extension.create({
  name: 'wikiLink',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLink'),
        props: {
          decorations(state) {
            const decorations = [];
            const { doc } = state;
            const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text;
                let match;
                while ((match = regex.exec(text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: 'wikilink',
                      'data-target': match[1]
                    })
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },

          handleClick(view, pos, event) {
            const { doc } = view.state;
            const $pos = doc.resolve(pos);
            const node = $pos.parent;
            
            if (node.isText || node.type.name === 'text') {
              const text = node.textContent || doc.textBetween(Math.max(0, pos - 100), Math.min(doc.content.size, pos + 100));
              const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
              let match;
              
              while ((match = regex.exec(text)) !== null) {
                const matchStart = $pos.start() + match.index;
                const matchEnd = matchStart + match[0].length;
                
                if (pos >= matchStart && pos <= matchEnd) {
                  event.preventDefault();
                  openWikiLink(match[1]);
                  return true;
                }
              }
            }
            return false;
          }
        }
      })
    ];
  }
});

// Custom extension for tag highlighting
const TagHighlight = Extension.create({
  name: 'tagHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tagHighlight'),
        props: {
          decorations(state) {
            const decorations = [];
            const { doc } = state;
            const regex = /(?:^|\s)(#[A-Za-z0-9_.-]+[A-Za-z0-9])/g;

            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text;
                let match;
                while ((match = regex.exec(text)) !== null) {
                  const from = pos + match.index + (match[0].startsWith(' ') ? 1 : 0);
                  const to = from + match[1].length;
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: 'tag'
                    })
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          }
        }
      })
    ];
  }
});

// Custom extension for transclusions
const Transclusion = Extension.create({
  name: 'transclusion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('transclusion'),
        props: {
          decorations(state) {
            const decorations = [];
            const { doc } = state;
            const regex = /^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$/gm;

            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text;
                let match;
                while ((match = regex.exec(text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;
                  
                  const widget = document.createElement('div');
                  widget.className = 'transclusion-widget';
                  widget.textContent = `Loading ${match[1]}...`;
                  
                  // Async load content
                  loadTransclusion(match[1]).then(content => {
                    if (content === null) {
                      widget.innerHTML = `<div class="transclusion-header">
                        <span class="transclusion-icon">!</span>
                        <span class="transclusion-title">${escapeHtml(match[1])}</span>
                        <span class="transclusion-missing">not found</span>
                      </div>`;
                    } else {
                      const preview = content.split('\n').slice(0, 15).join('\n');
                      const truncated = content.split('\n').length > 15;
                      const filePath = match[1].endsWith('.md') ? match[1] : match[1] + '.md';
                      widget.innerHTML = `<div class="transclusion-header" onclick="window.openFile('${filePath.replace(/'/g, "\\'")}')">
                        <span class="transclusion-icon">&#x1F4C4;</span>
                        <span class="transclusion-title">${escapeHtml(match[1])}</span>
                        <span class="transclusion-open">open</span>
                      </div>
                      <div class="transclusion-content">${escapeHtml(preview)}${truncated ? '\n...' : ''}</div>`;
                    }
                  });
                  
                  decorations.push(
                    Decoration.widget(from, widget, {
                      side: -1
                    })
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          }
        }
      })
    ];
  }
});

async function loadTransclusion(target) {
  const filePath = target.endsWith('.md') ? target : target + '.md';
  
  if (transclusionCache.has(filePath)) {
    return transclusionCache.get(filePath);
  }
  
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`);
    if (response.ok) {
      const file = await response.json();
      const content = file.content || '';
      transclusionCache.set(filePath, content);
      return content;
    } else {
      transclusionCache.set(filePath, null);
      return null;
    }
  } catch {
    transclusionCache.set(filePath, null);
    return null;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// Slash command extension
const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        pluginKey: new PluginKey('slashCommand'),
        
        allow({ state, range }) {
          const $from = state.doc.resolve(range.from);
          const lineStart = $from.start();
          const textBefore = state.doc.textBetween(lineStart, range.from, '\n', '\0');
          // Only allow at line start (with optional whitespace)
          return /^\s*$/.test(textBefore);
        },

        items({ query }) {
          return SLASH_TEMPLATES.filter(template =>
            template.name.toLowerCase().startsWith(query.toLowerCase()) ||
            template.label.toLowerCase().includes(query.toLowerCase())
          );
        },

        render: () => {
          let component;
          let popup;

          return {
            onStart: props => {
              component = document.createElement('div');
              component.className = 'slash-menu';
              
              props.items.forEach((item, index) => {
                const itemEl = document.createElement('div');
                itemEl.className = `slash-menu-item ${index === 0 ? 'selected' : ''}`;
                itemEl.innerHTML = `
                  <span class="slash-menu-label">${item.label}</span>
                  <span class="slash-menu-desc">${item.description}</span>
                `;
                itemEl.addEventListener('click', () => {
                  props.command(item);
                });
                component.appendChild(itemEl);
              });

              document.body.appendChild(component);

              const { clientRect } = props;
              if (clientRect) {
                component.style.position = 'fixed';
                component.style.left = `${clientRect().left}px`;
                component.style.top = `${clientRect().bottom + 4}px`;
                component.style.zIndex = '1000';
              }
            },

            onUpdate(props) {
              component.innerHTML = '';
              props.items.forEach((item, index) => {
                const itemEl = document.createElement('div');
                itemEl.className = `slash-menu-item ${index === 0 ? 'selected' : ''}`;
                itemEl.innerHTML = `
                  <span class="slash-menu-label">${item.label}</span>
                  <span class="slash-menu-desc">${item.description}</span>
                `;
                itemEl.addEventListener('click', () => {
                  props.command(item);
                });
                component.appendChild(itemEl);
              });

              const { clientRect } = props;
              if (clientRect && component) {
                component.style.left = `${clientRect().left}px`;
                component.style.top = `${clientRect().bottom + 4}px`;
              }
            },

            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                component?.remove();
                return true;
              }
              return false;
            },

            onExit() {
              component?.remove();
            }
          };
        },

        command: ({ editor, range, props }) => {
          const template = props;
          const content = typeof template.template === 'function' ? template.template() : template.template;
          
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent(content)
            .run();
        }
      })
    ];
  }
});

export async function initEditor(container, content, onChange, onHistory) {
  onChangeCallback = onChange;
  onHistoryCallback = onHistory || null;
  currentContent = content || '';

  // Clean up existing
  if (editor) {
    editor.destroy();
    editor = null;
  }

  // Create editor container
  container.innerHTML = '<div id="tiptap-editor"></div>';
  const editorElement = container.querySelector('#tiptap-editor');

  // Initialize Tiptap
  editor = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6]
        }
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true
      }),
      Mathematics.configure({
        katexOptions: {
          throwOnError: false
        }
      }),
      Link.configure({
        openOnClick: false
      }),
      Placeholder.configure({
        placeholder: 'Start writing...'
      }),
      WikiLink,
      TagHighlight,
      Transclusion,
      SlashCommand
    ],
    content: currentContent,
    editorProps: {
      attributes: {
        class: 'tiptap-editor'
      }
    },
    onUpdate: ({ editor }) => {
      currentContent = editor.storage.markdown.getMarkdown();
      if (onChangeCallback) {
        onChangeCallback(currentContent);
      }
      if (onHistoryCallback) {
        const canUndo = editor.can().undo();
        const canRedo = editor.can().redo();
        onHistoryCallback({ undo: canUndo ? 1 : 0, redo: canRedo ? 1 : 0 });
      }
    },
    onCreate: ({ editor }) => {
      // Set initial content as markdown
      if (currentContent) {
        editor.commands.setContent(currentContent);
      }
    }
  });

  // Set up keyboard shortcuts
  editor.commands.setKeyboardShortcuts({
    'Mod-b': () => editor.chain().focus().toggleBold().run(),
    'Mod-i': () => editor.chain().focus().toggleItalic().run(),
    'Mod-k': () => {
      const url = prompt('Enter URL:');
      if (url) {
        editor.chain().focus().setLink({ href: url }).run();
      }
      return true;
    },
    'Alt-ArrowUp': () => {
      // Move line up - not directly supported in Tiptap
      return false;
    },
    'Alt-ArrowDown': () => {
      // Move line down - not directly supported in Tiptap
      return false;
    }
  });
}

export function undo() {
  if (editor) editor.chain().focus().undo().run();
}

export function redo() {
  if (editor) editor.chain().focus().redo().run();
}

export function getHistorySize() {
  if (!editor) return { undo: 0, redo: 0 };
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();
  return { undo: canUndo ? 1 : 0, redo: canRedo ? 1 : 0 };
}

export function getContent() {
  return editor ? editor.storage.markdown.getMarkdown() : currentContent;
}

export function setContent(content) {
  currentContent = content;
  if (editor) {
    editor.commands.setContent(content);
  }
}

export function setEditorOptions(options = {}) {
  // Tiptap doesn't have a direct setOption API
  // Options are configured during initialization
  console.warn('setEditorOptions not fully supported in Tiptap');
}

export function insertTextAtCursor(text) {
  if (!text) return;
  if (editor) {
    editor.chain().focus().insertContent(text).run();
  } else {
    currentContent = (currentContent || '') + text;
  }
}

export async function destroyEditor() {
  if (editor) {
    transclusionCache.clear();
    editor.destroy();
    editor = null;
  }
}
