# Tiptap Migration Documentation

## Overview

This document describes the migration from CodeMirror 5 to Tiptap for the H3LPeR markdown editor.

## What Was Changed

### 1. Dependencies Added

**npm packages installed:**
- `@tiptap/core` - Core Tiptap editor framework
- `@tiptap/starter-kit` - Essential Tiptap extensions (headings, bold, italic, lists, etc.)
- `@tiptap/markdown` - Bidirectional Markdown ↔ Rich text conversion
- `@tiptap/extension-mathematics` - KaTeX math rendering support
- `@tiptap/extension-link` - Link handling
- `@tiptap/extension-placeholder` - Placeholder text
- `@tiptap/suggestion` - Autocomplete/suggestion system (used for slash commands)
- `@tiptap/pm` - ProseMirror dependencies
- `katex` - Math rendering library
- `esbuild` (dev) - Module bundler

### 2. Build System

Created `build.js` to bundle Tiptap and its dependencies:
- Bundles `public/js/editor-tiptap.js` into `public/js/editor.js`
- Outputs ES modules format for browser
- Generates source maps for debugging
- Added `npm run build` script to package.json
- Updated `npm start` to run build before starting server

### 3. Editor Implementation

**New file:** `public/js/editor-tiptap.js`

Implements the following features:

#### Core Editor Setup
- Tiptap Editor with StarterKit, Markdown, Mathematics, Link, and Placeholder extensions
- Bidirectional markdown conversion (stores and retrieves markdown)
- Same API as CodeMirror editor for compatibility with existing code

#### Custom Extensions

1. **WikiLink Extension**
   - Decorates `[[link]]` and `[[link|alias]]` syntax
   - Clickable wiki-links that open files
   - Creates new files if they don't exist (with confirmation)
   - Highlights links with dotted underline

2. **TagHighlight Extension**
   - Decorates `#tag` syntax
   - Matches pattern: `#[A-Za-z0-9_.-]+[A-Za-z0-9]`
   - Only matches at line start or after whitespace
   - Highlights in cyan color

3. **Transclusion Extension**
   - Renders `![[filename]]` as embedded content previews
   - Fetches file content asynchronously
   - Shows first 15 lines of content
   - Displays "not found" message for missing files
   - Clickable to open the source file

4. **SlashCommand Extension**
   - Port of CodeMirror slash command system to Tiptap's Suggestion API
   - Triggered by `/` at line start
   - Provides menu with keyboard navigation
   - Templates: `/today`, `/meeting`, `/todo`, `/note`, `/link`, `/embed`, `/code`, `/table`

#### API Functions (maintains compatibility)
- `initEditor(container, content, onChange, onHistory)` - Initialize editor
- `getContent()` - Get markdown content
- `setContent(content)` - Set markdown content
- `undo()` - Undo last change
- `redo()` - Redo last undone change
- `getHistorySize()` - Get undo/redo state
- `insertTextAtCursor(text)` - Insert text at cursor
- `destroyEditor()` - Clean up editor
- `setEditorOptions(options)` - Configure editor (limited in Tiptap)

### 4. CSS Styling

Added comprehensive Tiptap styles to `public/css/style.css`:

- `.tiptap-editor` - Main editor container styling
- `.ProseMirror` - ProseMirror-specific styles
- Markdown element styling (headings, lists, code, blockquotes, tables)
- `.wikilink` - Wiki-link highlighting
- `.tag` - Tag highlighting
- `.transclusion-widget` - Transclusion embed styling
- `.slash-menu` - Slash command menu styling
- Math widget styles for KaTeX
- Selection and focus styles

### 5. HTML Template Updates

Modified `views/editor.ejs`:
- Removed all CodeMirror CDN script/style tags
- Kept KaTeX CDN (still needed for math rendering)
- No new script tags needed (bundled editor loaded by existing module system)

### 6. Backups

