'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { ChatMessage } from '@/src/types';
import { Send, Bot, User, Database, Settings } from 'lucide-react';
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
          setMessages([...newMessages, { 
            role: 'assistant', 
            content: `Here is the query I generated:\n\n\`\`\`sql\n${aiMsg.sql}\n\`\`\`` 
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
                  whiteSpace: 'pre-wrap',
                  border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none'
                }}>
                  {m.content}
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
