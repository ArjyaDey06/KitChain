import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { MdTrendingUp, MdLocalDining, MdWarning, MdAttachMoney } from 'react-icons/md'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const [stats, setStats] = useState({
    dailyRevenue: 0,
    activeOrders: 0,
    lowStockCount: 0,
    topItems: []
  })
  
  const [salesData, setSalesData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
    // Subscribe to multiple channels to keep dashboard live
    const channels = [
      supabase.channel('dash-bills').on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, loadDashboardData),
      supabase.channel('dash-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadDashboardData),
      supabase.channel('dash-inv').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, loadDashboardData)
    ]
    channels.forEach(c => c.subscribe())
    
    return () => channels.forEach(c => supabase.removeChannel(c))
  }, [])

  async function loadDashboardData() {
    try {
      // 1. Get daily revenue (from v_daily_sales view)
      // Since views aren't natively supported in JS client typings, we query directly
      const { data: sales, error: sErr } = await supabase.from('v_daily_sales').select('*').limit(7)
      if (sErr) throw sErr
      
      const todaySales = sales?.[0]?.total_revenue || 0
      
      // Map for chart (reverse to show chronological order)
      const chartData = (sales || []).slice(0, 7).reverse().map(s => ({
        date: new Date(s.sale_date).toLocaleDateString('en-GB', { weekday: 'short' }),
        revenue: s.total_revenue
      }))

      // 2. Active orders count
      const { count: ordersCount, error: oErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("served","cancelled")')
      if (oErr) throw oErr

      // 3. Low stock count
      const { count: lowStock, error: lErr } = await supabase
        .from('v_low_stock_items')
        .select('*', { count: 'exact', head: true })
      if (lErr) throw lErr

      // 4. Top items
      const { data: top, error: tErr } = await supabase
        .from('v_top_menu_items')
        .select('*')
        .limit(5)
      if (tErr) throw tErr

      setStats({
        dailyRevenue: todaySales,
        activeOrders: ordersCount || 0,
        lowStockCount: lowStock || 0,
        topItems: top || []
      })
      setSalesData(chartData)
      setLoading(false)
    } catch (error) {
      toast.error('Failed to load dashboard data')
      console.error(error)
      setLoading(false)
    }
  }

  if (loading) return <div className="full-loader"><span className="spinner spinner-lg" /></div>

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Today's Revenue</span>
            <span className="stat-card-icon" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>
              <MdAttachMoney />
            </span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--success)' }}>₹{stats.dailyRevenue.toLocaleString()}</div>
          <div className="stat-card-delta" style={{ color: 'var(--success)' }}>
             <MdTrendingUp /> Realtime
          </div>
        </div>
        
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Active Orders</span>
            <span className="stat-card-icon" style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--info)' }}>
              <MdLocalDining />
            </span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--info)' }}>{stats.activeOrders}</div>
          <div className="stat-card-delta" style={{ color: 'var(--text-secondary)' }}>
             Kitchen processing
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Low Stock Alerts</span>
            <span className="stat-card-icon" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>
              <MdWarning />
            </span>
          </div>
          <div className="stat-card-value" style={{ color: 'var(--danger)' }}>{stats.lowStockCount}</div>
          <div className="stat-card-delta" style={{ color: 'var(--danger)' }}>
             Items need refill
          </div>
        </div>
      </div>

      <div className="charts-grid">
        {/* Chart */}
        <div className="card">
          <div className="card-header">
            <h3>Revenue (Last 7 Days)</h3>
          </div>
          <div style={{ height: 300, width: '100%' }}>
            <ResponsiveContainer>
              <BarChart data={salesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip 
                  cursor={{ fill: 'var(--bg-hover)' }}
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
                  itemStyle={{ color: 'var(--accent)', fontWeight: 600 }}
                  labelStyle={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}
                />
                <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top items */}
        <div className="card">
          <div className="card-header">
            <h3>Top Selling Items</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stats.topItems.length === 0 ? (
               <div className="empty-state">
                 <div className="text-sm text-muted">No sales data yet</div>
               </div>
            ) : (
              stats.topItems.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ 
                    width: 28, height: 28, borderRadius: '50%', 
                    background: idx === 0 ? 'var(--accent)' : 'var(--bg-raised)', 
                    color: idx === 0 ? '#000' : 'var(--text-secondary)',
                    display: 'grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: 700
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.category}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>{item.total_quantity_sold}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>sold</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
