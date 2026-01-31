const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

class ResearchService {
  constructor(config, claudeService, options = {}) {
    this.config = config;
    this.claude = claudeService;
    this.cacheKeyPrefix = options.cacheKeyPrefix || 'research';
    this.rankerLabel = options.rankerLabel || 'Primary';
    this.rankerModel = options.rankerModel || this.claude?.model || null;
    this.parser = new Parser({
      timeout: 15000,
      headers: {
        'User-Agent': 'Writer-App/1.0'
      },
      customFields: {
        item: [
          ['dc:creator', 'creator'],
          ['arxiv:primary_category', 'primaryCategory'],
          ['arxiv:comment', 'comment']
        ]
      }
    });

    const dataDirName = options.dataDirName || 'research';
    this.dataDir = path.join(__dirname, `../data/${dataDirName}/`);
    this.cache = new Map();
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours (ArXiv updates once daily)

    // ArXiv categories matching H3LPeR
    this.categories = 'cs.DC+cs.SY+cs.PF+cs.AR';
    this.feedUrl = `https://export.arxiv.org/rss/${this.categories}`;

    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Determine the next iteration number for a given date and write a JSONL file.
   * Filename format: YYYY-MM-DD-N.jsonl (one JSON object per line).
   */
  saveIteration(date, papers) {
    try {
      const existing = fs.readdirSync(this.dataDir)
        .filter(f => f.startsWith(date + '-') && f.endsWith('.jsonl'));
      const iterations = existing.map(f => {
        const match = f.match(new RegExp(`^${date}-(\\d+)\\.jsonl$`));
        return match ? parseInt(match[1], 10) : 0;
      });
      const nextIter = iterations.length > 0 ? Math.max(...iterations) + 1 : 1;
      const filename = `${date}-${nextIter}.jsonl`;
      const filepath = path.join(this.dataDir, filename);
      const lines = papers.map(p => JSON.stringify(p)).join('\n');
      fs.writeFileSync(filepath, lines + '\n');
      console.log(`Saved research iteration: ${filename} (${papers.length} papers)`);
      return filepath;
    } catch (error) {
      console.error('Error saving research iteration:', error);
      return null;
    }
  }

  /**
   * Find the highest-iteration JSONL file for a given date, read and parse lines.
   */
  loadLatestIteration(date) {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => f.startsWith(date + '-') && f.endsWith('.jsonl'));
      if (files.length === 0) return null;

      const iterations = files.map(f => {
        const match = f.match(new RegExp(`^${date}-(\\d+)\\.jsonl$`));
        return { file: f, iter: match ? parseInt(match[1], 10) : 0 };
      });
      iterations.sort((a, b) => b.iter - a.iter);
      const latest = iterations[0].file;

      const content = fs.readFileSync(path.join(this.dataDir, latest), 'utf-8');
      const papers = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      return papers;
    } catch (error) {
      console.error(`Error loading research iteration for ${date}:`, error);
      return null;
    }
  }

  async fetchPapers() {
    try {
      console.log(`Fetching papers from ${this.feedUrl}`);
      const feed = await this.parser.parseURL(this.feedUrl);

      return feed.items.map(item => ({
        id: this.extractArxivId(item.link || item.guid),
        title: this.cleanTitle(item.title),
        authors: this.parseAuthors(item.creator || item.author),
        abstract: this.cleanAbstract(item.content || item.contentSnippet || item.summary || ''),
        url: item.link || item.guid,
        date: item.pubDate || item.isoDate,
        comment: item.comment || null
      }));
    } catch (error) {
      console.error('Error fetching ArXiv feed:', error.message);
      return [];
    }
  }

  extractArxivId(url) {
    const match = url?.match(/arxiv\.org\/abs\/([0-9.]+)/);
    return match ? match[1] : url;
  }

  cleanTitle(title) {
    return (title || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\(arXiv:[^)]+\)\s*$/, '')
      .trim();
  }

  parseAuthors(creatorString) {
    if (!creatorString) return [];
    return creatorString
      .split(/[,\n]/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
  }

  cleanAbstract(abstract) {
    return (abstract || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async rankAndSelectTop5(articles, batchSize = 20) {
    /**
     * Use Claude to rank articles in a batch and select the top 5.
     * Matches H3LPeR's research.py logic.
     */
    if (!this.claude || !this.claude.isAvailable() || articles.length <= 5) {
      return articles.slice(0, 5);
    }

    // Format articles for Claude
    const articleList = articles.map((article, i) =>
      `[${i}] ${article.title}\n` +
      `Summary: ${(article.abstract || '').substring(0, 200)}...\n` +
      `URL: ${article.url}`
    );

    const prompt = `You are reviewing ${articles.length} research articles from arXiv.
Please analyze these articles and select the TOP 5 most interesting, relevant, or impactful papers.
Focus on: novelty, potential impact, clarity of contribution, and relevance to distributed systems, performance, and computer architecture.

Articles to review:
${articleList.join('\n\n')}

Respond with ONLY a JSON array of the 5 indices you selected (e.g., [3, 7, 12, 1, 18]).
No explanation, just the JSON array.`;

    try {
      const response = await this.claude.generate(prompt);

      // Parse the response to get indices
      const match = response.match(/\[[\d,\s]+\]/);
      if (match) {
        const selectedIndices = JSON.parse(match[0]);
        return selectedIndices
          .filter(i => i < articles.length)
          .slice(0, 5)
          .map(i => articles[i]);
      }
    } catch (error) {
      console.error('Error parsing Claude response:', error);
    }

    // Fallback to first 5
    return articles.slice(0, 5);
  }

  async reduceArticles(articles, target = 5, batchSize = 20) {
    /**
     * Recursively reduce articles by selecting top 5 from groups of 20.
     * Matches H3LPeR's research.py _reduce_articles logic.
     */
    let current = [...articles];
    console.log(`Reducing from ${articles.length} to ${target} in batches of ${batchSize}`);

    while (current.length > target) {
      // Split into batches
      const batches = [];
      for (let i = 0; i < current.length; i += batchSize) {
        batches.push(current.slice(i, i + batchSize));
      }

      // Select top 5 from each batch using Claude
      const reduced = [];
      for (const batch of batches) {
        const top5 = await this.rankAndSelectTop5(batch, batch.length);
        reduced.push(...top5);
      }

      // If we didn't reduce, break to avoid infinite loop
      if (reduced.length >= current.length) {
        break;
      }

      current = reduced;
    }

    // Final selection if we still have more than target
    if (current.length > target) {
      current = await this.rankAndSelectTop5(current, current.length);
    }

    return current.slice(0, target);
  }

  async getResearch(date = null, forceRefresh = false) {
    const today = date || new Date().toISOString().split('T')[0];
    const cacheKey = `${this.cacheKeyPrefix}-${today}`;

    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        if (!cached.data?.ranker) {
          cached.data.ranker = {
            label: this.rankerLabel,
            model: this.rankerModel,
            available: this.claude?.isAvailable?.() || false
          };
        }
        return cached.data;
      }
    }

    // Check if we have this date's papers on disk
    if (!forceRefresh) {
      const storedPapers = this.loadLatestIteration(today);
      if (storedPapers && storedPapers.length > 0) {
        const result = {
          date: today,
          papers: storedPapers,
          categories: this.categories.split('+'),
          ranker: {
            label: this.rankerLabel,
            model: this.rankerModel,
            available: this.claude?.isAvailable?.() || false
          }
        };
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    }

    // Fetch fresh papers
    console.log('Fetching fresh ArXiv papers...');
    const papers = await this.fetchPapers();
    console.log(`Fetched ${papers.length} papers`);

    // Apply recursive reduction: top 5 from groups of 20
    const top5 = await this.reduceArticles(papers, 5, 20);

    // Add rank to papers
    const rankedPapers = top5.map((paper, index) => ({
      ...paper,
      rank: index + 1
    }));

    // Save as a new iteration file
    this.saveIteration(today, rankedPapers);

    // Clean up old files (keep last 30 days)
    this.cleanOldFiles(30);

    const result = {
      date: today,
      papers: rankedPapers,
      categories: this.categories.split('+'),
      totalFetched: papers.length,
      ranker: {
        label: this.rankerLabel,
        model: this.rankerModel,
        available: this.claude?.isAvailable?.() || false
      }
    };

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  async getHistoricalPapers(date) {
    const papers = this.loadLatestIteration(date);
    if (papers && papers.length > 0) {
      return {
        date,
        papers,
        categories: this.categories.split('+'),
        ranker: {
          label: this.rankerLabel,
          model: this.rankerModel,
          available: this.claude?.isAvailable?.() || false
        }
      };
    }
    return null;
  }

  getAvailableDates() {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => f.endsWith('.jsonl'));
      const dates = new Set();
      for (const f of files) {
        const match = f.match(/^(\d{4}-\d{2}-\d{2})-\d+\.jsonl$/);
        if (match) dates.add(match[1]);
      }
      return Array.from(dates).sort().reverse();
    } catch (error) {
      console.error('Error reading available dates:', error);
      return [];
    }
  }

  cleanOldFiles(keepDays) {
    try {
      const dates = this.getAvailableDates();
      if (dates.length <= keepDays) return;

      const datesToRemove = dates.slice(keepDays);
      for (const date of datesToRemove) {
        const files = fs.readdirSync(this.dataDir)
          .filter(f => f.startsWith(date + '-') && f.endsWith('.jsonl'));
        for (const f of files) {
          fs.unlinkSync(path.join(this.dataDir, f));
        }
      }
    } catch (error) {
      console.error('Error cleaning old research files:', error);
    }
  }
}

module.exports = ResearchService;
