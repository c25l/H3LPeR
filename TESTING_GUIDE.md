# Quick Start: Testing the Tiptap Migration

## Prerequisites

You need a complete H3LPeR codebase with `server/services/vault.js` present. This file was missing from the repository during migration.

## How to Test

### 1. Install Dependencies

```bash
npm install
```

This will install all Tiptap dependencies and esbuild.

### 2. Build the Editor

```bash
npm run build
```

This bundles Tiptap and generates `public/js/editor.js`.

### 3. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 4. Open the App

Navigate to `http://localhost:3000` (or your configured port).

## What to Test

### Basic Functionality
- [ ] Editor loads without errors (check browser console)
- [ ] Can type text
- [ ] Text persists after save/reload
- [ ] Undo/Redo buttons work

### Markdown Features
- [ ] Type `# Heading` and press Enter - should render as large heading
- [ ] Type `**bold**` - should render as bold text
- [ ] Type `*italic*` - should render as italic text
- [ ] Type lists with `- item` or `1. item`
- [ ] Type code with backticks: \`code\`
- [ ] Type code block with triple backticks

### Wiki-Links
- [ ] Type `[[Some Page]]` - should be highlighted and clickable
- [ ] Click a wiki-link - should open the file (or prompt to create)
- [ ] Type `[[Page|Display Text]]` - should show Display Text

### Tags
- [ ] Type `#project` - should be highlighted in cyan
- [ ] Type `#work-notes` - should support dashes
- [ ] Type `#v2.0` - should support dots and numbers

### Transclusions
- [ ] Type `![[filename]]` on its own line
- [ ] Should show embedded content preview
- [ ] Click on it - should open the source file

### Slash Commands
- [ ] Type `/` at the start of a line
- [ ] Menu should appear
- [ ] Type `/today` and press Enter - should insert date heading
- [ ] Try other commands: `/meeting`, `/todo`, `/note`, `/link`, `/embed`, `/code`, `/table`
- [ ] Arrow keys should navigate menu
- [ ] Escape should close menu

### Math Rendering (KaTeX)
- [ ] Type `$E = mc^2$` - should render inline math
- [ ] Type on separate line:
  ```
  $$
  \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
  $$
  ```
  Should render as block math

### Keyboard Shortcuts
- [ ] `Ctrl+B` / `Cmd+B` - should make text bold
- [ ] `Ctrl+I` / `Cmd+I` - should make text italic
- [ ] `Ctrl+K` / `Cmd+K` - should prompt for link URL
- [ ] `Ctrl+Z` / `Cmd+Z` - should undo
- [ ] `Ctrl+Shift+Z` / `Cmd+Shift+Z` - should redo

### Mobile Testing (if available)
- [ ] Editor works on touch device
- [ ] Can select text with touch
- [ ] Virtual keyboard appears
- [ ] All features work on mobile

## Common Issues

### Editor Not Loading

**Check browser console for errors:**
```
Failed to load module script
```
→ Make sure you ran `npm run build`

**"Cannot find module" errors:**
→ Run `npm install` to install dependencies

### Styles Look Wrong

→ Make sure `public/css/style.css` includes the Tiptap styles (at the end of file)

### Build Fails

```
ERROR: No matching export
```
→ Check that all imports in `editor-tiptap.js` match the package exports

### Math Not Rendering

→ Check that KaTeX CDN is loaded in `views/editor.ejs`:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
```

## Rollback if Needed

If you need to revert to CodeMirror:

```bash
# Restore old editor
cp public/js/editor-codemirror.js public/js/editor.js

# Restore old HTML template (add CodeMirror CDN scripts back)
git checkout HEAD -- views/editor.ejs
```

See `TIPTAP_MIGRATION.md` for full rollback instructions.

## Performance Testing

### Load Time
- Measure initial page load time
- Bundle size: ~350KB gzipped
- Should load in < 2 seconds on reasonable connection

### Editing Performance
- Type rapidly in a large document (10,000+ words)
- Should feel responsive
- No lag when typing

### Memory Usage
- Open Chrome DevTools → Performance → Memory
- Should not leak memory over time

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

## Reporting Issues

If you find bugs, note:
1. **What you did** (steps to reproduce)
2. **What happened** (actual behavior)
3. **What you expected** (expected behavior)
4. **Browser/device** (Chrome on macOS, Safari on iPhone, etc.)
5. **Console errors** (if any)

## Success Criteria

✅ **Migration is successful if:**
- All basic markdown editing works
- Wiki-links are clickable
- Tags are highlighted
- Slash commands insert templates
- Math renders correctly
- No console errors
- Performance is acceptable
- Works on mobile

🎉 **If all tests pass, the migration is complete!**

## Next Steps After Testing

1. Deploy to production (if hosted)
2. Monitor for issues
3. Consider adding:
   - List indent colors (custom extension)
   - Image paste support
   - Table editing UI
   - Collaborative editing (Yjs)

## Questions?

See full documentation:
- `TIPTAP_MIGRATION.md` - Technical details
- `TIPTAP_ANALYSIS.md` - Why we migrated and what we gained
