import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { MdCheck, MdDone, MdTimer, MdRefresh } from 'react-icons/md'

function elapsed(created) {
  const mins = Math.floor((Date.now() - new Date(created)) / 60000)
  return mins
}

function TimerBadge({ created }) {
  const [mins, setMins] = useState(elapsed(created))
  useEffect(() => {
    const id = setInterval(() => setMins(elapsed(created)), 15000)
    return () => clearInterval(id)
  }, [created])
  const cls = mins >= 15 ? 'alert' : mins >= 8 ? 'warn' : ''
  return (
    <span className={`kds-timer ${cls}`}>
      <MdTimer size={12} /> {mins}m
    </span>
  )
}

export default function KDSBoard() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const { profile } = useAuth()

  const loadTickets = useCallback(async () => {
    const { data, error } = await supabase
      .from('kds_tickets')
      .select(`
        *,
        order:orders(
          id, order_number, order_type, notes,
          table:restaurant_tables(table_number),
          order_items(id, quantity, specifications, status,
            menu_item:menu_items(name)
          )
        )
      `)
      .not('status', 'in', '("served","cancelled")')
      .order('created_at')
    if (error) { toast.error('Failed to load tickets'); return }
    setTickets(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadTickets()
    const sub = supabase.channel('kds-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets' }, loadTickets)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadTickets)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [loadTickets])

  async function acceptTicket(id) {
    const { error } = await supabase.from('kds_tickets').update({
      status: 'preparing', accepted_by: profile.id, accepted_at: new Date().toISOString()
    }).eq('id', id)
    if (error) toast.error('Failed to accept')
    else toast.success('Order accepted — cooking!')
  }

  async function markReady(id) {
    const { error } = await supabase.from('kds_tickets').update({
      status: 'ready', ready_at: new Date().toISOString()
    }).eq('id', id)
    if (error) toast.error('Failed to update')
    else toast.success('Order marked ready!')
  }

  const queued    = tickets.filter(t => t.status === 'queued')
  const preparing = tickets.filter(t => t.status === 'preparing')
  const ready     = tickets.filter(t => t.status === 'ready')

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
      <span className="spinner spinner-lg" />
    </div>
  )

  function TicketCard({ ticket, actions }) {
    const o = ticket.order
    return (
      <div className={`kds-ticket ${ticket.status} animate-in`}>
        <div className="kds-ticket-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {o.order_type === 'dine_in'
                ? `Table ${o.table?.table_number ?? '—'}`
                : '🥡 Takeaway'}
            </span>
            <span className="text-xs text-muted">Order #{o.order_number}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
            <span className={`badge badge-${ticket.status}`}>{ticket.status}</span>
            <TimerBadge created={ticket.created_at} />
          </div>
        </div>

        <div className="kds-ticket-body">
          {o.order_items?.map(item => (
            <div key={item.id} className="kds-ticket-item">
              <div>
                <div style={{ fontWeight: 500 }}>{item.menu_item?.name}</div>
                {item.specifications && (
                  <div className="kds-ticket-spec">⚠ {item.specifications}</div>
                )}
              </div>
              <span className="kds-ticket-item-qty">×{item.quantity}</span>
            </div>
          ))}
          {o.notes && (
            <div style={{
              marginTop: '0.5rem', padding: '0.4rem 0.6rem',
              background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem', color: 'var(--warning)',
            }}>
              📝 {o.notes}
            </div>
          )}
        </div>

        {actions && (
          <div className="kds-ticket-foot">
            {actions}
          </div>
        )}
      </div>
    )
  }

  const colStyle = { flex: 1 }
  const colHeadStyle = {
    fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase',
    letterSpacing: '0.08em', padding: '0.5rem 0', marginBottom: '0.75rem',
    borderBottom: '2px solid',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <p className="text-secondary text-sm">Live kitchen ticket queue — updates in realtime</p>
        <button className="btn btn-ghost btn-sm" onClick={loadTickets}>
          <MdRefresh /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
        {/* Queued */}
        <div style={colStyle}>
          <div style={{ ...colHeadStyle, borderColor: 'var(--status-queued)', color: 'var(--status-queued)' }}>
            <span>🕐 Queued</span>
            <span style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 99, padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>
              {queued.length}
            </span>
          </div>
          {queued.length === 0 && (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">All caught up!</div>
            </div>
          )}
          {queued.map(t => (
            <TicketCard key={t.id} ticket={t} actions={
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => acceptTicket(t.id)}>
                <MdCheck /> Accept & Start
              </button>
            } />
          ))}
        </div>

        {/* Preparing */}
        <div style={colStyle}>
          <div style={{ ...colHeadStyle, borderColor: 'var(--status-preparing)', color: 'var(--status-preparing)' }}>
            <span>🔥 Preparing</span>
            <span style={{ background: 'rgba(245,158,11,0.15)', borderRadius: 99, padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>
              {preparing.length}
            </span>
          </div>
          {preparing.length === 0 && (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <div className="empty-state-icon">🍳</div>
              <div className="empty-state-title">Nothing cooking</div>
            </div>
          )}
          {preparing.map(t => (
            <TicketCard key={t.id} ticket={t} actions={
              <button className="btn btn-success" style={{ width: '100%' }} onClick={() => markReady(t.id)}>
                <MdDone /> Mark Ready
              </button>
            } />
          ))}
        </div>

        {/* Ready */}
        <div style={colStyle}>
          <div style={{ ...colHeadStyle, borderColor: 'var(--status-ready)', color: 'var(--status-ready)' }}>
            <span>✅ Ready</span>
            <span style={{ background: 'rgba(16,185,129,0.15)', borderRadius: 99, padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>
              {ready.length}
            </span>
          </div>
          {ready.length === 0 && (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <div className="empty-state-icon">🛎</div>
              <div className="empty-state-title">Nothing ready yet</div>
            </div>
          )}
          {ready.map(t => (
            <TicketCard key={t.id} ticket={t} actions={null} />
          ))}
        </div>
      </div>

      {/* Mobile: stacked */}
      <style>{`
        @media (max-width: 768px) {
          .kds-board-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
