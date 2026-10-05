import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { GroqProvider } from '../../src/services/ai/ai.provider';
import { DatabaseService } from '../../src/services/database/database.service';
import { SchemaService } from '../../src/services/schema/schema.service';
import { formatSchemaToDDL } from '../../src/services/ai/schema.formatter';

dotenv.config();

const DB_PATH = path.join(process.cwd(), 'chinook.db');
const TEST_FILE = path.join(process.cwd(), 'tests', 'ai', 'test-questions.json');
const RESULTS_FILE = path.join(process.cwd(), 'tests', 'ai', 'evaluation-results.md');

interface TestQuestion {
  id: number;
  category: string;
  question: string;
  expectedType: 'query' | 'ambiguous';
}

async function runEvaluation() {
  console.log('=== AI Natural Language to SQL Evaluator ===\n');

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GROQ_API_KEY environment variable is not set.');
    console.error('Please set it in your .env file or export it before running this script.');
    process.exit(1);
  }

  // 1. Setup Services & Load Schema
  console.log('Loading chinook.db schema...');
  const dbService = DatabaseService.getInstance();
  const connectRes = await dbService.connect(DB_PATH);
  
  if (!connectRes.success) {
    console.error('Failed to connect to seed database:', connectRes.error?.message);
    process.exit(1);
  }

  const schemaService = SchemaService.getInstance();
  const schemaRes = await schemaService.extractSchema();
  
  if (!schemaRes.success) {
    console.error('Failed to extract schema:', schemaRes.error);
    process.exit(1);
  }

  const ddl = formatSchemaToDDL(schemaRes.data);
  const aiProvider = new GroqProvider(apiKey);
  
  // 2. Load Questions
  const questions: TestQuestion[] = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
  console.log(`Loaded ${questions.length} questions for evaluation.\n`);

  const results: string[] = [];
  results.push('# AI Evaluation Results\n');
  results.push(`**Date**: ${new Date().toISOString()}\n`);
  results.push(`**Model**: llama-3.1-8b-instant (Groq)\n\n`);
  
  let passed = 0;

  // 3. Evaluate each question
  for (const q of questions) {
    console.log(`Evaluating [${q.id}/${questions.length}] ${q.category}: "${q.question}"`);
    
    try {
      const response = await aiProvider.generateSQL([{ role: 'user', content: q.question }], ddl);
      
      const actualType = response.isAmbiguous ? 'ambiguous' : 'query';
      const isPass = actualType === q.expectedType;
      
      if (isPass) passed++;

      results.push(`### Q${q.id}: ${q.question}`);
      results.push(`- **Category**: ${q.category}`);
      results.push(`- **Expected**: ${q.expectedType}`);
      results.push(`- **Actual**: ${actualType}`);
      results.push(`- **Result**: ${isPass ? '✅ PASS' : '❌ FAIL'}`);
      
      if (actualType === 'ambiguous') {
        results.push(`- **Message**: ${response.message}\n`);
      } else {
        results.push(`- **Generated SQL**:\n\`\`\`sql\n${response.sql}\n\`\`\`\n`);
      }
      
      // Sleep slightly to avoid hitting strict rate limits on free tiers
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: any) {
      console.error(`Error on Q${q.id}:`, err.message);
      results.push(`### Q${q.id}: ${q.question}`);
      results.push(`- **Result**: ❌ ERROR (${err.message})\n`);
    }
  }

  // 4. Summarize
  const summary = `\n## Summary\n- Total Questions: ${questions.length}\n- Passed: ${passed}\n- Failed: ${questions.length - passed}\n- Accuracy: ${((passed / questions.length) * 100).toFixed(2)}%\n`;
  results.push(summary);
  console.log(summary);

  fs.writeFileSync(RESULTS_FILE, results.join('\n'));
  console.log(`Detailed results written to ${RESULTS_FILE}`);
  
  dbService.disconnect();
}

runEvaluation().catch(console.error);
