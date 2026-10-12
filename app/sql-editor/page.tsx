'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/src/components/layout/AppLayout';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import {
  Play,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lightbulb,
  AlertTriangle
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
  const [isValidated, setIsValidated] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [explainPlan, setExplainPlan] = useState<any>(null);
  const [aiPlanExplanation, setAiPlanExplanation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSqlChange = (val: string) => {
    setSql(val);
    setIsValidated(false);
    setErrorMsg(null);
  };

  const handleValidateAndOptimize = async () => {
    const electron = window.electronAPI;
    if (!electron) return;
    setIsOptimizing(true);
    setErrorMsg(null);
    setOptimizationResult(null);
    setExplainPlan(null);
    setAiPlanExplanation(null);
    try {
      // Phase 8: Validate execution safely via EXPLAIN first
      const explainRes = await electron.database.explainQuery(sql);
      if (!explainRes.success) {
        setErrorMsg(explainRes.error?.message || 'Query validation failed.');
        setIsValidated(false);
        setIsOptimizing(false);
        return;
      }
      setExplainPlan(explainRes.data);
      setIsValidated(true);

      // Phase 10: AI Explanation of the Query Plan
      // We run this in parallel with optimization to save time
      const aiExplainPromise = electron.ai.explainQueryPlan(sql, explainRes.data);
      const optPromise = electron.ai.optimizeSQL(sql);

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

  const handleExecute = () => {
    if (!isValidated) {
      setErrorMsg('Please Validate & Optimize before executing.');
      return;
    }
    // Navigate to results page passing the SQL string
    router.push(`/results?sql=${encodeURIComponent(sql)}`);
  };

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
              variant={isValidated ? 'primary' : 'secondary'} 
              icon={<Play size={14} />} 
              onClick={handleExecute}
            >
              Execute Query
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-elevated)', borderLeft: '4px solid #ef4444', borderRadius: 'var(--radius-md)' }}>
            <strong style={{ color: '#ef4444' }}>Validation Error:</strong> {errorMsg}
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
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: 'var(--color-text-primary)',
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
                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px solid var(--color-accent-muted)', borderRadius: 'var(--radius-md)' }}>
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
                    <pre style={{ backgroundColor: 'var(--color-bg-elevated)', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto', marginTop: '0.25rem' }}>
                      <code style={{ color: 'var(--color-accent)' }}>{optimizationResult.optimizedSql}</code>
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
    </AppLayout>
  );
}
