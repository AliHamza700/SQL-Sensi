'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { ChatMessage, Conversation, ConversationMessage } from '@/src/types';
import { Send, Bot, User, Database, Zap, Search, MessageSquare, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { useDatabaseContext } from '@/src/contexts/DatabaseContext';

export default function ChatPage() {
  const { activeDatabasePath, isLoading: isDbLoading } = useDatabaseContext();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // History state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    const electron = window.electronAPI;
    if (!electron) return;
    const res = await electron.history.list();
    if (res.success) {
      setConversations(res.data);
    }
  };

  const loadConversation = async (id: string) => {
    const electron = window.electronAPI;
    if (!electron) return;
    const res = await electron.history.get(id);
    if (res.success) {
      setActiveConversationId(id);
      setMessages(res.data.messages);
    }
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const electron = window.electronAPI;
    if (!electron) return;
    await electron.history.delete(id);
    if (activeConversationId === id) {
      startNewConversation();
    }
    await loadConversations();
  };

  const startEditingTitle = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingTitleId(conv.id);
    setEditTitleText(conv.title);
  };

  const saveEditedTitle = async (e: React.SyntheticEvent, id: string) => {
    e.stopPropagation();
    const electron = window.electronAPI;
    if (!electron) return;
    if (editTitleText.trim()) {
      await electron.history.update(id, editTitleText.trim());
      await loadConversations();
    }
    setEditingTitleId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || !activeDatabasePath) return;

    let currentConversationId = activeConversationId;
    const electron = window.electronAPI!;

    // 1. Create conversation if none exists
    if (!currentConversationId) {
      const title = input.trim().substring(0, 30) + (input.length > 30 ? '...' : '');
      const createRes = await electron.history.create(title);
      if (createRes.success) {
        currentConversationId = createRes.data.id;
        setActiveConversationId(currentConversationId);
        await loadConversations(); // Update sidebar
      } else {
        return; // failed to create
      }
    }

    // 2. Save User Message
    const userMsgData: Partial<ConversationMessage> = { role: 'user', content: input.trim() };
    const addRes = await electron.history.addMessage(currentConversationId, userMsgData);
    let userMsg: ConversationMessage;
    if (addRes.success) {
      userMsg = addRes.data;
    } else {
      userMsg = { ...userMsgData, id: 'temp', conversation_id: currentConversationId, created_at: new Date().toISOString() } as ConversationMessage;
    }

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      // 3. Get AI Response
      const aiInputMessages: ChatMessage[] = newMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await electron.ai.generateSQL(aiInputMessages);
      
      let aiMsgData: Partial<ConversationMessage> = { role: 'assistant', content: '' };

      if (res.success) {
        const aiMsg = res.data;
        if (aiMsg.isAmbiguous) {
          aiMsgData.content = aiMsg.message;
        } else {
          let queryData;
          if (aiMsg.sql) {
            try {
              const execRes = await electron.database.executeQuery(aiMsg.sql);
              if (execRes.success) {
                queryData = execRes.data;
              } else {
                queryData = { columns: ['Error'], rows: [{ Error: execRes.error?.message || 'Query failed' }], rowCount: 1, executionTimeMs: 0 };
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              queryData = { columns: ['Error'], rows: [{ Error: msg }], rowCount: 1, executionTimeMs: 0 };
            }
          }

          aiMsgData.content = `Here is the query I generated:\n\n\`\`\`sql\n${aiMsg.sql}\n\`\`\``;
          aiMsgData.queryResult = queryData;
        }
      } else {
        aiMsgData.content = `**Error:** ${res.error.message}`;
      }

      // 4. Save AI Message
      const addAiRes = await electron.history.addMessage(currentConversationId, aiMsgData);
      if (addAiRes.success) {
        setMessages(prev => [...prev, addAiRes.data]);
      } else {
        setMessages(prev => [...prev, { ...aiMsgData, id: 'temp', conversation_id: currentConversationId!, created_at: new Date().toISOString() } as ConversationMessage]);
      }

    } catch (err: unknown) {
      const errorMsgData: Partial<ConversationMessage> = { role: 'assistant', content: `**Error:** Failed to connect to AI provider.` };
      const addErrRes = await electron.history.addMessage(currentConversationId, errorMsgData);
      if (addErrRes.success) {
        setMessages(prev => [...prev, addErrRes.data]);
      }
    } finally {
      setIsTyping(false);
      await loadConversations(); // refresh timestamps
    }
  };

  const handleOptimize = async (index: number, sql: string) => {
    const msg = messages[index];
    if (!msg || !msg.id || msg.id === 'temp') return;
    
    // Set isOptimizing
    const newMessages = [...messages];
    newMessages[index] = { ...msg, isOptimizing: true };
    setMessages(newMessages);

    try {
      const res = await window.electronAPI!.ai.optimizeSQL(sql);
      if (res.success) {
        // Need to update backend - but our history service doesn't have an updateMessage yet.
        // For simplicity in Phase 12, we can just update local state if we don't have updateMessage.
        // Or we could implement updateMessage. Let's just update local state for the prototype.
        const msgs = [...messages];
        msgs[index] = { ...msg, isOptimizing: false, optimizationResult: res.data };
        setMessages(msgs);
      } else {
        const msgs = [...messages];
        msgs[index] = { ...msg, isOptimizing: false };
        setMessages(msgs);
      }
    } catch (e) {
      const msgs = [...messages];
      msgs[index] = { ...msg, isOptimizing: false };
      setMessages(msgs);
    }
  };

  const handleExplain = async (index: number, sql: string) => {
    const msg = messages[index];
    if (!msg || !msg.id || msg.id === 'temp') return;

    const newMessages = [...messages];
    newMessages[index] = { ...msg, isExplaining: true };
    setMessages(newMessages);

    try {
      const planRes = await window.electronAPI!.database.explainQuery(sql);
      if (planRes.success) {
        const aiRes = await window.electronAPI!.ai.explainQueryPlan(sql, planRes.data);
        const msgs = [...messages];
        if (aiRes.success) {
          msgs[index] = {
            ...msg,
            isExplaining: false,
            queryPlan: {
              ...planRes.data,
              humanExplanation: aiRes.data.humanReadable,
              performanceIssues: aiRes.data.performanceIssues,
              suggestions: aiRes.data.suggestions,
            }
          };
        } else {
          msgs[index] = { ...msg, isExplaining: false };
        }
        setMessages(msgs);
      } else {
        const msgs = [...messages];
        msgs[index] = { ...msg, isExplaining: false };
        setMessages(msgs);
      }
    } catch (e) {
      const msgs = [...messages];
      msgs[index] = { ...msg, isExplaining: false };
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
      <div style={{ display: 'flex', height: '100%', gap: '1.5rem' }}>
        
        {/* Sidebar History */}
        <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={startNewConversation}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500, justifyContent: 'center' }}
          >
            <Plus size={16} /> New Chat
          </button>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Recent Conversations</h3>
            {conversations.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>No history yet.</p>}
            
            {conversations.map(conv => (
              <div 
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`conv-item ${activeConversationId === conv.id ? 'active' : ''}`}
                onDoubleClick={(e) => startEditingTitle(e, conv)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                  <MessageSquare size={14} color="var(--color-text-secondary)" style={{ flexShrink: 0 }} />
                  {editingTitleId === conv.id ? (
                    <input 
                      autoFocus
                      value={editTitleText}
                      onChange={e => setEditTitleText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEditedTitle(e, conv.id);
                        if (e.key === 'Escape') setEditingTitleId(null);
                      }}
                      onBlur={e => saveEditedTitle(e, conv.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-accent)', borderRadius: '2px', padding: '0.1rem 0.2rem', fontSize: '0.85rem', width: '120px', outline: 'none' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: activeConversationId === conv.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {conv.title}
                    </span>
                  )}
                </div>
                
                <div className="conv-actions">
                  {editingTitleId === conv.id ? (
                    <button onClick={(e) => saveEditedTitle(e, conv.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}><Check size={12} color="var(--color-success)" /></button>
                  ) : (
                    <button onClick={(e) => startEditingTitle(e, conv)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} title="Rename"><Edit2 size={12} color="var(--color-text-muted)" /></button>
                  )}
                  <button onClick={(e) => deleteConversation(e, conv.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }} title="Delete"><Trash2 size={12} color="var(--color-text-muted)" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

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
              <div key={m.id || i} style={{ display: 'flex', gap: '1rem', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
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
                  border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
                  overflow: 'hidden'
                }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  
                  {m.queryResult && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', color: 'var(--color-text-primary)' }}>
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

                  {/* Optimize & Explain Buttons for Assistant messages containing SQL */}
                  {m.role === 'assistant' && m.content.includes('\`\`\`sql') && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {!m.optimizationResult && (
                        <button 
                          onClick={() => {
                            const sqlMatch = m.content.match(/\`\`\`sql\n([\s\S]*?)\n\`\`\`/);
                            if (sqlMatch && sqlMatch[1]) {
                              handleOptimize(i, sqlMatch[1]);
                            }
                          }}
                          disabled={m.isOptimizing}
                          style={{ 
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
                      
                      {!m.queryPlan && (
                        <button 
                          onClick={() => {
                            const sqlMatch = m.content.match(/\`\`\`sql\n([\s\S]*?)\n\`\`\`/);
                            if (sqlMatch && sqlMatch[1]) {
                              handleExplain(i, sqlMatch[1]);
                            }
                          }}
                          disabled={m.isExplaining}
                          style={{ 
                            display: 'flex', gap: '0.5rem', alignItems: 'center', 
                            background: 'transparent', border: '1px solid var(--color-border)', 
                            color: 'var(--color-text-secondary)', padding: '0.4rem 0.8rem', 
                            borderRadius: 'var(--radius-sm)', cursor: m.isExplaining ? 'not-allowed' : 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          <Search size={14} color="#3b82f6" /> 
                          {m.isExplaining ? 'Explaining...' : 'Explain Query'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Explanation Results */}
                  {m.queryPlan && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid #3b82f6', overflow: 'hidden', color: 'var(--color-text-primary)' }}>
                      <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid #3b82f6', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <Search size={14} color="#3b82f6" /> Query Execution Plan
                      </div>
                      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                        <div style={{ lineHeight: 1.5 }}>
                          {m.queryPlan.humanExplanation}
                        </div>
                        
                        {m.queryPlan.performanceIssues && m.queryPlan.performanceIssues.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong style={{ color: '#ef4444' }}>Performance Bottlenecks:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.queryPlan.performanceIssues.map((issue: string, idx: number) => <li key={idx}>{issue}</li>)}
                            </ul>
                          </div>
                        )}
                        
                        {m.queryPlan.suggestions && m.queryPlan.suggestions.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong style={{ color: '#10b981' }}>Suggestions:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.queryPlan.suggestions.map((sug: string, idx: number) => <li key={idx}>{sug}</li>)}
                            </ul>
                          </div>
                        )}
                        
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong style={{ color: 'var(--color-text-secondary)' }}>Raw SQLite Plan:</strong>
                          <pre style={{ background: 'var(--color-bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginTop: '0.25rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                            <code style={{ color: 'var(--color-text-secondary)' }}>{m.queryPlan.rawOutput}</code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Optimization Results */}
                  {m.optimizationResult && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', overflow: 'hidden', color: 'var(--color-text-primary)' }}>
                      <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
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
        .conv-item {
          display: flex; align-items: center; justify-content: space-between; padding: 0.75rem;
          border-radius: var(--radius-sm); cursor: pointer; border: 1px solid transparent;
          transition: background 0.2s;
        }
        .conv-item:hover {
          background: var(--color-bg-elevated);
        }
        .conv-item.active {
          background: var(--color-bg-elevated);
          border-color: var(--color-border);
        }
        .conv-actions {
          display: flex; gap: 0.25rem; opacity: 0; transition: opacity 0.2s;
        }
        .conv-item:hover .conv-actions, .conv-item.active .conv-actions {
          opacity: 1;
        }
      `}} />
    </AppLayout>
  );
}
