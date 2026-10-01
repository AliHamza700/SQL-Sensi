'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import {
  Send,
  Play,
  Code2,
  Bot,
  User,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  clarificationNeeded?: boolean;
  clarificationOptions?: string[];
}

const mockMessages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'Which top 5 customers spent the most money?',
  },
  {
    id: '2',
    role: 'assistant',
    content: 'I analyzed the schema and identified a relationship between `customers` and `invoices`. Here is the generated read-only SQL query:',
    sql: `SELECT 
  c.CustomerId,
  c.FirstName || ' ' || c.LastName AS CustomerName,
  ROUND(SUM(i.BillingTotal), 2) AS TotalSpent
FROM customers c
JOIN invoices i ON c.CustomerId = i.CustomerId
GROUP BY c.CustomerId
ORDER BY TotalSpent DESC
LIMIT 5;`,
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [input, setInput] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
  };

  return (
    <AppLayout title="AI Query Assistant" databaseName="chinook.db">
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height) - 3rem)', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        {/* Messages Stream */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingRight: '0.5rem' }}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: msg.role === 'assistant' ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {msg.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}
              </div>

              {/* Message Body */}
              <div
                style={{
                  flex: 1,
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {msg.role === 'assistant' ? 'SQL Sensi Assistant' : 'You'}
                  </span>
                  {msg.sql && <Badge variant="success" size="sm">Validated SELECT</Badge>}
                </div>

                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                  {msg.content}
                </p>

                {/* Generated SQL Block */}
                {msg.sql && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div
                      style={{
                        backgroundColor: 'var(--color-bg-base)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.75rem 1rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        color: 'var(--color-sql-keyword)',
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                      }}
                    >
                      {msg.sql}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <Link href="/sql-editor">
                        <Button variant="secondary" size="sm" icon={<Code2 size={14} />}>
                          Edit & Explain in SQL Editor
                        </Button>
                      </Link>
                      <Link href="/results">
                        <Button variant="primary" size="sm" icon={<Play size={14} />}>
                          Execute Query
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          style={{
            marginTop: '1rem',
            display: 'flex',
            gap: '0.5rem',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.5rem',
          }}
        >
          <input
            type="text"
            placeholder="Ask a question about your database (e.g. 'Show total sales by country in 2024')…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '0.5rem 0.75rem',
              color: 'var(--color-text-primary)',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <Button type="submit" variant="primary" icon={<Send size={16} />}>
            Ask
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