- Original CodeMirror editor backed up as `public/js/editor-codemirror.js`
- Can be restored if needed

## What Was Gained

### 1. Modern Architecture
- **ProseMirror-based**: Battle-tested document model with proper schema
- **Active Development**: Tiptap is actively maintained (vs CodeMirror 5 which is legacy)
- **npm Package**: Proper dependency management instead of CDN loading

### 2. Better User Experience
- **WYSIWYG Editing**: True rich-text editing instead of syntax highlighting
- **Semantic HTML**: Output is proper HTML, not just styled text
- **Better Mobile Support**: Touch-optimized interactions
- **Accessibility**: Improved keyboard navigation and screen reader support

### 3. Developer Experience
- **Modular Extensions**: Easier to add new features
- **Better APIs**: More intuitive extension development
- **TypeScript Support**: Better type safety (if migrated)
- **Documentation**: Comprehensive docs at tiptap.dev

### 4. Future Potential
- **Real-time Collaboration**: Built-in support via Yjs integration
- **Version History**: Pro extension available
- **AI Integration**: Autocomplete and AI writing features
- **File Handling**: Drag-and-drop support for images/files
- **Better Tables**: More intuitive table editing

## What Was Lost/Changed

### 1. Features Not Ported
- **Code Folding**: Not supported in Tiptap (would need custom extension)
- **Line Movement (Alt+Up/Down)**: Not directly supported in ProseMirror
- **List Indent Colors**: Not yet implemented (would need custom extension)
- **Fold Gutter**: No equivalent in Tiptap

### 2. Behavior Changes
- **Tab/Shift-Tab**: Uses Tiptap's default list indentation (still works, but different implementation)
- **Editor Mode**: WYSIWYG instead of raw markdown (still stores markdown)
- **Math Rendering**: Now handled by Tiptap's Mathematics extension instead of custom CodeMirror widgets

## Testing Checklist

- [ ] Editor initializes without errors
- [ ] Markdown is properly loaded and saved
- [ ] Wiki-links `[[link]]` are highlighted and clickable
- [ ] Tags `#tag` are highlighted
- [ ] Slash commands work (`/today`, `/meeting`, etc.)
- [ ] Math rendering works (`$inline$` and `$$block$$`)
- [ ] Transclusions `![[file]]` show embedded content
- [ ] Keyboard shortcuts work (Ctrl+B, Ctrl+I, Ctrl+K)
- [ ] Undo/redo works
- [ ] Content saves correctly
- [ ] Works on mobile devices
- [ ] No console errors

## Rollback Instructions

If issues arise and you need to rollback:

1. Restore the original editor:
   ```bash
   cp public/js/editor-codemirror.js public/js/editor.js
   ```

2. Update `views/editor.ejs` to restore CodeMirror CDN links:
   ```html
   <!-- CodeMirror 5 -->
   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
   <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
   <!-- ... other CodeMirror scripts ... -->
   ```

3. Remove Tiptap packages (optional):
   ```bash
   npm uninstall @tiptap/core @tiptap/starter-kit @tiptap/markdown @tiptap/extension-mathematics @tiptap/extension-link @tiptap/extension-placeholder @tiptap/suggestion @tiptap/pm katex
   ```

## Next Steps

1. **Test thoroughly**: Run through all features with real usage
2. **Add missing features**: Implement list indent colors if needed
3. **Optimize bundle size**: Consider code splitting if bundle is too large
4. **Add tests**: Write automated tests for custom extensions
5. **Consider collaboration**: Explore Yjs integration for real-time editing
6. **Improve math UX**: Consider inline math editor for better UX
7. **Mobile testing**: Ensure touch interactions work well

## Resources

- [Tiptap Documentation](https://tiptap.dev/docs)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [Tiptap Extensions](https://tiptap.dev/docs/editor/extensions)
- [Mathematics Extension](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
- [Creating Custom Extensions](https://tiptap.dev/docs/editor/extensions/custom-extensions)
