/**
 * AIProvider Interface — SQL Sensi
 *
 * The ONLY contract between SQL Sensi and an LLM vendor (FR-14).
 * It is deliberately low level: prompts, context building and answer
 * validation live in ai.service.ts / context-builder.ts / response-parser.ts,
 * so adding a provider means implementing `complete()` and nothing else.
 *
 * Groq is the default and currently only implementation (ai.provider.ts).
 */

export interface AiChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiChatTurn[];
  /** Ask the provider for a single JSON object */
  json: boolean;
  maxTokens: number;
  /** 0 for deterministic SQL work */
  temperature: number;
}

export interface AiCompletion {
  text: string;
}

export interface AIProvider {
  /** Short provider id for logs and UI, e.g. "groq" */
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
}

/** Provider ids SQL Sensi knows about */
export type AIProviderName = 'groq';
