const path = require('path');

class BacklinksService {
  constructor(vaultService) {
    this.vault = vaultService;
    // Map of target -> Set of sources that link to it
    this.index = new Map();
    // Map of source -> Set of targets it links to
    this.outlinks = new Map();
  }

  // Parse wiki-links from content
  parseLinks(content) {
    const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const links = new Set();
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      // Normalize link: add .md if needed, handle paths
      let link = match[1].trim();
      if (!link.endsWith('.md')) {
        link = link + '.md';
      }
      links.add(link);
    }

    return Array.from(links);
  }

  // Build full index from all files
  async buildIndex() {
    this.index.clear();
    this.outlinks.clear();

    const files = await this.vault.listFiles();

    for (const file of files) {
      const data = await this.vault.readFile(file.path);
      if (data) {
        this.updateFileLinks(file.path, data.content);
      }
    }

    return {
      files: files.length,
      links: Array.from(this.index.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }

  // Update file in index (reads content from vault)
  async updateFile(filePath) {
    const data = await this.vault.readFile(filePath);
    if (data) {
      this.updateFileLinks(filePath, data.content);
    }
  }

  // Update links for a single file
  updateFileLinks(sourcePath, content) {
    // Remove old outlinks from this file
    const oldOutlinks = this.outlinks.get(sourcePath) || new Set();
    for (const target of oldOutlinks) {
      const backlinks = this.index.get(target);
      if (backlinks) {
        backlinks.delete(sourcePath);
        if (backlinks.size === 0) {
          this.index.delete(target);
        }
      }
    }

    // Parse new links
    const links = this.parseLinks(content);
    this.outlinks.set(sourcePath, new Set(links));

    // Add new backlinks
    for (const target of links) {
      // Resolve relative links based on source file's directory
      const resolvedTarget = this.resolveLink(sourcePath, target);

      if (!this.index.has(resolvedTarget)) {
        this.index.set(resolvedTarget, new Set());
      }
      this.index.get(resolvedTarget).add(sourcePath);
    }
  }

  // Remove file from index
  removeFile(filePath) {
    // Remove as source
    const outlinks = this.outlinks.get(filePath);
    if (outlinks) {
      for (const target of outlinks) {
        const backlinks = this.index.get(target);
        if (backlinks) {
          backlinks.delete(filePath);
          if (backlinks.size === 0) {
            this.index.delete(target);
          }
        }
      }
      this.outlinks.delete(filePath);
    }

    // Remove as target
    this.index.delete(filePath);
  }

  // Resolve a link relative to source file
  resolveLink(sourcePath, link) {
    // If link has no path separators, it's in the same directory or root
    if (!link.includes('/') && !link.includes('\\')) {
      // Obsidian-style: links without paths resolve to file anywhere in vault
      // For simplicity, we'll treat them as root-relative
      return link;
    }

    // Relative path resolution
    const sourceDir = path.dirname(sourcePath);
    return path.normalize(path.join(sourceDir, link));
  }

  // Get backlinks for a file
  getBacklinks(filePath) {
    // Try both with and without .md extension
    let normalized = filePath;
    if (!normalized.endsWith('.md')) {
      normalized = normalized + '.md';
    }

    const backlinks = this.index.get(normalized) || new Set();

    // Also check without .md for files that link using just the name
    const withoutMd = normalized.replace(/\.md$/, '');
    const backlinksNoExt = this.index.get(withoutMd) || new Set();

    // Combine and format results
    const allPaths = new Set([...backlinks, ...backlinksNoExt]);

    return Array.from(allPaths).map(sourcePath => ({
      path: sourcePath,
      name: path.basename(sourcePath, '.md'),
      context: this.getLinkContext(sourcePath, normalized) || this.getLinkContext(sourcePath, withoutMd)
    }));
  }

  // Get context around a link in a file
  getLinkContext(sourcePath, targetName) {
    // This is a sync method that returns cached context if available
    // For now, return null - context will be fetched async if needed
    return null;
  }

  // Get outgoing links from a file
  getOutlinks(filePath) {
    return Array.from(this.outlinks.get(filePath) || new Set());
  }

  // Find file by name (for link resolution)
  async findFile(linkName) {
    // Add .md if needed
    let searchName = linkName;
    if (!searchName.endsWith('.md')) {
      searchName = searchName + '.md';
    }

    const files = await this.vault.listFiles();

    // First try exact match
    const exact = files.find(f => f.path === searchName);
    if (exact) return exact.path;

    // Then try matching just the filename
    const byName = files.find(f => f.name === searchName);
    if (byName) return byName.path;

    return null;
  }
}

module.exports = BacklinksService;
