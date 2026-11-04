/**
 * Groq Provider Tests — SQL Sensi V2 Phase 5
 * The SDK is mocked: checks the request shape sent to Groq.
 */

const mockCreate = jest.fn();

jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

import { GroqProvider, DEFAULT_GROQ_MODEL } from '../../src/services/ai/ai.provider';

describe('GroqProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '  {"ok":true}  ' } }] });
  });

  it('sends messages with the model, temperature and token limit, and asks for JSON when requested', async () => {
    const provider = new GroqProvider('test-key');
    const res = await provider.complete({ messages: [{ role: 'user', content: 'hi' }], json: true, maxTokens: 100, temperature: 0 });

    expect(res.text).toBe('{"ok":true}');
    expect(mockCreate).toHaveBeenCalledWith({
      model: DEFAULT_GROQ_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });
  });

  it('omits the JSON format for plain-text requests and honours a model override', async () => {
    await new GroqProvider('k', 'custom-model').complete({ messages: [], json: false, maxTokens: 10, temperature: 0.2 });
    const sent = mockCreate.mock.calls[0][0];
    expect(sent.model).toBe('custom-model');
    expect(sent).not.toHaveProperty('response_format');
  });

  it('returns empty text when the provider returns no choices', async () => {
    mockCreate.mockResolvedValue({ choices: [] });
    const res = await new GroqProvider('k').complete({ messages: [], json: true, maxTokens: 10, temperature: 0 });
    expect(res.text).toBe('');
  });
});
