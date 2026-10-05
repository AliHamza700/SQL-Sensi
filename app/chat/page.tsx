'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { ChatMessage, SQLOptimizationResult } from '@/src/types';
import { Send, Bot, User, Database, Settings, Zap } from 'lucide-react';
import { useDatabaseContext } from '@/src/contexts/DatabaseContext';

export default function ChatPage() {
  const { activeDatabasePath, isLoading: isDbLoading } = useDatabaseContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSaveApiKey = async () => {
    if (apiKey) {
      await window.electronAPI!.ai.setApiKey(apiKey);
      setShowSettings(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activeDatabasePath) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const res = await window.electronAPI!.ai.generateSQL(newMessages);
      if (res.success) {
        const aiMsg = res.data;
        if (aiMsg.isAmbiguous) {
          setMessages([...newMessages, { role: 'assistant', content: aiMsg.message }]);
        } else {
          let queryData;
          if (aiMsg.sql) {
            try {
              const execRes = await window.electronAPI!.database.executeQuery(aiMsg.sql);
              if (execRes.success) {
                queryData = execRes.data;
              } else {
                queryData = { columns: ['Error'], rows: [{ Error: execRes.error?.message || 'Query failed' }], rowCount: 1, executionTimeMs: 0 };
              }
            } catch (err: any) {
              queryData = { columns: ['Error'], rows: [{ Error: err.message }], rowCount: 1, executionTimeMs: 0 };
            }
          }

          setMessages([...newMessages, { 
            role: 'assistant', 
            content: `Here is the query I generated:\n\n\`\`\`sql\n${aiMsg.sql}\n\`\`\``,
            queryResult: queryData
          }]);
        }
      } else {
        setMessages([...newMessages, { role: 'assistant', content: `**Error:** ${res.error.message}` }]);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `**Error:** Failed to connect to AI provider.` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleOptimize = async (index: number, sql: string) => {
    // Set isOptimizing to true for this message
    const newMessages = [...messages];
    newMessages[index].isOptimizing = true;
    setMessages(newMessages);

    try {
      const res = await window.electronAPI!.ai.optimizeSQL(sql);
      const msgs = [...messages];
      msgs[index].isOptimizing = false;
      
      if (res.success) {
        msgs[index].optimizationResult = res.data;
      }
      setMessages(msgs);
    } catch (e) {
      const msgs = [...messages];
      msgs[index].isOptimizing = false;
      setMessages(msgs);
    }
  };

  if (!activeDatabasePath && !isDbLoading) {
    return (
      <AppLayout title="SQL Sensi Chat">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--color-text-secondary)' }}>
          <Database size={48} opacity={0.5} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>No Database Connected</h2>
          <p>Please connect a database first to start chatting with SQL Sensi.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Chat">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>SQL Sensi</h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Ask natural language questions to generate SQLite queries based on your active schema.
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
          >
            <Settings size={16} /> API Key
          </button>
        </div>

        {/* API Key Modal/Inline */}
        {showSettings && (
          <Card title="Groq API Key Configuration">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="password" 
                placeholder="gsk_..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
              />
              <button 
                onClick={handleSaveApiKey}
                style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>Stored temporarily in memory for this session.</p>
          </Card>
        )}

        {/* Chat Area */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {messages.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <Bot size={48} opacity={0.3} style={{ margin: '0 auto 1rem auto' }} />
                <h3>SQL Sensi is ready.</h3>
                <p style={{ fontSize: '0.85rem' }}>Try asking: &quot;Show me the top 10 customers by invoice total&quot;</p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ 
                  width: 32, height: 32, borderRadius: '50%', background: m.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-elevated)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none'
                }}>
                  {m.role === 'user' ? <User size={16} color="#fff" /> : <Bot size={16} color="var(--color-accent)" />}
                </div>
                <div style={{ 
                  background: m.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                  color: m.role === 'user' ? '#fff' : 'var(--color-text-primary)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  maxWidth: '75%',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none'
                }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  
                  {m.queryResult && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                      <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Query Results ({m.queryResult.rowCount} rows)</span>
                        <span>{m.queryResult.executionTimeMs}ms</span>
                      </div>
                      <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-elevated)' }}>
                            <tr>
                              {m.queryResult.columns.map((col, idx) => (
                                <th key={idx} style={{ padding: '0.5rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {m.queryResult.rows.map((row, rIdx) => (
                              <tr key={rIdx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                {m.queryResult!.columns.map((col, cIdx) => (
                                  <td key={cIdx} style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}>
                                    {String(row[col] ?? 'NULL')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Optimize Button for Assistant messages containing SQL */}
                  {m.role === 'assistant' && m.content.includes('\`\`\`sql') && !m.optimizationResult && (
                    <button 
                      onClick={() => {
                        const sqlMatch = m.content.match(/\`\`\`sql\n([\s\S]*?)\n\`\`\`/);
                        if (sqlMatch && sqlMatch[1]) {
                          handleOptimize(i, sqlMatch[1]);
                        }
                      }}
                      disabled={m.isOptimizing}
                      style={{ 
                        marginTop: '0.75rem', 
                        display: 'flex', gap: '0.5rem', alignItems: 'center', 
                        background: 'transparent', border: '1px solid var(--color-border)', 
                        color: 'var(--color-text-secondary)', padding: '0.4rem 0.8rem', 
                        borderRadius: 'var(--radius-sm)', cursor: m.isOptimizing ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      <Zap size={14} color="var(--color-accent)" /> 
                      {m.isOptimizing ? 'Optimizing...' : 'Optimize Query'}
                    </button>
                  )}

                  {/* Optimization Results */}
                  {m.optimizationResult && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', overflow: 'hidden' }}>
                      <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-accent)', fontSize: '0.8rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <Zap size={14} color="var(--color-accent)" /> SQL Optimizer Suggestions
                      </div>
                      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                        {m.optimizationResult.issues.length > 0 && (
                          <div>
                            <strong style={{ color: '#ef4444' }}>Issues Detected:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.optimizationResult.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                            </ul>
                          </div>
                        )}
                        {m.optimizationResult.suggestions.length > 0 && (
                          <div>
                            <strong style={{ color: '#10b981' }}>Suggestions:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.optimizationResult.suggestions.map((sug, idx) => <li key={idx}>{sug}</li>)}
                            </ul>
                          </div>
                        )}
                        <div>
                          <strong>Optimized SQL:</strong>
                          <pre style={{ background: 'var(--color-bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginTop: '0.25rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                            <code style={{ color: 'var(--color-accent)' }}>{m.optimizationResult.optimizedSql}</code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: 'flex', gap: '1rem', flexDirection: 'row' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)' }}>
                  <Bot size={16} color="var(--color-accent)" />
                </div>
                <div style={{ background: 'var(--color-bg-elevated)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <div className="typing-dot">.</div>
                  <div className="typing-dot" style={{ animationDelay: '0.2s' }}>.</div>
                  <div className="typing-dot" style={{ animationDelay: '0.4s' }}>.</div>
                </div>
              </div>
            )}
            
            <div ref={endOfMessagesRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-base)' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text"
                placeholder="Ask SQL Sensi to write a query..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                style={{
                  flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', 
                  border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)',
                  color: 'var(--color-text-primary)', fontSize: '0.95rem'
                }}
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                style={{
                  background: 'var(--color-accent)', color: '#fff', border: 'none', 
                  padding: '0 1.25rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: !input.trim() || isTyping ? 0.5 : 1
                }}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
          
        </Card>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes typing {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .typing-dot {
          animation: typing 1.4s infinite ease-in-out;
          font-weight: bold;
          color: var(--color-text-secondary);
        }
      `}} />
    </AppLayout>
  );
}
