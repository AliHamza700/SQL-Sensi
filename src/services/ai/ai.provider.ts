import Groq from 'groq-sdk';
import type { AIProvider, AiCompletion, AiCompletionRequest } from './ai-provider.interface';

/** Default Groq model; override with GROQ_MODEL */
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';

/**
 * Groq implementation of the provider contract.
 * Contains no prompts: it only sends messages and returns text.
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_GROQ_MODEL) {
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  public async complete(request: AiCompletionRequest): Promise<AiCompletion> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(request.json ? { response_format: { type: 'json_object' as const } } : {}),
    });
    return { text: completion.choices[0]?.message?.content?.trim() ?? '' };
  }
}
