const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
  constructor() {
    this.endpoint = process.env.AZURE_AI_ENDPOINT;
    this.apiKey = process.env.AZURE_AI_API_KEY;
    this.model = process.env.AZURE_AI_DEPLOYMENT_NAME || 'claude-sonnet-4-5';

    if (!this.apiKey || !this.endpoint) {
      console.warn('Azure AI credentials not configured - Claude ranking disabled');
      this.client = null;
    } else {
      this.client = new Anthropic({
        apiKey: this.apiKey,
        baseURL: this.endpoint
      });
    }
  }

  isAvailable() {
    return this.client !== null;
  }

  async generate(prompt, maxRetries = 3, baseDelay = 1000) {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      return message.content.map(c => c.text).join('\n\n');
    } catch (error) {
      if (maxRetries <= 0) throw error;

      const delay = baseDelay * 2 + Math.random() * 200;
      console.log(`Claude error: ${error.message}, retrying in ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
      return this.generate(prompt, maxRetries - 1, delay);
    }
  }

  async rankItems(items, promptTemplate, topK = 5, batchSize = 10) {
    if (!this.client) {
      // Fallback: return first topK indices
      return Array.from({ length: Math.min(topK, items.length) }, (_, i) => i);
    }

    // Parse items to get count
    const itemLines = items.split('\n').filter(line => line.trim().startsWith('['));
    const numItems = itemLines.length;

    if (numItems <= topK) {
      return Array.from({ length: numItems }, (_, i) => i);
    }

    // If items fit in one batch, rank directly
    if (numItems <= batchSize) {
      return this._rankSingleBatch(items, promptTemplate, topK, numItems);
    }

    // Otherwise, use recursive batching
    return this._rankBatched(items, itemLines, promptTemplate, topK, batchSize, numItems);
  }

  async _rankSingleBatch(items, promptTemplate, topK, numItems) {
    const prompt = promptTemplate
      .replace('{count}', numItems)
      .replace('{top_k}', topK)
      .replace('{items}', items);

    try {
      const response = await this.generate(prompt);

      // Extract JSON array from response
      const match = response.match(/\[[\d,\s]+\]/);
      if (match) {
        const indices = JSON.parse(match[0]);
        return indices.filter(i => i < numItems).slice(0, topK);
      }
    } catch (error) {
      console.error('Error in Claude ranking:', error.message);
    }

    // Fallback to first topK
    return Array.from({ length: Math.min(topK, numItems) }, (_, i) => i);
  }

  async _rankBatched(items, itemLines, promptTemplate, topK, batchSize, numItems) {
    let currentIndices = Array.from({ length: numItems }, (_, i) => i);

    while (currentIndices.length > topK) {
      const newIndices = [];

      // Process in batches
      for (let i = 0; i < currentIndices.length; i += batchSize) {
        const batchIndices = currentIndices.slice(i, i + batchSize);

        // Reformat items for this batch with renumbered indices
        const batchLines = batchIndices.map((oldIdx, newIdx) => {
          const oldLine = itemLines[oldIdx];
          return oldLine.replace(/^\[\d+\]/, `[${newIdx}]`);
        });

        const batchItems = batchLines.join('\n');
        const batchTopK = Math.min(topK, batchIndices.length);

        // Rank this batch
        const selected = await this._rankSingleBatch(
          batchItems,
          promptTemplate,
          batchTopK,
          batchIndices.length
        );

        // Map back to original indices
        for (const idx of selected) {
          if (idx < batchIndices.length) {
            newIndices.push(batchIndices[idx]);
          }
        }
      }

      // If we didn't reduce, break to avoid infinite loop
      if (newIndices.length >= currentIndices.length) {
        break;
      }

      currentIndices = newIndices;
    }

    return currentIndices.slice(0, topK);
  }
}

module.exports = ClaudeService;
