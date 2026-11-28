'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { AiAnswerMeta, ChatMessage, Conversation, ConversationMessage, DatabaseEngine } from '@/src/types';
import { Send, Bot, User, Database, Zap, Search, MessageSquare, Plus, Trash2, Edit2, Check, AlertTriangle, BookOpen, HelpCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useDatabaseContext } from '@/src/contexts/DatabaseContext';
import { readSession } from '@/src/utils/session-storage';

const ENGINE_SHORT: Record<DatabaseEngine, string> = { sqlite: 'SQLite', mysql: 'MySQL', postgresql: 'PostgreSQL' };

/** localStorage key for the collapsed state of the conversation sidebar */
const SIDEBAR_KEY = 'sqlsensi.chat.sidebarCollapsed';

const iconButton: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)',
};

/** Current session token for per-user history calls; empty when signed out. */
const authToken = (): string => readSession()?.token ?? '';

/** Message text with ```sql blocks shown as dark code panels (the rest stays plain text) */
function MessageText({ content }: { content: string }) {
  const parts = content.split(/```sql\n([\s\S]*?)\n```/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            style={{ margin: '0.5rem 0', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--color-code-bg)', color: 'var(--color-code-text)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto' }}
          >
            <code>{part}</code>
          </pre>
        ) : (
          part.trim() && <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{part.trim()}</div>
        )
      )}
    </>
  );
}

