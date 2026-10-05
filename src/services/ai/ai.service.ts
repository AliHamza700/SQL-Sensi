import { IAIProvider, GroqProvider } from './ai.provider';
import { formatSchemaToDDL } from './schema.formatter';
import { schemaService } from '../schema/schema.service';
import { ChatMessage, AIResponse, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';

export class AIService {
  private static instance: AIService;
  private provider: IAIProvider | null = null;

  private constructor() {
    this.initializeProvider();
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private initializeProvider() {
    // Attempt to load from env
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      this.provider = new GroqProvider(groqKey);
    }
  }

  /**
   * Allows dynamically setting the API key at runtime (e.g., from a settings UI)
   */
  public setGroqApiKey(apiKey: string) {
    this.provider = new GroqProvider(apiKey);
  }

  public async generateSQL(messages: ChatMessage[]): Promise<ServiceResult<AIResponse>> {
    try {
      if (!this.provider) {
        return {
          success: false,
          error: createError('AI_ERROR', 'AI Provider is not configured. Please set GROQ_API_KEY.'),
        };
      }

      // Extract current schema
      const schemaRes = await schemaService.extractSchema();
      if (!schemaRes.success) {
        return {
          success: false,
          error: schemaRes.error, // Could be DATABASE_ERROR if none connected
        };
      }

      // Compress to DDL
      const ddl = formatSchemaToDDL(schemaRes.data);

      // Call LLM
      const response = await this.provider.generateSQL(messages, ddl);

      return {
        success: true,
        data: response,
      };

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown AI generation error';
      return {
        success: false,
        error: createError('AI_ERROR', `Failed to generate response: ${msg}`),
      };
    }
  }
}

export const aiService = AIService.getInstance();
