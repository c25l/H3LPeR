const express = require('express');
const router = express.Router();
const path = require('path');
const { getPolicyForPath, validateOperation } = require('../services/restrictions');
const { AppError, asyncHandler } = require('../middleware/error-handler');
const logger = require('../logger');

// GET /api/files - List all files
router.get('/files', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const folder = req.query.folder || '';
  const files = await vault.listFiles(folder);
  res.json(files);
}));

router.get('/files/*', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const filePath = req.params[0];
  const file = await vault.readFile(filePath);

  if (!file) {
    throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
  }

  // Include modification time for conflict detection
  const stats = await vault.getStats(filePath);
  const policy = getPolicyForPath(req.app.locals.config, filePath);
  res.json({
    ...file,
    modified: stats?.modified || null,
    policy
  });
}));

// PUT /api/files/:path - Update file
router.put('/files/*', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const backlinks = req.app.locals.backlinks;
  const filePath = req.params[0];
  const { content, lastModified } = req.body;

  const validation = validateOperation({
    config: req.app.locals.config,
    operation: 'update',
    path: filePath,
    content
  });

  if (!validation.ok) {
    const err = new AppError(validation.error, 403, 'POLICY_VIOLATION');
    err.policy = validation.policy;
    throw err;
  }

  // Conflict detection: if client sends lastModified, check against current file mtime
  if (lastModified) {
    const stats = await vault.getStats(filePath);
    if (stats) {
      const serverModified = new Date(stats.modified).getTime();
      const clientModified = new Date(lastModified).getTime();

      if (serverModified > clientModified) {
        // File was modified on server after the client's last known version
        const serverFile = await vault.readFile(filePath);
        const err = new AppError('File has been modified', 409, 'CONFLICT');
        err.details = {
          serverContent: serverFile?.content || '',
          serverModified: stats.modified
        };
        throw err;
      }
    }
  }

  await vault.writeFile(filePath, content);

  // Get the new mtime after write
  const newStats = await vault.getStats(filePath);

  // Update backlinks index
  await backlinks.updateFile(filePath);
  res.json({ success: true, modified: newStats?.modified || new Date().toISOString() });
}));

// POST /api/files/:path - Create file
router.post('/files/*', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const backlinks = req.app.locals.backlinks;
  const filePath = req.params[0];
  const { content } = req.body;

  const validation = validateOperation({
    config: req.app.locals.config,
    operation: 'create',
    path: filePath,
    content
  });

  if (!validation.ok) {
    const err = new AppError(validation.error, 403, 'POLICY_VIOLATION');
    err.policy = validation.policy;
    throw err;
  }

  const exists = await vault.exists(filePath);
  if (exists) {
    throw new AppError('File already exists', 409, 'FILE_EXISTS');
  }

  await vault.createFile(filePath, content || '');
  await backlinks.updateFile(filePath);

  res.status(201).json({ success: true, path: filePath });
}));

// DELETE /api/files/:path - Delete file
router.delete('/files/*', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const backlinks = req.app.locals.backlinks;
  const filePath = req.params[0];

  const validation = validateOperation({
    config: req.app.locals.config,
    operation: 'delete',
    path: filePath
  });

  if (!validation.ok) {
    const err = new AppError(validation.error, 403, 'POLICY_VIOLATION');
    err.policy = validation.policy;
    throw err;
  }

  await vault.deleteFile(filePath);
  backlinks.removeFile(filePath);
  res.json({ success: true });
}));

// GET /api/policy - Get restrictions policy for a path
router.get('/policy', asyncHandler(async (req, res) => {
  const filePath = req.query.path || '';
  const policy = getPolicyForPath(req.app.locals.config, filePath);
  res.json(policy);
}));

// GET /api/tree - Get tree for a type
router.get('/tree', asyncHandler(async (req, res) => {
  const type = req.query.type || 'files';
  if (type !== 'files') {
    throw new AppError('Unsupported tree type', 400, 'INVALID_PARAM');
  }

  const vault = req.app.locals.vault;
  const root = req.query.root || '';
  const items = await vault.getTree(root);
  res.json({ type, root, items });
}));

// POST /api/tree/files - Create file/folder
router.post('/tree/files', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const backlinks = req.app.locals.backlinks;
  const { path: nodePath, nodeType, content } = req.body;

  if (!nodePath || !nodeType) {
    throw new AppError('path and nodeType are required', 400, 'MISSING_PARAM');
  }

  const validation = validateOperation({
    config: req.app.locals.config,
    operation: 'create',
    path: nodePath,
    content: nodeType === 'file' ? content : ''
  });

  if (!validation.ok) {
    const err = new AppError(validation.error, 403, 'POLICY_VIOLATION');
    err.policy = validation.policy;
    throw err;
  }

  if (nodeType === 'folder') {
    await vault.createFolder(nodePath);
    return res.status(201).json({ success: true, path: nodePath });
  }

  const exists = await vault.exists(nodePath);
  if (exists) {
    throw new AppError('File already exists', 409, 'FILE_EXISTS');
  }

  await vault.createFile(nodePath, content || '');
  await backlinks.updateFile(nodePath);

  res.status(201).json({ success: true, path: nodePath });
}));

