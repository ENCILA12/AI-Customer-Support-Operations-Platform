import React, { useState, useEffect } from 'react';
import { 
  Check, 
  X, 
  ArrowUpRight, 
  Search, 
  Clock, 
  Layers, 
  ExternalLink,
  ChevronRight,
  Shield,
  FileText,
  User,
  Filter,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface Ticket {
  id: string;
  external_id: string;
  customer_email: string;
  customer_name?: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  metadata?: {
    ai_draft?: string;
    confidence?: number;
    sentiment?: string;
    requires_escalation?: boolean;
    evidence_used?: string[];
    rag_sources_count?: number;
  };
}

export function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [editedDraft, setEditedDraft] = useState<string>('');
  const [filter, setFilter] = useState<string>('pending'); // default to pending/unprocessed queue
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState<boolean>(false);

  const fetchTickets = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/tickets');
      if (res.ok) {
        const data: Ticket[] = await res.json();
        setTickets(data);
        
        setSelectedTicket(prevSelected => {
          if (!prevSelected && data.length > 0) {
            setEditedDraft(data[0].metadata?.ai_draft || '');
            setIsDraftDirty(false);
            return data[0];
          }
          if (prevSelected) {
            // Keep current selection synced without overwriting draft if user is currently typing
            const fresh = data.find(t => t.id === prevSelected.id);
            return fresh || prevSelected;
          }
          return null;
        });
      }
    } catch (e) {
      console.error('Failed to fetch tickets', e);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 5000);
    return () => clearInterval(interval);
  }, []);

  const selectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setEditedDraft(ticket.metadata?.ai_draft || '');
    setIsDraftDirty(false);
    setStatusNotification(null);
  };

  const handleDecision = async (decision: 'approved' | 'rejected' | 'modified_and_approved' | 'escalated') => {
    if (!selectedTicket) return;
    setIsSubmitting(true);
    setStatusNotification(null);

    const resultingStatus = (decision === 'approved' || decision === 'modified_and_approved') ? 'approved' : decision;

    try {
      const payload = {
        ticket_id: selectedTicket.id,
        decision: decision,
        reviewer_id: "agent_ian",
        draft_content: selectedTicket.metadata?.ai_draft || '',
        final_content: editedDraft,
        rejection_reason: decision === 'rejected' ? 'Declined by reviewer policy standards' : null
      };

      // 1. Trigger n8n Workflow (WF-04: Human Approval Processing) so it records in n8n Executions!
      let res = await fetch('http://localhost:5678/webhook/approval-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => null);

      // 2. Direct fallback to FastAPI if n8n webhook is not listening/offline
      if (!res || !res.ok) {
        res = await fetch('http://127.0.0.1:8000/api/v1/approvals/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res && res.ok) {
        setIsDraftDirty(false);
        setStatusNotification(`Ticket #${selectedTicket.external_id} saved as ${resultingStatus.toUpperCase()}!`);
        
        // Optimistically update tickets list
        const updatedList = tickets.map(t => {
          if (t.id === selectedTicket.id) {
            return {
              ...t,
              status: resultingStatus,
              metadata: {
                ...t.metadata,
                ai_draft: editedDraft
              }
            };
          }
          return t;
        });
        setTickets(updatedList);

        // Update selected ticket state
        const updatedSelected = {
          ...selectedTicket,
          status: resultingStatus,
          metadata: {
            ...selectedTicket.metadata,
            ai_draft: editedDraft
          }
        };
        setSelectedTicket(updatedSelected);

        // If user was viewing pending queue, advance to the next pending ticket
        if (filter === 'pending') {
          const nextPending = updatedList.find(t => t.id !== selectedTicket.id && (t.status === 'new' || t.status === 'draft_ready' || t.status === 'pending_approval'));
          if (nextPending) {
            selectTicket(nextPending);
          }
        }
      } else {
        setStatusNotification('Failed to update ticket.');
      }
    } catch (e) {
      setStatusNotification('Failed to connect to API');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTicketProcessed = selectedTicket && ['approved', 'rejected', 'escalated'].includes(selectedTicket.status);

  const filteredTickets = tickets.filter(t => {
    let matchesFilter = true;
    if (filter === 'pending') {
      matchesFilter = t.status === 'draft_ready' || t.status === 'new' || t.status === 'pending_approval';
    } else if (filter !== 'all') {
      matchesFilter = t.status === filter;
    }

    const matchesSearch = t.subject.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.customer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.customer_name && t.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)' }}>
      {/* Sleek Enterprise Top Bar (Linear/Zendesk style) */}
      <header style={{
        height: '52px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--bg-sidebar)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: '#2563eb',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 700
          }}>
            O
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
            Operations Desk
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-subtle)', paddingLeft: '8px', borderLeft: '1px solid var(--border-subtle)' }}>
            Inbox • Production
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
            <span>API Online</span>
          </div>

          <button 
            onClick={fetchTickets}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-regular)',
              padding: '4px 8px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <RefreshCw size={12} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* 3-Column Desk Layout with seamless edge-to-edge alignment */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr 340px', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Column: Tickets Queue */}
        <aside style={{
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-sidebar)',
          height: '100%',
          overflow: 'hidden'
        }}>
          {/* Search Input */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '8px 12px'
            }}>
              <Search size={14} color="var(--text-dim)" />
              <input 
                type="text" 
                placeholder="Filter inquiries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-strong)',
                  outline: 'none',
                  fontSize: '13px',
                  width: '100%'
                }}
              />
            </div>

            {/* Filter Tabs - Clean wrap without clipping */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {[
                { 
                  id: 'pending', 
                  label: 'Action Required',
                  count: tickets.filter(t => t.status === 'draft_ready' || t.status === 'new' || t.status === 'pending_approval').length
                },
                { 
                  id: 'all', 
                  label: 'All Inquiries',
                  count: tickets.length
                },
                { 
                  id: 'approved', 
                  label: 'Approved',
                  count: tickets.filter(t => t.status === 'approved').length
                },
                { 
                  id: 'rejected', 
                  label: 'Rejected',
                  count: tickets.filter(t => t.status === 'rejected').length
                },
                { 
                  id: 'escalated', 
                  label: 'Escalated',
                  count: tickets.filter(t => t.status === 'escalated').length
                }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    background: filter === f.id ? 'var(--bg-surface-elevated)' : 'transparent',
                    border: '1px solid',
                    borderColor: filter === f.id ? 'var(--border-active)' : 'var(--border-subtle)',
                    borderRadius: '5px',
                    padding: '5px 9px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: filter === f.id ? 'var(--text-strong)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{f.label}</span>
                  {f.count > 0 && (
                    <span style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '10px',
                      background: filter === f.id ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                      color: filter === f.id ? '#fff' : 'var(--text-dim)',
                      fontWeight: 600
                    }}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Rows */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {filteredTickets.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No tickets in this view
              </div>
            ) : filteredTickets.map(t => {
              const isSelected = selectedTicket?.id === t.id;
              return (
                <div 
                  key={t.id}
                  onClick={() => selectTicket(t)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '6px',
                    background: isSelected ? 'var(--bg-surface-elevated)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                    borderTop: '1px solid',
                    borderRight: '1px solid',
                    borderBottom: '1px solid',
                    borderColor: isSelected ? 'var(--border-subtle)' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: '4px',
                    transition: 'all 0.1s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#fff' : 'var(--text-strong)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                      {t.customer_name || t.customer_email.split('@')[0]}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      color: t.priority === 'urgent' ? 'var(--badge-rose-text)' : 'var(--badge-amber-text)'
                    }}>
                      {t.priority}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-regular)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {t.subject}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {t.message}
                    </div>
                    <span style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: t.status === 'approved' ? 'var(--badge-emerald)' : t.status === 'rejected' ? 'var(--badge-rose)' : t.status === 'escalated' ? 'var(--badge-amber)' : 'var(--badge-blue)',
                      color: t.status === 'approved' ? 'var(--badge-emerald-text)' : t.status === 'rejected' ? 'var(--badge-rose-text)' : t.status === 'escalated' ? 'var(--badge-amber-text)' : 'var(--badge-blue-text)',
                      border: '1px solid currentColor'
                    }}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Column: Edge-to-edge Ticket Detail & Copilot */}
        <main style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', height: '100%', overflowY: 'auto' }}>
          {selectedTicket ? (
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', height: '100%' }}>
              
              {statusNotification && (
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--badge-emerald)',
                  border: '1px solid var(--badge-emerald-text)',
                  color: 'var(--badge-emerald-text)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Check size={16} />
                  <span>{statusNotification}</span>
                </div>
              )}

              {/* Inquiry Header */}
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.3 }}>
                      {selectedTicket.subject}
                    </h1>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: selectedTicket.status === 'approved' ? 'var(--badge-emerald)' : selectedTicket.status === 'rejected' ? 'var(--badge-rose)' : 'var(--badge-blue)',
                      color: selectedTicket.status === 'approved' ? 'var(--badge-emerald-text)' : selectedTicket.status === 'rejected' ? 'var(--badge-rose-text)' : 'var(--badge-blue-text)',
                      border: '1px solid currentColor'
                    }}>
                      {selectedTicket.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {selectedTicket.external_id}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span>From:</span>
                  <strong style={{ color: 'var(--text-regular)' }}>{selectedTicket.customer_name}</strong>
                  <span>&lt;{selectedTicket.customer_email}&gt;</span>
                </div>
              </div>

              {/* Customer Message */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '18px',
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--text-strong)',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedTicket.message}
              </div>

              {/* AI Draft Response Section */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-active)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    <Sparkles size={14} color="#60a5fa" />
                    <span>AI Copilot Draft (Grounded in Knowledge Base)</span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Confidence: <strong>{((selectedTicket.metadata?.confidence || 0.95) * 100).toFixed(0)}%</strong>
                  </div>
                </div>

                <textarea
                  value={editedDraft}
                  onChange={(e) => {
                    setEditedDraft(e.target.value);
                    setIsDraftDirty(true);
                  }}
                  disabled={isTicketProcessed}
                  rows={7}
                  placeholder="Review or customize the response before dispatching..."
                  style={{
                    width: '100%',
                    background: isTicketProcessed ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                    border: 'none',
                    padding: '16px',
                    color: isTicketProcessed ? 'var(--text-muted)' : 'var(--text-strong)',
                    fontSize: '14px',
                    lineHeight: 1.6,
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                    cursor: isTicketProcessed ? 'not-allowed' : 'text'
                  }}
                />

                {/* Bottom Actions Bar */}
                <div style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-elevated)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {selectedTicket.status === 'approved' ? (
                      <span style={{ color: 'var(--badge-emerald-text)', fontWeight: 600 }}>
                        ✓ Response approved and dispatched to customer. Ticket is locked.
                      </span>
                    ) : selectedTicket.status === 'rejected' ? (
                      <span style={{ color: 'var(--badge-rose-text)', fontWeight: 600 }}>
                        ✕ Ticket rejected and closed. Ticket is locked.
                      </span>
                    ) : selectedTicket.status === 'escalated' ? (
                      <span style={{ color: 'var(--badge-amber-text)', fontWeight: 600 }}>
                        ▲ Ticket escalated to Senior Support Tier. Ticket is locked.
                      </span>
                    ) : (
                      <span>
                        {isDraftDirty ? (
                          <strong style={{ color: '#60a5fa' }}>Draft modified. Ready to approve & dispatch.</strong>
                        ) : (
                          "Draft ready for human verification and dispatch."
                        )}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn-danger"
                      onClick={() => handleDecision('rejected')}
                      disabled={isSubmitting || !!isTicketProcessed}
                      style={{ opacity: isTicketProcessed ? 0.35 : 1, cursor: isTicketProcessed ? 'not-allowed' : 'pointer' }}
                    >
                      <X size={14} />
                      Reject
                    </button>

                    <button 
                      className="btn-secondary"
                      onClick={() => handleDecision('escalated')}
                      disabled={isSubmitting || !!isTicketProcessed}
                      style={{ opacity: isTicketProcessed ? 0.35 : 1, cursor: isTicketProcessed ? 'not-allowed' : 'pointer' }}
                    >
                      Escalate
                    </button>

                    <button 
                      className="btn-primary"
                      onClick={() => handleDecision(isDraftDirty ? 'modified_and_approved' : 'approved')}
                      disabled={isSubmitting || !!isTicketProcessed}
                      style={{
                        opacity: isTicketProcessed ? 0.35 : 1,
                        cursor: isTicketProcessed ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <Check size={14} />
                      {selectedTicket.status === 'approved' ? 'Approved & Dispatched' : 'Approve & Send'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Select a conversation to begin review
            </div>
          )}
        </main>

        {/* Right Column: Grounding Context (Clean Sidebar) */}
        <aside style={{
          borderLeft: '1px solid var(--border-subtle)',
          background: 'var(--bg-sidebar)',
          padding: '20px',
          overflowY: 'auto'
        }}>
          <h2 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)', marginBottom: '14px' }}>
            Retrieved Evidence
          </h2>

          {selectedTicket?.metadata?.evidence_used && selectedTicket.metadata.evidence_used.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedTicket.metadata.evidence_used.map((chunk, i) => (
                <div 
                  key={i} 
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: 'var(--text-regular)'
                  }}
                >
                  <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: '11px', marginBottom: '6px' }}>
                    Reference Document #{i + 1}
                  </div>
                  {chunk}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              No grounding documents required for this general inquiry.
            </div>
          )}

          {/* Ticket Meta Details */}
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Attributes
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Category</span>
                <span style={{ color: 'var(--text-strong)', textTransform: 'capitalize' }}>{selectedTicket?.category || 'General'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Sentiment</span>
                <span style={{ color: 'var(--text-strong)', textTransform: 'capitalize' }}>{selectedTicket?.metadata?.sentiment || 'Neutral'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Status</span>
                <span style={{ color: selectedTicket?.status === 'approved' ? '#34d399' : '#60a5fa', textTransform: 'capitalize' }}>
                  {selectedTicket?.status.replace(/_/g, ' ') || 'New'}
                </span>
              </div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
export default App;
