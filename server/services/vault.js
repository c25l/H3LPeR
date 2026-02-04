const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const grayMatter = require('gray-matter');
const logger = require('../logger');

class VaultService {
  constructor(vaultPath) {
    this.vaultPath = path.resolve(vaultPath);
    this.watcher = null;
    this.watchCallbacks = [];
    
    // Ensure vault directory exists
    if (!fsSync.existsSync(this.vaultPath)) {
      fsSync.mkdirSync(this.vaultPath, { recursive: true });
      logger.info('vault', `Created vault directory at ${this.vaultPath}`);
    }
  }

  /**
   * Get absolute path for a file relative to vault
   */
  getAbsolutePath(filePath) {
    const absolute = path.join(this.vaultPath, filePath);
    
    // Security check: ensure path is within vault
    if (!absolute.startsWith(this.vaultPath)) {
      throw new Error('Path outside vault directory');
    }
    
    return absolute;
  }

  /**
   * Check if a file or directory exists
   */
  async exists(filePath) {
    try {
      const absolute = this.getAbsolutePath(filePath);
      await fs.access(absolute);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file with frontmatter parsing
   */
  async readFile(filePath) {
    try {
      const absolute = this.getAbsolutePath(filePath);
      const content = await fs.readFile(absolute, 'utf-8');
      
      // Parse frontmatter if present
      const parsed = grayMatter(content);
      
      return {
        path: filePath,
        content: parsed.content,
        frontmatter: parsed.data,
        raw: content
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write a file with optional frontmatter
   */
  async writeFile(filePath, content, frontmatter = null) {
    const absolute = this.getAbsolutePath(filePath);
    
    // Ensure parent directory exists
    const dir = path.dirname(absolute);
    await fs.mkdir(dir, { recursive: true });
    
    // Prepare content with frontmatter if provided
    let finalContent = content;
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      finalContent = grayMatter.stringify(content, frontmatter);
    }
    
    await fs.writeFile(absolute, finalContent, 'utf-8');
    logger.info('vault', `Wrote file: ${filePath}`);
  }

  /**
   * Create a new file
   */
  async createFile(filePath, content = '', frontmatter = null) {
    const absolute = this.getAbsolutePath(filePath);
    
    // Check if file already exists
    if (fsSync.existsSync(absolute)) {
      throw new Error('File already exists');
    }
    
    await this.writeFile(filePath, content, frontmatter);
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath) {
    const absolute = this.getAbsolutePath(filePath);
    await fs.unlink(absolute);
    logger.info('vault', `Deleted file: ${filePath}`);
  }

  /**
   * Rename or move a file
   */
  async renameFile(oldPath, newPath) {
    const oldAbsolute = this.getAbsolutePath(oldPath);
    const newAbsolute = this.getAbsolutePath(newPath);
    
    // Ensure target directory exists
    const dir = path.dirname(newAbsolute);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.rename(oldAbsolute, newAbsolute);
    logger.info('vault', `Renamed file: ${oldPath} -> ${newPath}`);
  }

  /**
   * Get file statistics (mtime, size, etc.)
   */
  async getStats(filePath) {
    try {
      const absolute = this.getAbsolutePath(filePath);
      const stats = await fs.stat(absolute);
      
      return {
        modified: stats.mtime.toISOString(),
        created: stats.birthtime.toISOString(),
        size: stats.size,
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List files in a directory (or entire vault)
   */
  async listFiles(folder = '') {
    const absolute = folder ? this.getAbsolutePath(folder) : this.vaultPath;
    
    try {
      const items = await fs.readdir(absolute, { withFileTypes: true });
      const files = [];
      
      for (const item of items) {
        const relativePath = folder ? path.join(folder, item.name) : item.name;
        
        if (item.isDirectory()) {
          // Recursively list subdirectories
          const subFiles = await this.listFiles(relativePath);
          files.push(...subFiles);
        } else {
          files.push({
            path: relativePath,
            name: item.name,
            type: 'file'
          });
        }
      }
      
      return files;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get file tree structure
   */
  async getTree(folder = '') {
    const absolute = folder ? this.getAbsolutePath(folder) : this.vaultPath;
    
    try {
      const items = await fs.readdir(absolute, { withFileTypes: true });
      const tree = [];
      
      for (const item of items) {
        const relativePath = folder ? path.join(folder, item.name) : item.name;
        
        if (item.isDirectory()) {
          tree.push({
            path: relativePath,
            name: item.name,
            type: 'directory',
            children: await this.getTree(relativePath)
          });
        } else {
          tree.push({
            path: relativePath,
            name: item.name,
            type: 'file'
          });
        }
      }
      
      // Sort: directories first, then files, alphabetically
      tree.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      return tree;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Search files by content
   */
  async search(query) {
    const files = await this.listFiles();
    const results = [];
    
    for (const fileInfo of files) {
      try {
        const file = await this.readFile(fileInfo.path);
        if (file && file.content.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            path: file.path,
            matches: this.findMatches(file.content, query)
          });
        }
      } catch (error) {
        logger.error('vault', `Error searching file ${fileInfo.path}`, error);
      }
    }
    
    return results;
  }

  /**
   * Find text matches in content
   */
  findMatches(content, query) {
    const lines = content.split('\n');
    const matches = [];
    const lowerQuery = query.toLowerCase();
    
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        matches.push({
          lineNumber: index + 1,
          line: line.trim(),
          preview: this.getContextPreview(lines, index, 2)
        });
      }
    });
    
    return matches;
  }

  /**
   * Get context around a line
   */
  getContextPreview(lines, index, contextLines) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(lines.length, index + contextLines + 1);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Watch for file changes
   */
  watch(callback) {
    if (!this.watcher) {
      this.watcher = chokidar.watch(this.vaultPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
      });

      this.watcher
        .on('add', path => this.notifyWatchers('add', path))
        .on('change', path => this.notifyWatchers('change', path))
        .on('unlink', path => this.notifyWatchers('unlink', path));

      logger.info('vault', 'File watcher started');
    }

    this.watchCallbacks.push(callback);
  }

  /**
   * Notify all watch callbacks
   */
  notifyWatchers(event, absolutePath) {
    // Convert absolute path to relative
    const relativePath = path.relative(this.vaultPath, absolutePath);
    
    this.watchCallbacks.forEach(callback => {
      try {
        callback(event, relativePath);
      } catch (error) {
        logger.error('vault', 'Error in watch callback', error);
      }
    });
  }

  /**
   * Close the watcher
   */
  async close() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('vault', 'File watcher closed');
    }
  }
}

module.exports = VaultService;
