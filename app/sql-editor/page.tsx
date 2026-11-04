'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { useDatabaseContext } from '@/src/contexts';
import { useAuth } from '@/src/hooks/useAuth';
import { readSession } from '@/src/utils/session-storage';
import { classifySqlOperation, isWriteOperation } from '@/src/utils/sql-operation';
import type { PolicyDecision, WriteExecution } from '@/src/types';
import {
  Play,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Pencil,
  X,
  Loader2
} from 'lucide-react';

const defaultSQL = `SELECT 
  c.CustomerId,
  c.FirstName || ' ' || c.LastName AS CustomerName,
  ROUND(SUM(i.BillingTotal), 2) AS TotalSpent
FROM customers c
JOIN invoices i ON c.CustomerId = i.CustomerId
GROUP BY c.CustomerId
ORDER BY TotalSpent DESC
LIMIT 5;`;

export default function SqlEditorPage() {
  const router = useRouter();
  
  const [sql, setSql] = useState(defaultSQL);
  const { activeConnection } = useDatabaseContext();
  const { user } = useAuth();
  const [isValidated, setIsValidated] = useState(true);
  /** Connection the current SQL was validated against */
  const [validatedFor, setValidatedFor] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [explainPlan, setExplainPlan] = useState<any>(null);
  const [aiPlanExplanation, setAiPlanExplanation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Write preview/confirmation flow (Phase 7 UI). Only used for INSERT/UPDATE/DELETE.
  type WriteStage = 'preview' | 'running' | 'done' | 'error';
  interface WriteFlow {
    stage: WriteStage;
    sql: string;
    connectionId: string;
    decision?: PolicyDecision;
    execution?: Extract<WriteExecution, { status: 'executed' }>;
    errorMsg?: string;
  }
  const [writeFlow, setWriteFlow] = useState<WriteFlow | null>(null);

  const handleSqlChange = (val: string) => {
    setSql(val);
    setIsValidated(false);
    setErrorMsg(null);
  };

  const handleValidateAndOptimize = async () => {
    const electron = window.electronAPI;
    if (!electron) return;
    if (!activeConnection) {
      setErrorMsg('Connect a database first.');
      return;
    }
    const connectionId = activeConnection.connectionId;
    setIsOptimizing(true);
    setErrorMsg(null);
    setOptimizationResult(null);
    setExplainPlan(null);
    setAiPlanExplanation(null);
    try {
      // Phase 8: Validate execution safely via EXPLAIN first
      const explainRes = await electron.database.explainQuery(sql, connectionId);
      if (!explainRes.success) {
        setErrorMsg(explainRes.error?.message || 'Query validation failed.');
        setIsValidated(false);
        setIsOptimizing(false);
        return;
      }
      setExplainPlan(explainRes.data);
      setIsValidated(true);
      setValidatedFor(connectionId);

      // Phase 10: AI Explanation of the Query Plan
      // We run this in parallel with optimization to save time
      const aiExplainPromise = electron.ai.explainQueryPlan(sql, explainRes.data, connectionId);
      const optPromise = electron.ai.optimizeSQL(sql, connectionId);

      const [aiExplainRes, optRes] = await Promise.all([aiExplainPromise, optPromise]);

      if (aiExplainRes.success) {
        setAiPlanExplanation(aiExplainRes.data);
      }
      
      // Phase 9: Optimize
      if (optRes.success) {
        setOptimizationResult(optRes.data);
      } else {
        console.warn('Optimization failed:', optRes.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleExecute = async () => {
    const connectionId = validatedFor ?? activeConnection?.connectionId;
    if (!connectionId) {
      setErrorMsg('Connect a database first.');
      return;
    }

    const operation = classifySqlOperation(sql);

    // Writes go through the policy-gated preview/confirm flow, never the read path.
    if (isWriteOperation(operation)) {
      await beginWrite(sql, connectionId);
      return;
    }

    if (!isValidated) {
      setErrorMsg('Please Validate & Optimize before executing.');
      return;
    }
    // Reads navigate to the results page with the connection the SQL was validated for.
    router.push(`/results?sql=${encodeURIComponent(sql)}&cid=${encodeURIComponent(connectionId)}`);
  };

  /** Ask the policy to authorize the write, then open the preview modal (nothing runs yet). */
  const beginWrite = async (writeSql: string, connectionId: string) => {
    setErrorMsg(null);
    const electron = window.electronAPI;
    const token = readSession()?.token;
    if (!electron) return;
    if (!token) {
      setErrorMsg('You must be signed in to run a write.');
      return;
    }
    const auth = await electron.policy.authorize(token, writeSql);
    if (!auth.success) {
      setErrorMsg(auth.error.message);
      return;
    }
    if (!auth.data.allowed) {
      // Show the denial reason in the modal so the preview context is clear.
      setWriteFlow({ stage: 'error', sql: writeSql, connectionId, decision: auth.data, errorMsg: auth.data.reason ?? 'This write is not permitted by the current policy.' });
      return;
    }
    setWriteFlow({ stage: 'preview', sql: writeSql, connectionId, decision: auth.data });
  };

  /** Run the write after the user confirms. Re-checks happen in main immediately before execution. */
  const confirmWrite = async () => {
    if (!writeFlow) return;
    const electron = window.electronAPI;
    const token = readSession()?.token;
    if (!electron || !token) return;
    setWriteFlow({ ...writeFlow, stage: 'running' });
    const res = await electron.database.executeWrite(writeFlow.sql, writeFlow.connectionId, token, [], true);
    if (!res.success) {
      setWriteFlow((f) => (f ? { ...f, stage: 'error', errorMsg: res.error.message } : f));
      return;
    }
    const data = res.data;
    if (data.status === 'executed') {
      const execution = data; // narrowed to the executed variant; captured for the closure
      setWriteFlow((f) => (f ? { ...f, stage: 'done', execution } : f));
    } else {
      // The backend still wants confirmation (e.g. policy changed mid-flight); surface the decision.
      const nextDecision = data.decision;
      setWriteFlow((f) => (f ? { ...f, stage: 'preview', decision: nextDecision } : f));
    }
  };

  const closeWrite = () => setWriteFlow(null);

  const currentOp = classifySqlOperation(sql);
  const isWrite = isWriteOperation(currentOp);

  return (
    <AppLayout title="SQL Editor & Optimizer" databaseName="Active Database">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>SQL Review & Execution Engine</h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Review AI-generated queries, edit safely, view query plans, and execute with strict read-only validation.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              icon={<Zap size={14} />}
              onClick={handleValidateAndOptimize}
              disabled={isOptimizing}
            >
              {isOptimizing ? 'Optimizing...' : 'Validate & Optimize'}
            </Button>
            <Button
              variant={isWrite ? 'danger' : isValidated ? 'primary' : 'secondary'}
              icon={isWrite ? <Pencil size={14} /> : <Play size={14} />}
              onClick={handleExecute}
            >
              {isWrite ? `Review ${currentOp.toUpperCase()}` : 'Execute Query'}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" style={{ padding: '1rem', backgroundColor: 'var(--color-danger-muted)', borderRadius: 'var(--radius-lg)' }}>
            <strong style={{ color: 'var(--color-danger)' }}>Validation Error:</strong> {errorMsg}
          </div>
        )}

        <Card
          title="SQL Query Editor"
          headerAction={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge variant={isValidated ? 'success' : 'warning'} size="sm">
                <ShieldCheck size={12} style={{ marginRight: '3px' }} />
                {isValidated ? 'Read-Only Validated' : 'Edited - Needs Revalidation'}
              </Badge>
            </div>
          }
        >
          <textarea
            value={sql}
            onChange={(e) => handleSqlChange(e.target.value)}
            rows={8}
            style={{
              width: '100%',
              backgroundColor: 'var(--color-code-bg)',
              border: '1px solid var(--color-code-bg)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: 'var(--color-code-text)',
              caretColor: 'var(--brand-sky)',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Phase 8: Explain Plan Data */}
          <Card
            title="EXPLAIN QUERY PLAN Breakdown"
            subtitle="Parsed SQLite execution strategy"
            headerAction={<Badge variant="info">Live Data</Badge>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
              {explainPlan ? (
                <>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    {explainPlan.nodes.map((node: any) => (
                      <div key={node.id} style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-base)', fontFamily: 'var(--font-mono)', marginLeft: `${node.parentId > 0 ? 1 : 0}rem` }}>
                        {node.detail}
                      </div>
                    ))}
                  </div>
                  
                  {aiPlanExplanation && (
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-overlay)', border: '1px solid var(--color-accent-muted)', borderRadius: 'var(--radius-md)' }}>
                      <h4 style={{ fontWeight: 600, color: 'var(--color-accent)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Lightbulb size={14} /> AI Analysis
                      </h4>
                      <p style={{ marginBottom: '0.75rem', lineHeight: 1.5 }}>
                        {aiPlanExplanation.humanReadable}
                      </p>
                      
                      {aiPlanExplanation.performanceIssues?.length > 0 && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: 'var(--color-warning)', fontSize: '0.75rem' }}>Performance Issues:</strong>
                          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem', color: 'var(--color-text-secondary)' }}>
                            {aiPlanExplanation.performanceIssues.map((issue: string, i: number) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiPlanExplanation.suggestions?.length > 0 && (
                        <div>
                          <strong style={{ color: 'var(--color-success)', fontSize: '0.75rem' }}>Suggestions:</strong>
                          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem', color: 'var(--color-text-secondary)' }}>
                            {aiPlanExplanation.suggestions.map((sug: string, i: number) => (
                              <li key={i}>{sug}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--color-text-secondary)', padding: '1rem', textAlign: 'center' }}>
                  Click "Validate & Optimize" to fetch execution plan.
                </div>
              )}
            </div>
          </Card>

          {/* Phase 9: AI Optimization Data */}
          <Card
            title="Optimization Suggestions"
            subtitle="AI-assisted recommendations"
            headerAction={<Lightbulb size={18} style={{ color: 'var(--color-warning)' }} />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem' }}>
              {optimizationResult ? (
                <>
                  {optimizationResult.issues?.map((issue: string, idx: number) => (
                    <div key={'issue-'+idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                      <span>{issue}</span>
                    </div>
                  ))}
                  {optimizationResult.suggestions?.map((sug: string, idx: number) => (
                    <div key={'sug-'+idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <Lightbulb size={16} style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: '2px' }} />
                      <span>{sug}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Optimized SQL:</strong>
                    <pre style={{ backgroundColor: 'var(--color-code-bg)', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto', marginTop: '0.25rem' }}>
                      <code style={{ color: 'var(--color-code-text)' }}>{optimizationResult.optimizedSql}</code>
                    </pre>
                    <Button size="sm" variant="outline" onClick={() => handleSqlChange(optimizationResult.optimizedSql)} style={{ marginTop: '0.5rem' }}>
                      Apply Optimization
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--color-text-secondary)', padding: '1rem', textAlign: 'center' }}>
                  Click "Validate & Optimize" to analyze query.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {writeFlow && (
        <WriteConfirmModal
          flow={writeFlow}
          operation={classifySqlOperation(writeFlow.sql)}
          canWrite={user?.role === 'admin'}
          onConfirm={confirmWrite}
          onClose={closeWrite}
        />
      )}
    </AppLayout>
  );
}

// ─── Write preview / confirmation modal (Phase 7 UI) ──────────

function WriteConfirmModal({
  flow,
  operation,
  canWrite,
  onConfirm,
  onClose,
}: {
  flow: {
    stage: 'preview' | 'running' | 'done' | 'error';
    sql: string;
    decision?: PolicyDecision;
    execution?: Extract<WriteExecution, { status: 'executed' }>;
    errorMsg?: string;
  };
  operation: string;
  canWrite: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const strong = flow.decision?.requiresStrongConfirmation;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Review ${operation.toUpperCase()} statement`}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(14, 42, 56, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1px solid var(--color-border)',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 24px 60px rgba(14,42,56,0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
            <Pencil size={16} /> Review {operation.toUpperCase()}
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Statement</span>
            <pre style={{ marginTop: '0.35rem', backgroundColor: 'var(--color-code-bg)', color: 'var(--color-code-text)', padding: '0.75rem', borderRadius: 'var(--radius-md)', overflowX: 'auto', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{flow.sql}</pre>
          </div>

          {flow.stage !== 'error' && strong && (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--color-warning-muted)', color: 'var(--color-warning)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              This {operation.toUpperCase()} has no WHERE clause and affects every matching row. Confirm only if that is intended.
            </div>
          )}

          {flow.stage === 'error' && (
            <div role="alert" style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--color-danger-muted)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {flow.errorMsg ?? 'The write could not be completed.'}
            </div>
          )}

          {flow.stage === 'done' && flow.execution && (
            <div role="status" style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--color-success-muted)', color: 'var(--color-success)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', alignItems: 'center' }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              {flow.execution.committed ? 'Committed.' : 'Rolled back.'}{' '}
              {flow.execution.affectedRows !== null
                ? `${flow.execution.affectedRows} row${flow.execution.affectedRows === 1 ? '' : 's'} affected`
                : 'Affected-row count not reported by the driver'}
              {` · ${flow.execution.executionTimeMs.toFixed(1)} ms`}
            </div>
          )}

          {flow.stage === 'preview' && !canWrite && (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              Note: writes require an administrator. The database will reject this if your role does not permit it.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)' }}>
          {flow.stage === 'done' || flow.stage === 'error' ? (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={flow.stage === 'running'}>Cancel</Button>
              <Button
                variant="danger"
                icon={flow.stage === 'running' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                onClick={onConfirm}
                disabled={flow.stage === 'running'}
              >
                {flow.stage === 'running' ? 'Running…' : strong ? `Yes, run this ${operation.toUpperCase()}` : `Run ${operation.toUpperCase()}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
