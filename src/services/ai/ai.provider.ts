import Groq from 'groq-sdk';
import { ChatMessage, AIResponse } from '@/src/types';

export interface IAIProvider {
  generateSQL(messages: ChatMessage[], schemaDDL: string): Promise<AIResponse>;
  optimizeSQL(sql: string, schemaDDL: string): Promise<import('@/src/types').SQLOptimizationResult>;
}

export class GroqProvider implements IAIProvider {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model: string = 'qwen/qwen3.8-27b') {
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  public async generateSQL(messages: ChatMessage[], schemaDDL: string): Promise<AIResponse> {
    const systemPrompt = `
You are "SQL Sensi", an expert Database Analyst and SQLite developer.
Your goal is to translate the user's natural language question into a valid, read-only SQLite query based ONLY on the provided schema.

DATABASE SCHEMA:
\`\`\`sql
${schemaDDL}
\`\`\`

RULES:
1. ONLY return a raw SQL query. Do not wrap it in markdown code blocks (\`\`\`sql ... \`\`\`).
2. Do NOT provide explanations before or after the SQL.
3. The SQL must be strictly read-only (SELECT only).
4. If the user's question is ambiguous, unrelated to the schema, or cannot be answered, you MUST return EXACTLY the word "AMBIGUOUS:" followed by a clarifying question.
   Example: "AMBIGUOUS: Are you referring to the users table or the employees table?"
`;

    // Prepend system prompt
    const apiMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt.trim() },
      ...messages.map(m => ({ role: m.role, content: m.content }) as Groq.Chat.Completions.ChatCompletionMessageParam)
    ];

    const completion = await this.client.chat.completions.create({
      messages: apiMessages,
      model: this.model,
      temperature: 0,
      max_tokens: 500,
    });

    const responseContent = completion.choices[0]?.message?.content?.trim() || '';

    if (responseContent.startsWith('AMBIGUOUS:')) {
      return {
        isAmbiguous: true,
        message: responseContent.replace('AMBIGUOUS:', '').trim(),
      };
    }

    // Clean up markdown just in case the LLM ignores rule 1
    let sql = responseContent;
    if (sql.startsWith('\`\`\`sql')) {
      sql = sql.replace(/^\`\`\`sql/, '').replace(/\`\`\`$/, '').trim();
    } else if (sql.startsWith('\`\`\`')) {
      sql = sql.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
    }

    return {
      isAmbiguous: false,
      message: 'Generated SQL',
      sql,
    };
  }

  public async optimizeSQL(sql: string, schemaDDL: string): Promise<import('@/src/types').SQLOptimizationResult> {
    const systemPrompt = `
You are "SQL Sensi", an expert Database Administrator.
Your task is to analyze the provided SQL query and optimize it based on the schema.
Detect inefficiencies such as "SELECT *", missing indexes, or unnecessary joins.
You MUST reply with a STRICT JSON object in this exact format, with no markdown formatting around it (do not use \`\`\`json):
{
  "issues": ["list of detected issues"],
  "suggestions": ["list of suggestions"],
  "optimizedSql": "the optimized SQL string"
}

DATABASE SCHEMA:
${schemaDDL}
`;

    const apiMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt.trim() },
      { role: 'user', content: `Optimize this query: \n\n${sql}` }
    ];

    const completion = await this.client.chat.completions.create({
      messages: apiMessages,
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const responseContent = completion.choices[0]?.message?.content?.trim() || '{}';
    return JSON.parse(responseContent);
  }
}
