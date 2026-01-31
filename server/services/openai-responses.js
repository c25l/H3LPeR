class OpenAIResponsesService {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.AZURE_AI_ENDPOINT_2;
    this.apiKey = options.apiKey || process.env.AZURE_AI_API_KEY_2 || process.env.AZURE_AI_API_KEY;
    this.model = options.model || process.env.AZURE_AI_DEPLOYMENT_NAME_2;

    if (!this.endpoint || !this.apiKey || !this.model) {
      console.warn('Secondary AI credentials not configured - secondary ranking disabled');
      this.enabled = false;
    } else {
      this.enabled = true;
    }
  }

  isAvailable() {
    return this.enabled === true;
  }

  async generate(prompt, maxRetries = 3, baseDelay = 1000) {
    if (!this.isAvailable()) {
      throw new Error('Secondary AI client not initialized');
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          model: this.model,
          input: prompt,
          max_output_tokens: 4096
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Secondary AI error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return this.extractText(data);
    } catch (error) {
      if (maxRetries <= 0) throw error;

      const delay = baseDelay * 2 + Math.random() * 200;
      console.log(`Secondary AI error: ${error.message}, retrying in ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
      return this.generate(prompt, maxRetries - 1, delay);
    }
  }

  extractText(data) {
    if (!data) return '';

    if (typeof data.output_text === 'string') {
      return data.output_text;
    }

    if (Array.isArray(data.output)) {
      const textChunks = [];
      for (const item of data.output) {
        if (item?.type === 'message' && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content?.type === 'output_text' && typeof content.text === 'string') {
              textChunks.push(content.text);
            }
          }
        }
      }
      if (textChunks.length > 0) {
        return textChunks.join('\n\n');
      }
    }

    if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    return JSON.stringify(data);
  }
}

module.exports = OpenAIResponsesService;
