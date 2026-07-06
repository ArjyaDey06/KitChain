import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { MdAdd, MdSearch, MdEdit, MdDelete, MdCheckCircle, MdCancel, MdPeople } from 'react-icons/md'

export default function TableMap() {
  const [tables, setTables]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  async function loadTables() {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*, assigned_to:profiles(full_name)')
      .order('table_number')
    if (error) toast.error('Failed to load tables')
    else setTables(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadTables()
    const sub = supabase.channel('tables-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, loadTables)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function updateStatus(id, status) {
    const patch = { status }
    if (status === 'occupied') patch.occupied_at = new Date().toISOString()
    if (status === 'free')     { patch.occupied_at = null; patch.assigned_to = null }
    const { error } = await supabase.from('restaurant_tables').update(patch).eq('id', id)
    if (error) toast.error('Update failed')
    else toast.success(`Table marked ${status}`)
  }

  const statusCounts = {
    free:     tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
    cleaning: tables.filter(t => t.status === 'cleaning').length,
  }

  if (loading) return (
    <div className="full-loader" style={{ position: 'relative', minHeight: 300 }}>
      <span className="spinner spinner-lg" />
    </div>
  )

  return (
    <div>
      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Free',     count: statusCounts.free,     color: 'var(--success)', emoji: '🟢' },
          { label: 'Occupied', count: statusCounts.occupied, color: 'var(--warning)', emoji: '🟡' },
          { label: 'Reserved', count: statusCounts.reserved, color: 'var(--info)',    emoji: '🔵' },
          { label: 'Cleaning', count: statusCounts.cleaning, color: 'var(--status-cleaning)', emoji: '🩷' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label">{s.label}</span>
              <span>{s.emoji}</span>
            </div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.count}</div>
            <div className="text-xs text-muted">tables</div>
          </div>
        ))}
      </div>

      {/* Table grid */}
      <div className="table-grid">
        {tables.map(table => (
          <div
            key={table.id}
            className={`table-card ${table.status}`}
            onClick={() => setSelected(table)}
          >
            <div className="table-card-section">{table.section || 'Main'}</div>
            <div className="table-card-number">{table.table_number}</div>
            <span className={`badge badge-${table.status}`}>{table.status}</span>
            <div className="table-card-capacity" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
              <MdPeople size={12} /> {table.capacity} seats
            </div>
            {table.assigned_to?.full_name && (
              <div className="text-xs text-muted" style={{ marginTop: '0.3rem' }}>
                {table.assigned_to.full_name}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Table detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Table {selected.table_number}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-secondary text-sm">Status</span>
                <span className={`badge badge-${selected.status}`}>{selected.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-secondary text-sm">Section</span>
                <span className="fw-600">{selected.section || 'Main'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-secondary text-sm">Capacity</span>
                <span className="fw-600">{selected.capacity} seats</span>
              </div>
              {selected.occupied_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-secondary text-sm">Since</span>
                  <span className="fw-600">{new Date(selected.occupied_at).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {selected.status !== 'occupied' && (
                <button className="btn btn-secondary" onClick={() => { updateStatus(selected.id, 'occupied'); setSelected(null) }}>
                  Mark Occupied
                </button>
              )}
              {selected.status !== 'free' && (
                <button className="btn btn-success" onClick={() => { updateStatus(selected.id, 'free'); setSelected(null) }}>
                  Mark Free
                </button>
              )}
              {selected.status !== 'reserved' && (
                <button className="btn btn-secondary" onClick={() => { updateStatus(selected.id, 'reserved'); setSelected(null) }}>
                  Reserve
                </button>
              )}
              {selected.status !== 'cleaning' && (
                <button className="btn btn-secondary" onClick={() => { updateStatus(selected.id, 'cleaning'); setSelected(null) }}>
                  Cleaning
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
