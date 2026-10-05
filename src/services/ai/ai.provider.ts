import Groq from 'groq-sdk';
import { ChatMessage, AIResponse } from '@/src/types';

export interface IAIProvider {
  generateSQL(messages: ChatMessage[], schemaDDL: string): Promise<AIResponse>;
}

export class GroqProvider implements IAIProvider {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model: string = 'llama3-70b-8192') {
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
      max_tokens: 1024,
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
}
