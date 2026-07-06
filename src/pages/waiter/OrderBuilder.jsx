import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { MdAdd, MdRemove, MdSend, MdNote } from 'react-icons/md'

export default function OrderBuilder() {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems]   = useState([])
  const [tables, setTables]         = useState([])
  const [activeCat, setActiveCat]   = useState(null)
  const [cart, setCart]             = useState([])   // {menuItem, qty, spec}
  const [tableId, setTableId]       = useState('')
  const [orderType, setOrderType]   = useState('dine_in')
  const [orderNote, setOrderNote]   = useState('')
  const [noteFor, setNoteFor]       = useState(null) // item id getting note
  const [sending, setSending]       = useState(false)

  useEffect(() => {
    supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => { setCategories(data || []); if (data?.length) setActiveCat(data[0].id) })

    supabase.from('menu_items').select('*').eq('is_available', true)
      .then(({ data }) => setMenuItems(data || []))

    supabase.from('restaurant_tables').select('id,table_number,status').order('table_number')
      .then(({ data }) => setTables(data || []))
  }, [])

  const filtered = menuItems.filter(m => m.category_id === activeCat)

  function addToCart(item) {
    setCart(prev => {
      const ex = prev.find(c => c.menuItem.id === item.id)
      if (ex) return prev.map(c => c.menuItem.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { menuItem: item, qty: 1, spec: '' }]
    })
  }

  function removeFromCart(id) {
    setCart(prev => {
      const ex = prev.find(c => c.menuItem.id === id)
      if (!ex) return prev
      if (ex.qty === 1) return prev.filter(c => c.menuItem.id !== id)
      return prev.map(c => c.menuItem.id === id ? { ...c, qty: c.qty - 1 } : c)
    })
  }

  function setSpec(id, val) {
    setCart(prev => prev.map(c => c.menuItem.id === id ? { ...c, spec: val } : c))
  }

  const cartTotal = cart.reduce((s, c) => s + c.menuItem.price * c.qty, 0)
  const inCart = id => cart.find(c => c.menuItem.id === id)?.qty || 0

  async function placeOrder() {
    if (!cart.length) return toast.error('Add at least one item')
    if (orderType === 'dine_in' && !tableId) return toast.error('Select a table')
    setSending(true)
    try {
      // Create order
      const { data: order, error: oErr } = await supabase.from('orders').insert({
        table_id:   tableId || null,
        order_type: orderType,
        waiter_id:  profile.id,
        notes:      orderNote || null,
      }).select().single()
      if (oErr) throw oErr

      // Insert order items
      const items = cart.map(c => ({
        order_id:       order.id,
        menu_item_id:   c.menuItem.id,
        quantity:       c.qty,
        unit_price:     c.menuItem.price,
        specifications: c.spec || null,
      }))
      const { error: iErr } = await supabase.from('order_items').insert(items)
      if (iErr) throw iErr

      // Mark table occupied
      if (tableId) {
        await supabase.from('restaurant_tables').update({
          status: 'occupied', assigned_to: profile.id, occupied_at: new Date().toISOString()
        }).eq('id', tableId)
      }

      toast.success(`Order #${order.order_number} sent to kitchen!`)
      setCart([]); setOrderNote(''); setTableId('')
      navigate('/waiter/orders')
    } catch (err) {
      toast.error(err.message || 'Failed to place order')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="order-layout">
      {/* Menu area */}
      <div className="menu-area">
        {/* Order meta */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Order Type</label>
              <select className="form-select" value={orderType} onChange={e => setOrderType(e.target.value)}>
                <option value="dine_in">Dine In</option>
                <option value="takeaway">Takeaway</option>
              </select>
            </div>
            {orderType === 'dine_in' && (
              <div className="form-group">
                <label className="form-label">Table</label>
                <select className="form-select" value={tableId} onChange={e => setTableId(e.target.value)}>
                  <option value="">Select table</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>
                      Table {t.table_number} — {t.status}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="category-tabs">
          {categories.map(c => (
            <button
              key={c.id}
              className={`cat-tab ${activeCat === c.id ? 'active' : ''}`}
              onClick={() => setActiveCat(c.id)}
            >{c.name}</button>
          ))}
        </div>

        {/* Menu items */}
        <div className="menu-grid">
          {filtered.map(item => {
            const qty = inCart(item.id)
            return (
              <div
                key={item.id}
                className={`menu-item-card ${!item.is_available ? 'unavailable' : ''} ${qty > 0 ? 'in-order' : ''}`}
                onClick={() => item.is_available && addToCart(item)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className={`menu-item-veg ${item.is_veg ? 'veg' : 'non-veg'}`} />
                  {qty > 0 && (
                    <span style={{
                      background: 'var(--accent)', color: '#000', borderRadius: 99,
                      fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.45rem',
                    }}>×{qty}</span>
                  )}
                </div>
                <div className="menu-item-name">{item.name}</div>
                <div className="menu-item-price">₹{item.price.toFixed(2)}</div>
                {!item.is_available && (
                  <div className="text-xs text-muted">Unavailable</div>
                )}
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🍽</div>
            <div className="empty-state-title">No items in this category</div>
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="order-cart">
        <div className="kds-ticket-head">
          <h3 style={{ fontSize: '0.95rem' }}>Order Cart</h3>
          <span className="badge badge-queued">{cart.length} items</span>
        </div>

        <div className="cart-items">
          {cart.length === 0 && (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon">🛒</div>
              <div className="empty-state-title">Cart is empty</div>
              <p className="text-xs text-muted">Tap menu items to add</p>
            </div>
          )}
          {cart.map(c => (
            <div key={c.menuItem.id} className="cart-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="cart-item-name">{c.menuItem.name}</span>
                <div className="cart-qty-ctrl">
                  <button className="qty-btn" onClick={() => removeFromCart(c.menuItem.id)}><MdRemove size={12} /></button>
                  <span className="cart-qty">{c.qty}</span>
                  <button className="qty-btn" onClick={() => addToCart(c.menuItem)}><MdAdd size={12} /></button>
                </div>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem', marginLeft: 'auto' }}>
                  ₹{(c.menuItem.price * c.qty).toFixed(0)}
                </span>
              </div>
              {/* Spec note */}
              <div style={{ marginTop: '0.3rem' }}>
                {noteFor === c.menuItem.id ? (
                  <input
                    className="form-input"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                    placeholder="Special instructions…"
                    value={c.spec}
                    onChange={e => setSpec(c.menuItem.id, e.target.value)}
                    onBlur={() => setNoteFor(null)}
                    autoFocus
                  />
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', color: 'var(--text-muted)' }}
                    onClick={() => setNoteFor(c.menuItem.id)}
                  >
                    <MdNote size={12} /> {c.spec || 'Add note'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="cart-footer">
          <div className="cart-total-row">
            <span>Subtotal</span>
            <span className="text-accent">₹{cartTotal.toFixed(2)}</span>
          </div>
          <div className="form-group" style={{ marginTop: '0.25rem' }}>
            <input
              className="form-input"
              placeholder="Order notes (optional)…"
              value={orderNote}
              onChange={e => setOrderNote(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={placeOrder}
            disabled={sending || !cart.length}
          >
            {sending
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Sending…</>
              : <><MdSend /> Send to Kitchen</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