/** Badge, tables, assumptions and warnings for a structured assistant answer */
function AnswerMeta({ meta }: { meta: AiAnswerMeta }) {
  const badge =
    meta.mode === 'general'
      ? { icon: <BookOpen size={12} aria-hidden="true" />, text: 'General SQL knowledge', bg: 'var(--brand-cream)', fg: 'var(--color-warning)' }
      : meta.mode === 'clarify'
        ? { icon: <HelpCircle size={12} aria-hidden="true" />, text: 'Needs more detail', bg: 'var(--color-bg-base)', fg: 'var(--color-text-secondary)' }
        : { icon: <Database size={12} aria-hidden="true" />, text: `Based on your schema · ${ENGINE_SHORT[meta.engine]}`, bg: 'var(--color-bg-overlay)', fg: 'var(--brand-deep)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.625rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', background: badge.bg, color: badge.fg, fontSize: '0.72rem', fontWeight: 700 }}>
          {badge.icon} {badge.text}
        </span>
        {meta.tablesUsed.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Tables: {meta.tablesUsed.map(t => <code key={t} style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', marginRight: '0.35rem' }}>{t}</code>)}
          </span>
        )}
      </div>
      {meta.assumptions.length > 0 && (
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-page)', border: '1px solid var(--brand-cream)', fontSize: '0.8rem' }}>
          <strong>Assumptions:</strong> {meta.assumptions.join(' · ')}
        </div>
      )}
      {meta.warnings.length > 0 && (
        <div role="note" style={{ display: 'flex', gap: '0.4rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-muted)', color: 'var(--color-warning)', fontSize: '0.8rem' }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: '2px' }} aria-hidden="true" />
          <span>{meta.warnings.join(' ')}</span>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { activeConnection, isLoading: isDbLoading } = useDatabaseContext();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');

  // A question handed over from the Home page (?q=…) prefills the input; it is not sent automatically
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setInput(q.slice(0, 2000));
  }, []);
  const [isTyping, setIsTyping] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // History state
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Collapsible "Recent Conversations" sidebar; the choice is remembered across visits.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1'); } catch { /* storage unavailable */ }
  }, []);
  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  };
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');
  /** Inline error for Optimize / Explain on a message */
  const [actionError, setActionError] = useState<{ index: number; text: string } | null>(null);

  // A conversation belongs to one database. If another database is active now,
  // the conversation is read-only until the user switches back or starts a new chat.
  const activeConversation = conversations.find(c => c.id === activeConversationId) ?? null;
  const conversationMismatch = Boolean(
    activeConversation?.connectionId && activeConnection && activeConversation.connectionId !== activeConnection.connectionId
  );

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    const electron = window.electronAPI;
    if (!electron) return;
    const res = await electron.history.list(authToken());
    if (res.success) {
      setConversations(res.data);
    }
  };

  const loadConversation = async (id: string) => {
    const electron = window.electronAPI;
    if (!electron) return;
    const res = await electron.history.get(authToken(), id);
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
    await electron.history.delete(authToken(), id);
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
      await electron.history.update(authToken(), id, editTitleText.trim());
      await loadConversations();
    }
    setEditingTitleId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || !activeConnection || conversationMismatch) return;
    // The SQL generated for this question may only run on this connection
    const connectionId = activeConnection.connectionId;

    let currentConversationId = activeConversationId;
    const electron = window.electronAPI!;

    // 1. Create conversation if none exists
    if (!currentConversationId) {
      const title = input.trim().substring(0, 30) + (input.length > 30 ? '...' : '');
      const createRes = await electron.history.create(authToken(), title, connectionId);
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
    const addRes = await electron.history.addMessage(authToken(), currentConversationId, userMsgData);
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
      const res = await electron.ai.generateSQL(aiInputMessages, connectionId);

      const aiMsgData: Partial<ConversationMessage> = { role: 'assistant', content: '', connectionId };

      if (res.success) {
        const aiMsg = res.data;
        aiMsgData.aiMeta = aiMsg.meta;
        if (!aiMsg.sql) {
          // General answer or a clarifying question: nothing to run
          aiMsgData.content = aiMsg.message;
        } else {
          let queryData;
          if (aiMsg.sql) {
            try {
              const execRes = await electron.database.executeQuery(aiMsg.sql, connectionId);
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

          aiMsgData.content = `${aiMsg.message}\n\n\`\`\`sql\n${aiMsg.sql}\n\`\`\``;
          aiMsgData.queryResult = queryData;
        }
      } else {
        aiMsgData.content = `**Error:** ${res.error.message}`;
      }

      // 4. Save AI Message
      const addAiRes = await electron.history.addMessage(authToken(), currentConversationId, aiMsgData);
      if (addAiRes.success) {
        setMessages(prev => [...prev, addAiRes.data]);
      } else {
        setMessages(prev => [...prev, { ...aiMsgData, id: 'temp', conversation_id: currentConversationId!, created_at: new Date().toISOString() } as ConversationMessage]);
      }

    } catch (err: unknown) {
      const errorMsgData: Partial<ConversationMessage> = { role: 'assistant', content: `**Error:** Failed to connect to AI provider.` };
      const addErrRes = await electron.history.addMessage(authToken(), currentConversationId, errorMsgData);
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

    setActionError(null);
    try {
      // The message's own connection: main refuses if another database is active now
      const res = await window.electronAPI!.ai.optimizeSQL(sql, msg.connectionId ?? activeConnection?.connectionId ?? '');
      if (res.success) {
        // Optimization results are kept in page state only (history has no message update yet)
        const msgs = [...messages];
        msgs[index] = { ...msg, isOptimizing: false, optimizationResult: res.data };
        setMessages(msgs);
      } else {
        const msgs = [...messages];
        msgs[index] = { ...msg, isOptimizing: false };
        setMessages(msgs);
        setActionError({ index, text: res.error.message });
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

    setActionError(null);
    try {
      // The message's own connection (stored in history since V2). Only pre-V2 messages,
      // which have none, fall back to the connection that is active now.
      const connectionId = msg.connectionId ?? activeConnection?.connectionId ?? '';
      const planRes = await window.electronAPI!.database.explainQuery(sql, connectionId);
      if (!planRes.success) setActionError({ index, text: planRes.error.message });
      if (planRes.success) {
        const aiRes = await window.electronAPI!.ai.explainQueryPlan(sql, planRes.data, connectionId);
        if (!aiRes.success) setActionError({ index, text: aiRes.error.message });
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

  if (!activeConnection && !isDbLoading) {
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
        {sidebarCollapsed ? (
        <div style={{ width: '48px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={startNewConversation}
            className="solid-hover"
            title="New Chat"
            aria-label="New Chat"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', background: 'var(--color-accent)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            <Plus size={18} />
          </button>
          <button onClick={toggleSidebar} className="hover-row" style={iconButton} title="Show recent conversations" aria-label="Show recent conversations" aria-expanded={false}>
            <PanelLeftOpen size={18} />
          </button>
        </div>
        ) : (
        <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            onClick={startNewConversation}
            className="solid-hover"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--color-accent)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500, justifyContent: 'center' }}
          >
            <Plus size={16} /> New Chat
          </button>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em', margin: 0 }}>Recent Conversations</h3>
              <button onClick={toggleSidebar} className="hover-row" style={iconButton} title="Hide recent conversations" aria-label="Hide recent conversations" aria-expanded={true}>
                <PanelLeftClose size={16} />
              </button>
            </div>
            {conversations.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>No history yet.</p>}
            
            {conversations.map(conv => (
              <div 
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`conv-item ${activeConversationId === conv.id ? 'active' : ''}`}
                onDoubleClick={(e) => startEditingTitle(e, conv)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }} title={`${conv.databaseName}${conv.engine ? ` (${ENGINE_SHORT[conv.engine]})` : ''}`}>
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
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: activeConversationId === conv.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                        {conv.title}
                      </span>
                      {/* Which database this conversation is about */}
                      <span style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {conv.engine ? `${ENGINE_SHORT[conv.engine]} · ` : ''}{conv.databaseName}
                      </span>
                    </span>
                  )}
                </div>
                
                <div className="conv-actions">
                  {editingTitleId === conv.id ? (
                    <button onClick={(e) => saveEditedTitle(e, conv.id)} className="hover-row" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'inline-flex' }}><Check size={12} color="var(--color-success)" /></button>
                  ) : (
                    <button onClick={(e) => startEditingTitle(e, conv)} className="hover-row" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'inline-flex' }} title="Rename"><Edit2 size={12} color="var(--color-text-muted)" /></button>
                  )}
                  <button onClick={(e) => deleteConversation(e, conv.id)} className="hover-row" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'inline-flex' }} title="Delete"><Trash2 size={12} color="var(--color-text-muted)" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Chat Area */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {messages.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <Bot size={48} opacity={0.3} style={{ margin: '0 auto 1rem auto' }} />
                <h3>SQL Sensi is ready.</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  Ask about <strong>{activeConnection?.label}</strong>, e.g. &quot;Which tables are in this database?&quot;, or any general SQL question.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={m.id || i} style={{ display: 'flex', gap: '1rem', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ 
                  width: 32, height: 32, borderRadius: '50%', background: m.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-elevated)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none'
                }}>
                  {m.role === 'user' ? <User size={16} style={{ color: "var(--color-on-accent)" }} /> : <Bot size={16} color="var(--color-accent)" />}
                </div>
                <div style={{ 
                  background: m.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                  color: m.role === 'user' ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  maxWidth: '75%',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
                  overflow: 'hidden'
                }}>
                  {m.role === 'assistant' && m.aiMeta && <AnswerMeta meta={m.aiMeta} />}
                  <MessageText content={m.content} />
                  {actionError?.index === i && (
                    <div role="alert" style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '0.8rem' }}>
                      {actionError.text}
                    </div>
                  )}
                  
                  {m.queryResult && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', color: 'var(--color-text-primary)' }}>
                      <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Query Results ({m.queryResult.rowCount} rows)</span>
                        <span>{m.queryResult.executionTimeMs.toFixed(2)} ms</span>
                      </div>
                      <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
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
                          <Search size={14} style={{ color: "var(--brand-deep)" }} /> 
                          {m.isExplaining ? 'Explaining...' : 'Explain Query'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Explanation Results */}
                  {m.queryPlan && (
                    <div style={{ marginTop: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--brand-sky)', overflow: 'hidden', color: 'var(--color-text-primary)' }}>
                      <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--brand-sky)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <Search size={14} style={{ color: "var(--brand-deep)" }} /> Query Execution Plan
                      </div>
                      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                        <div style={{ lineHeight: 1.5 }}>
                          {m.queryPlan.humanExplanation}
                        </div>
                        
                        {m.queryPlan.performanceIssues && m.queryPlan.performanceIssues.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong style={{ color: 'var(--color-danger)' }}>Performance Bottlenecks:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.queryPlan.performanceIssues.map((issue: string, idx: number) => <li key={idx}>{issue}</li>)}
                            </ul>
                          </div>
                        )}
                        
                        {m.queryPlan.suggestions && m.queryPlan.suggestions.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong style={{ color: 'var(--color-success)' }}>Suggestions:</strong>
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
                            <strong style={{ color: 'var(--color-danger)' }}>Issues Detected:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.optimizationResult.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                            </ul>
                          </div>
                        )}
                        {m.optimizationResult.suggestions.length > 0 && (
                          <div>
                            <strong style={{ color: 'var(--color-success)' }}>Suggestions:</strong>
                            <ul style={{ margin: '0.25rem 0 0 1.25rem', color: 'var(--color-text-secondary)' }}>
                              {m.optimizationResult.suggestions.map((sug, idx) => <li key={idx}>{sug}</li>)}
                            </ul>
                          </div>
                        )}
                        <div>
                          <strong>Optimized SQL:</strong>
                          <pre style={{ background: 'var(--color-code-bg)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: 'none', marginTop: '0.25rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                            <code style={{ color: 'var(--color-code-text)' }}>{m.optimizationResult.optimizedSql}</code>
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
            {conversationMismatch && activeConversation && (
              <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-md)', background: 'var(--brand-cream)', fontSize: '0.85rem' }}>
                <span>
                  This conversation is about <strong>{activeConversation.databaseName}</strong>, but <strong>{activeConnection?.label}</strong> is connected now.
                  Switch back on the Connections page to continue it, or start a new chat.
                </span>
                <button type="button" onClick={startNewConversation} className="solid-hover" style={{ border: 'none', borderRadius: 'var(--radius-md)', padding: '0.4rem 0.875rem', background: 'var(--brand-deep)', color: 'var(--color-on-accent)', fontWeight: 600, cursor: 'pointer' }}>
                  New chat
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label htmlFor="chat-input" className="visually-hidden">Your question</label>
              <input
                id="chat-input"
                type="text"
                placeholder={conversationMismatch ? 'This conversation is about another database' : `Ask about ${activeConnection?.label ?? 'your database'} or SQL in general…`}
                disabled={conversationMismatch}
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
                className="solid-hover"
                aria-label="Send"
                disabled={!input.trim() || isTyping || conversationMismatch}
                style={{
                  background: 'var(--color-accent)', color: 'var(--color-on-accent)', border: 'none', 
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
          display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0.75rem;
          border-radius: 10px; cursor: pointer; border: 1px solid transparent;
          transition: background-color 150ms var(--ease-out), border-color 150ms var(--ease-out);
        }
        .conv-item:hover {
          background: var(--hover-tint);
        }
        .conv-item:active {
          background: var(--press-tint);
        }
        .conv-item.active {
          background: var(--color-bg-overlay);
          border-color: var(--brand-sky);
        }
        .conv-actions {
          display: flex; gap: 0.25rem; opacity: 0; transition: opacity 150ms var(--ease-out);
        }
        .conv-item:hover .conv-actions, .conv-item.active .conv-actions {
          opacity: 1;
        }
      `}} />
    </AppLayout>
  );
}