// PUT /api/tree/files - Rename or move file/folder
router.put('/tree/files', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const backlinks = req.app.locals.backlinks;
  const { from, to } = req.body;

  if (!from || !to) {
    throw new AppError('from and to are required', 400, 'MISSING_PARAM');
  }

  const validation = validateOperation({
    config: req.app.locals.config,
    operation: 'rename',
    path: from,
    to
  });

  if (!validation.ok) {
    const err = new AppError(validation.error, 403, 'POLICY_VIOLATION');
    err.policy = validation.policy;
    throw err;
  }

  await vault.renamePath(from, to);
  if (from.endsWith('.md') || to.endsWith('.md')) {
    backlinks.removeFile(from);
    await backlinks.updateFile(to);
  } else {
    await backlinks.buildIndex();
  }

  res.json({ success: true, from, to });
}));

// DELETE /api/tree/files - Delete file/folder
router.delete('/tree/files', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const backlinks = req.app.locals.backlinks;
  const { path: nodePath, nodeType, hardDelete } = req.body;

  if (!nodePath || !nodeType) {
    throw new AppError('path and nodeType are required', 400, 'MISSING_PARAM');
  }

  const validation = validateOperation({
    config: req.app.locals.config,
    operation: 'delete',
    path: nodePath
  });

  if (!validation.ok) {
    const err = new AppError(validation.error, 403, 'POLICY_VIOLATION');
    err.policy = validation.policy;
    throw err;
  }

  await vault.deletePath(nodePath, Boolean(hardDelete));

  if (nodeType === 'file') {
    backlinks.removeFile(nodePath);
  } else {
    await backlinks.buildIndex();
  }

  res.json({ success: true });
}));

// GET /api/backlinks/:path - Get backlinks for file
router.get('/backlinks/*', asyncHandler(async (req, res) => {
  const backlinksService = req.app.locals.backlinks;
  const filePath = req.params[0];
  const links = backlinksService.getBacklinks(filePath);
  res.json(links);
}));

// GET /api/journal/:year/:month - Get journal entries for month
router.get('/journal/:year/:month', asyncHandler(async (req, res) => {
  const journal = req.app.locals.journal;
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new AppError('Invalid year or month', 400, 'INVALID_PARAM');
  }

  const entries = await journal.getMonthEntries(year, month);
  res.json(entries);
}));

// POST /api/journal/:date - Create/get journal entry
router.post('/journal/:date', asyncHandler(async (req, res) => {
  const journal = req.app.locals.journal;
  const parts = req.params.date.split('-');
  if (parts.length !== 3) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400, 'INVALID_DATE');
  }
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

  if (isNaN(date.getTime())) {
    throw new AppError('Invalid date', 400, 'INVALID_DATE');
  }

  const entry = await journal.getOrCreateEntry(date);
  res.json(entry);
}));

// POST /api/journal/:date/with-agenda - Create journal with calendar events
router.post('/journal/:date/with-agenda', asyncHandler(async (req, res) => {
  const journal = req.app.locals.journal;
  const parts = req.params.date.split('-');
  if (parts.length !== 3) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400, 'INVALID_DATE');
  }
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

  if (isNaN(date.getTime())) {
    throw new AppError('Invalid date', 400, 'INVALID_DATE');
  }

  const events = req.body.events || [];
  const entry = await journal.getOrCreateEntryWithAgenda(date, events);
  res.json(entry);
}));

// POST /api/journal/:date/add-agenda - Add/replace agenda in journal
router.post('/journal/:date/add-agenda', asyncHandler(async (req, res) => {
  const journal = req.app.locals.journal;
  const parts = req.params.date.split('-');
  if (parts.length !== 3) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400, 'INVALID_DATE');
  }
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

  if (isNaN(date.getTime())) {
    throw new AppError('Invalid date', 400, 'INVALID_DATE');
  }

  const events = req.body.events || [];
  const entry = await journal.addAgendaToEntry(date, events);
  res.json(entry);
}));

// GET /api/search - Search files
router.get('/search', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const query = req.query.q || '';

  if (!query.trim()) {
    return res.json([]);
  }

  const results = await vault.search(query);
  res.json(results);
}));

// GET /api/tags - Get all tags across all files
router.get('/tags', asyncHandler(async (req, res) => {
  const vault = req.app.locals.vault;
  const files = await vault.listFiles('', true);
  const tagMap = new Map();
  const tagPattern = /(?:^|\s)(#[A-Za-z0-9_.-]*[A-Za-z0-9])/g;

  for (const file of files) {
    if (file.path && file.path.endsWith('.md')) {
      try {
        const content = await vault.readFile(file.path);
        if (content && content.content) {
          const matches = [...content.content.matchAll(tagPattern)];
          const fileTags = new Map();

          matches.forEach(match => {
            const tag = match[1];
            fileTags.set(tag, (fileTags.get(tag) || 0) + 1);
          });

          fileTags.forEach((count, tag) => {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, []);
            }
            tagMap.get(tag).push({ file: file.path, count });
          });
        }
      } catch (err) {
        logger.warn('tags', `Error reading ${file.path}`, err);
      }
    }
  }

  const tags = Array.from(tagMap.entries()).map(([tag, files]) => ({
    tag,
    files,
    totalCount: files.reduce((sum, f) => sum + f.count, 0)
  })).sort((a, b) => b.totalCount - a.totalCount);

  res.json(tags);
}));

module.exports = router;
