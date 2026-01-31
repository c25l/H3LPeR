const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');

class NewsService {
  constructor(config, embeddingsService, claudeService) {
    this.config = config;
    this.embeddings = embeddingsService;
    this.claude = claudeService;
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Writer-App/1.0'
      }
    });

    this.newsDir = path.join(__dirname, '../data/news/');
    this.techNewsDir = path.join(__dirname, '../data/tech_news/');
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour

    // Match H3LPeR feeds
    this.feeds = [
      { name: 'NYT US', url: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml', category: 'news' },
      { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'news' },
      { name: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/', category: 'news' },
      { name: 'HCR Substack', url: 'https://heathercoxrichardson.substack.com/feed', category: 'news' },
      { name: 'MetaFilter', url: 'https://rss.metafilter.com/metafilter.rss', category: 'community' },
      { name: 'ACOUP', url: 'https://acoup.blog/feed/', category: 'history' },
      { name: 'Longmont Leader', url: 'https://www.longmontleader.com/rss/', category: 'local' },
      { name: 'Nature', url: 'https://www.nature.com/nature.rss', category: 'science' },
      { name: 'r/Longmont', url: 'https://www.reddit.com/r/Longmont.rss', category: 'local' },

      // Tech news feeds
      { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
      // H3LPeR tech feeds
      { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', category: 'tech' },
      { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', category: 'tech' }
    ];

    this.similarityThreshold = 0.85;
    this.corpusDays = 3;  // Fetch 3 days of articles
    this.showDays = 1;    // Only show today's articles

    // Delta processing state: track previously processed articles and clusters
    this.knownArticleIds = new Set();    // IDs of articles we've already embedded
    this.previousGroups = null;          // Previous cluster groups for merging
    this.knownTechArticleIds = new Set(); // IDs of tech articles already ranked

    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.newsDir)) {
      fs.mkdirSync(this.newsDir, { recursive: true });
    }
    if (!fs.existsSync(this.techNewsDir)) {
      fs.mkdirSync(this.techNewsDir, { recursive: true });
    }
  }

  /**
   * Determine next iteration number for a given date in the given directory,
   * then write a JSONL file (one JSON object per line).
   */
  saveIteration(dir, date, items) {
    try {
      const existing = fs.readdirSync(dir)
        .filter(f => f.startsWith(date + '-') && f.endsWith('.jsonl'));
      const iterations = existing.map(f => {
        const match = f.match(new RegExp(`^${date}-(\\d+)\\.jsonl$`));
        return match ? parseInt(match[1], 10) : 0;
      });
      const nextIter = iterations.length > 0 ? Math.max(...iterations) + 1 : 1;
      const filename = `${date}-${nextIter}.jsonl`;
      const filepath = path.join(dir, filename);

      // Strip embeddings before persisting (they're large and transient)
      const lines = items.map(item => {
        const { embedding, ...rest } = item;
        return JSON.stringify(rest);
      }).join('\n');

      fs.writeFileSync(filepath, lines + '\n');
      console.log(`Saved iteration: ${path.basename(dir)}/${filename} (${items.length} items)`);
      return filepath;
    } catch (error) {
      console.error(`Error saving iteration to ${dir}:`, error);
      return null;
    }
  }

  /**
   * Find the highest-iteration JSONL file for a given date in the given directory.
   */
  loadLatestIteration(dir, date) {
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(date + '-') && f.endsWith('.jsonl'));
      if (files.length === 0) return null;

      const iterations = files.map(f => {
        const match = f.match(new RegExp(`^${date}-(\\d+)\\.jsonl$`));
        return { file: f, iter: match ? parseInt(match[1], 10) : 0 };
      });
      iterations.sort((a, b) => b.iter - a.iter);
      const latest = iterations[0].file;

      const content = fs.readFileSync(path.join(dir, latest), 'utf-8');
      return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (error) {
      console.error(`Error loading latest iteration from ${dir} for ${date}:`, error);
      return null;
    }
  }

  // Scrape tldr.tech newsletters (AI and Tech)
  async scrapeTldrTech() {
    const articles = [];
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const sources = [
      { url: `https://tldr.tech/ai/${dateStr}`, source: 'TLDR AI' },
      { url: `https://tldr.tech/tech/${dateStr}`, source: 'TLDR Tech' }
    ];

    for (const { url, source } of sources) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Writer-App/1.0' }
        });
        if (!response.ok) continue;

        const html = await response.text();
        const $ = cheerio.load(html);

        // TLDR uses <article> tags for each news item
        $('article').each((i, el) => {
          const $article = $(el);
          const $link = $article.find('a').first();
          const title = $link.text().trim() || $article.find('h3, h4').first().text().trim();
          const articleUrl = $link.attr('href') || '';
          const summary = $article.find('p').first().text().trim();

          if (title && title.length > 10) {
            articles.push({
              id: this.generateArticleId({ link: articleUrl || `${source}-${i}-${dateStr}` }),
              title: title.substring(0, 200),
              url: articleUrl,
              source: source,
              category: 'tech',
              date: now.toISOString(),
              summary: summary.substring(0, 300)
            });
          }
        });

        console.log(`Scraped ${articles.filter(a => a.source === source).length} articles from ${source}`);
      } catch (error) {
        console.error(`Error scraping ${source}:`, error.message);
      }
    }

    return articles;
  }

  // Scrape Hacker News Daily (yesterday's top stories)
  async scrapeHnDaily() {
    const articles = [];
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      const url = `https://www.daemonology.net/hn-daily/${dateStr}.html`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Writer-App/1.0' }
      });
      if (!response.ok) {
        console.log(`HN Daily not available for ${dateStr}`);
        return articles;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // HN Daily uses span.storylink for story links
      $('span.storylink').each((i, el) => {
        const $link = $(el).find('a').first();
        const title = $link.text().trim();
        const articleUrl = $link.attr('href') || '';

        if (title) {
          articles.push({
            id: this.generateArticleId({ link: articleUrl || `hn-daily-${i}-${dateStr}` }),
            title: title,
            url: articleUrl,
            source: 'HN Daily',
            category: 'tech',
            date: yesterday.toISOString(),
            summary: ''
          });
        }
      });

      console.log(`Scraped ${articles.length} articles from HN Daily`);
    } catch (error) {
      console.error('Error scraping HN Daily:', error.message);
    }

    return articles;
  }

  // Rank tech articles specifically with tech-focused criteria
  async rankTechNews(articles, topK = 10) {
    if (!this.claude || !this.claude.isAvailable() || articles.length <= topK) {
      return articles.slice(0, topK);
    }

    // Format articles for ranking
    const articleDescriptions = articles.map((article, i) => {
      return `[${i}] ${article.source}: ${article.title}`;
    });

    const itemsStr = articleDescriptions.join('\n');

    const promptTemplate = `Rank these tech articles by importance and significance.
Focus on: AI/ML developments, hardware/chips, datacenter tech, software releases, tech industry impact.
Deprioritize: marketing fluff, minor product updates, clickbait, routine announcements.

{items}

Respond with ONLY a JSON array of the top {top_k} indices (e.g., [3, 7, 12, 1, 18]).
No explanation, just the JSON array.`;

    try {
      const selectedIndices = await this.claude.rankItems(itemsStr, promptTemplate, topK);
      return selectedIndices.map(i => articles[i]).filter(Boolean);
    } catch (error) {
      console.error('Error ranking tech news:', error);
      return articles.slice(0, topK);
    }
  }

  async fetchFeed(feed) {
    try {
      const result = await this.parser.parseURL(feed.url);
      return result.items.map(item => ({
        id: this.generateArticleId(item),
        title: item.title || 'Untitled',
        url: item.link || item.guid,
        source: feed.name,
        category: feed.category,
        date: item.pubDate || item.isoDate || new Date().toISOString(),
        summary: item.contentSnippet || item.content || '',
        author: item.creator || item.author || null
      }));
    } catch (error) {
      console.error(`Error fetching feed ${feed.name}:`, error.message);
      return [];
    }
  }

  generateArticleId(item) {
    const url = item.link || item.guid || '';
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `art-${Math.abs(hash).toString(36)}`;
  }

  async fetchAllFeeds() {
    const results = await Promise.allSettled(
      this.feeds.map(feed => this.fetchFeed(feed))
    );

    const articles = [];
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        articles.push(...result.value);
      }
    });

    // Filter to articles from last corpusDays (3 days)
    const cutoff = Date.now() - this.corpusDays * 24 * 60 * 60 * 1000;
    return articles.filter(article => {
      const articleDate = new Date(article.date).getTime();
      return articleDate > cutoff;
    });
  }

  parseArticleDate(dateStr) {
    try {
      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) {
        return dt;
      }
    } catch (e) {}
    return null;
  }

  async clusterArticles(articles) {
    if (!this.embeddings) {
      // No embeddings service - return each article as its own cluster
      return articles.map(article => ({
        articles: [article],
        embedding: null
      }));
    }

    try {
      // Delta: separate new articles from already-processed ones
      const newArticles = articles.filter(a => !this.knownArticleIds.has(a.id));
      const existingArticles = articles.filter(a => this.knownArticleIds.has(a.id));

      if (newArticles.length === 0 && this.previousGroups) {
        // No new articles - prune expired articles from existing groups
        console.log('No new articles, returning existing clusters');
        return this._pruneExpiredArticles(this.previousGroups, articles);
      }

      console.log(`Delta: ${newArticles.length} new articles, ${existingArticles.length} existing (${articles.length} total)`);

      // Only generate embeddings for NEW articles
      const texts = newArticles.map(a =>
        `News article from ${a.date}: ${a.title}\n\nURL: ${a.url}\n\nSummary: ${(a.summary || '').substring(0, 200)}`
      );
      const embeddings = await this.embeddings.getEmbeddings(texts);

      newArticles.forEach((article, i) => {
        article.embedding = embeddings[i];
      });

      console.log(`Generated embeddings for ${newArticles.length} new articles`);

      // Start with previous groups or empty list
      let groups;
      if (this.previousGroups) {
        // Prune groups to only contain articles still in the current feed window
        groups = this._pruneExpiredArticles(this.previousGroups, articles);
      } else {
        groups = [];
      }

      // Merge new articles into existing clusters
      for (const article of newArticles) {
        if (!article.embedding) continue;

        let bestGroup = null;
        let bestSimilarity = 0;

        for (const group of groups) {
          const similarities = group.articles
            .filter(a => a.embedding)
            .map(a => this.embeddings.cosineSimilarity(article.embedding, a.embedding));

          if (similarities.length === 0) continue;

          const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

          if (avgSimilarity >= this.similarityThreshold && avgSimilarity > bestSimilarity) {
            bestGroup = group;
            bestSimilarity = avgSimilarity;
          }
        }

        if (bestGroup) {
          bestGroup.articles.push(article);
        } else {
          groups.push({
            articles: [article],
            embedding: article.embedding
          });
        }

        // Track this article as processed
        this.knownArticleIds.add(article.id);
      }

      // Store groups for next delta cycle
      this.previousGroups = groups;

      console.log(`Clusters: ${groups.length} (merged ${newArticles.length} new articles)`);
      return groups;
    } catch (error) {
      console.error('Error clustering articles:', error);
      return articles.map(a => ({ articles: [a], embedding: null }));
    }
  }

  /**
   * Remove articles from groups that are no longer in the current feed window,
   * and drop any groups that become empty.
   */
  _pruneExpiredArticles(groups, currentArticles) {
    const currentIds = new Set(currentArticles.map(a => a.id));
    const pruned = [];

    for (const group of groups) {
      const remaining = group.articles.filter(a => currentIds.has(a.id));
      if (remaining.length > 0) {
        pruned.push({ ...group, articles: remaining });
      }
    }

    return pruned;
  }

  categorizeGroups(groups) {
    // Categorize groups by date (matching H3LPeR logic)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.showDays);

    const newStories = [];       // Only today's articles
    const continuingStories = []; // Mix of old and new
    const dormantStories = [];    // Had 2+ articles before but none today

    for (const group of groups) {
      const todayArticles = [];
      const olderArticles = [];

      for (const article of group.articles) {
        const articleDate = this.parseArticleDate(article.date);
        if (articleDate && articleDate >= cutoffDate) {
          todayArticles.push(article);
        } else if (articleDate) {
          olderArticles.push(article);
        } else {
          // If no date, assume today
          todayArticles.push(article);
        }
      }

      if (olderArticles.length === 0 && todayArticles.length > 0) {
        // NEW: only today's articles
        newStories.push({
          ...group,
          articles: todayArticles,
          totalCount: todayArticles.length,
          todayCount: todayArticles.length,
          status: 'new'
        });
      } else if (todayArticles.length > 0 && olderArticles.length > 0) {
        // CONTINUING: has history + today (only keep today's articles for display)
        continuingStories.push({
          ...group,
          articles: todayArticles,
          totalCount: todayArticles.length + olderArticles.length,
          todayCount: todayArticles.length,
          status: 'continuing'
        });
      } else if (todayArticles.length === 0 && olderArticles.length >= 2) {
        // DORMANT: was a story (2+ articles), now gone
        dormantStories.push({
          ...group,
          articles: [],
          representativeTitle: olderArticles[0]?.title || '',
          totalCount: olderArticles.length,
          todayCount: 0,
          status: 'dormant'
        });
      }
      // else: drop it (only 1 old article, not enough to be a story)
    }

    // Sort continuing stories by (totalCount × todayCount)
    continuingStories.sort((a, b) => (b.totalCount * b.todayCount) - (a.totalCount * a.todayCount));

    return { newStories, continuingStories, dormantStories };
  }

  async rankStories(stories, categoryName, topK = 5) {
    if (!this.claude || !this.claude.isAvailable() || stories.length <= topK) {
      return stories;
    }

    // Format clusters for ranking
    const clusterDescriptions = stories.map((group, i) => {
      const repTitle = group.articles[0]?.title || group.representativeTitle || 'No title';
      const articleCount = group.articles.length;
      const totalCount = group.totalCount || articleCount;

      if (categoryName === 'continuing') {
        return `[${i}] ${repTitle} (${articleCount} new articles today, ${totalCount} total)`;
      } else if (categoryName === 'dormant') {
        return `[${i}] ${repTitle} (${totalCount} articles from previous days, none today)`;
      } else {
        return `[${i}] ${repTitle} (${articleCount} articles)`;
      }
    });

    const itemsStr = clusterDescriptions.join('\n');

    let context;
    if (categoryName === 'continuing') {
      context = 'CONTINUING STORIES - ongoing coverage from previous days';
    } else if (categoryName === 'new') {
      context = 'NEW STORIES - appearing for the first time today';
    } else {
      context = 'DORMANT STORIES - had coverage before but none today';
    }

    const promptTemplate = `Rank these ${categoryName.toUpperCase()} news story clusters by importance and significance.
Focus on: major news impact, public interest, and relevance. Please suppress articles like "x killed by y in z" unless the number killed is over 1000, the location is colorado, or the people are famous.

${context}

{items}

Respond with ONLY a JSON array of the top {top_k} indices (e.g., [3, 7, 12, 1, 18]).
No explanation, just the JSON array.`;

    try {
      const selectedIndices = await this.claude.rankItems(itemsStr, promptTemplate, topK);
      return selectedIndices.map(i => stories[i]).filter(Boolean);
    } catch (error) {
      console.error('Error ranking stories:', error);
      return stories.slice(0, topK);
    }
  }

  // Delta processing: only embeds new articles and merges them into existing clusters
  async updateStories() {
    const cacheKey = 'news-update';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Fetch all feeds (3 days of articles)
    const articles = await this.fetchAllFeeds();
    console.log(`Fetched ${articles.length} articles from ${this.feeds.length} feeds`);

    // Cluster articles
    const groups = await this.clusterArticles(articles);

    // Categorize into new/continuing/dormant
    const { newStories, continuingStories, dormantStories } = this.categorizeGroups(groups);

    // Rank each category with Claude
    const [rankedContinuing, rankedNew, rankedDormant] = await Promise.all([
      this.rankStories(continuingStories, 'continuing', 5),
      this.rankStories(newStories, 'new', 5),
      this.rankStories(dormantStories, 'dormant', 5)
    ]);

    const result = {
      continuing: rankedContinuing,
      new: rankedNew,
      dormant: rankedDormant,
      lastUpdated: new Date().toISOString()
    };

    // Save news stories as a JSONL iteration
    const today = new Date().toISOString().split('T')[0];
    const newsItems = [
      ...rankedContinuing.map(s => ({ ...s, _storyType: 'continuing' })),
      ...rankedNew.map(s => ({ ...s, _storyType: 'new' })),
      ...rankedDormant.map(s => ({ ...s, _storyType: 'dormant' }))
    ];
    this.saveIteration(this.newsDir, today, newsItems);

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Reconstruct the news result shape from a flat JSONL array of story objects.
   */
  _reshapeNewsFromItems(items) {
    const continuing = [];
    const newStories = [];
    const dormant = [];

    for (const item of items) {
      const { _storyType, ...story } = item;
      if (_storyType === 'continuing') continuing.push(story);
      else if (_storyType === 'new') newStories.push(story);
      else if (_storyType === 'dormant') dormant.push(story);
    }

    return {
      continuing,
      new: newStories,
      dormant,
      lastUpdated: null
    };
  }

  async getNews(forceRefresh = false) {
    if (forceRefresh) {
      this.cache.delete('news-update');
      this.cache.delete('tech-news');
    }

    let data;

    // Try in-memory cache / live fetch first
    if (!forceRefresh) {
      const cached = this.cache.get('news-update');
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        data = cached.data;
      }
    }

    if (!data && !forceRefresh) {
      // Try loading from disk (e.g. after server restart)
      const today = new Date().toISOString().split('T')[0];
      const stored = this.loadLatestIteration(this.newsDir, today);
      if (stored && stored.length > 0) {
        data = this._reshapeNewsFromItems(stored);
        data.lastUpdated = new Date().toISOString();
        this.cache.set('news-update', { data, timestamp: Date.now() });
      }
    }

    if (!data) {
      data = await this.updateStories();
    }

    // Get today's new articles across all stories
    const today = new Date().toISOString().split('T')[0];
    const newToday = [];

    for (const story of [...(data.continuing || []), ...(data.new || [])]) {
      const todayArticles = (story.articles || []).filter(a =>
        a.date && a.date.startsWith(today)
      );
      newToday.push(...todayArticles);
    }

    // Delta tech news: only re-rank when new articles are found
    let techNews = [];
    const techCached = this.cache.get('tech-news');
    if (techCached && Date.now() - techCached.timestamp < this.cacheTTL) {
      techNews = techCached.data;
    } else {
      // Try loading from disk first
      const storedTech = this.loadLatestIteration(this.techNewsDir, today);
      if (!forceRefresh && storedTech && storedTech.length > 0) {
        techNews = storedTech;
        // Rebuild known IDs from stored data
        storedTech.forEach(a => this.knownTechArticleIds.add(a.id));
        this.cache.set('tech-news', { data: techNews, timestamp: Date.now() });
      } else {
        // Gather tech articles from RSS feeds directly (last 24 hours)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const allArticles = await this.fetchAllFeeds();
        const rssTechArticles = allArticles.filter(a =>
          a.category === 'tech' && a.date && new Date(a.date) >= yesterday
        );

        // Scrape additional sources (TLDR and HN Daily)
        const [tldrArticles, hnDailyArticles] = await Promise.all([
          this.scrapeTldrTech().catch(e => { console.error('TLDR scrape error:', e); return []; }),
          this.scrapeHnDaily().catch(e => { console.error('HN Daily scrape error:', e); return []; })
        ]);

        // Combine all tech articles
        const allTechArticles = [...rssTechArticles, ...tldrArticles, ...hnDailyArticles];

        // Deduplicate by title similarity (basic)
        const seenTitles = new Set();
        const uniqueTechArticles = allTechArticles.filter(article => {
          const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
          if (seenTitles.has(normalizedTitle)) return false;
          seenTitles.add(normalizedTitle);
          return true;
        });

        // Delta: check how many articles are genuinely new
        const newTechArticles = uniqueTechArticles.filter(a => !this.knownTechArticleIds.has(a.id));
        console.log(`Tech articles: ${uniqueTechArticles.length} total, ${newTechArticles.length} new (RSS: ${rssTechArticles.length}, TLDR: ${tldrArticles.length}, HN Daily: ${hnDailyArticles.length})`);

        // Only re-rank if we have new articles (or no previous results)
        if (newTechArticles.length > 0 || techCached === undefined) {
          techNews = await this.rankTechNews(uniqueTechArticles, 10);
        } else {
          // No new articles - reuse previous ranking
          techNews = (techCached?.data) || await this.rankTechNews(uniqueTechArticles, 10);
        }

        // Track all current tech article IDs
        uniqueTechArticles.forEach(a => this.knownTechArticleIds.add(a.id));

        // Save tech news iteration
        this.saveIteration(this.techNewsDir, today, techNews);

        // Cache the result
        this.cache.set('tech-news', { data: techNews, timestamp: Date.now() });
      }
    }

    return {
      continuingStories: data.continuing || [],
      newStories: data.new || [],
      dormantStories: data.dormant || [],
      newToday: newToday.sort((a, b) => new Date(b.date) - new Date(a.date)),
      techNews: techNews,
      lastUpdated: data.lastUpdated
    };
  }
}

module.exports = NewsService;
