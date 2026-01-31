const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');

class EmbeddingsService {
  constructor(config) {
    this.config = config;
    this.client = null;
    // Read from environment variables first, then fall back to config
    this.deploymentName = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
      || config?.azureOpenAI?.embeddingDeployment
      || 'text-embedding-ada-002';
  }

  getClient() {
    if (!this.client) {
      // Read from environment variables first, then fall back to config
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT || this.config?.azureOpenAI?.endpoint;
      const apiKey = process.env.AZURE_OPENAI_API_KEY || this.config?.azureOpenAI?.apiKey;

      if (!endpoint || !apiKey) {
        throw new Error('Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables');
      }

      this.client = new OpenAIClient(
        endpoint,
        new AzureKeyCredential(apiKey)
      );
    }
    return this.client;
  }

  async getEmbedding(text) {
    try {
      const client = this.getClient();
      const response = await client.getEmbeddings(this.deploymentName, [text]);
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error getting embedding:', error);
      throw error;
    }
  }

  async getEmbeddings(texts) {
    try {
      const client = this.getClient();
      // Azure OpenAI has a limit on batch size, process in chunks
      const batchSize = 16;
      const results = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const response = await client.getEmbeddings(this.deploymentName, batch);
        results.push(...response.data.map(d => d.embedding));
      }

      return results;
    } catch (error) {
      console.error('Error getting embeddings:', error);
      throw error;
    }
  }

  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

module.exports = EmbeddingsService;
