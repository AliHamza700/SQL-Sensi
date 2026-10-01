/**
 * AIProvider Interface — SQL Sensi
 *
 * Architecture rule: Business logic depends on this interface,
 * NOT on any specific provider (Gemini, OpenAI, etc.)
 *
 * To add a new provider: implement this interface.
 * To swap providers: change config — no business logic changes needed.
 */

import type {
  SQLGenerationInput,
  SQLGenerationResult,
  ClarificationInput,
  ClarificationResult,
  SQLExplanationInput,
  SQLExplanationResult,
  OptimizationInput,
  OptimizationResult,
  QueryPlanInput,
  QueryPlanExplanation,
} from '@/src/types';

export interface AIProvider {
  /** Convert a natural language question into SQL */
  generateSQL(input: SQLGenerationInput): Promise<SQLGenerationResult>;

  /** Detect ambiguity and ask for clarification before generating SQL */
  clarifyQuestion(input: ClarificationInput): Promise<ClarificationResult>;

  /** Produce a natural language explanation of a SQL query and its results */
  explainSQL(input: SQLExplanationInput): Promise<SQLExplanationResult>;

  /** Detect inefficiencies in SQL and suggest optimized rewrites */
  optimizeSQL(input: OptimizationInput): Promise<OptimizationResult>;

  /** Translate SQLite EXPLAIN QUERY PLAN output into plain English */
  explainQueryPlan(input: QueryPlanInput): Promise<QueryPlanExplanation>;
}

/** The name identifier of an AI provider */
export type AIProviderName = 'gemini' | 'openai' | 'local';
