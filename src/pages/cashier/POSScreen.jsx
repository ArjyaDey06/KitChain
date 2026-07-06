import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { MdPrint, MdCheckCircle, MdMoney, MdCreditCard, MdQrCode, MdReceiptLong, MdRestaurantMenu, MdSearch } from 'react-icons/md'
import { QRCodeCanvas } from 'qrcode.react'

export default function POSScreen() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBillId, setSelectedBillId] = useState(null)
  const { profile } = useAuth()
  
  // Invoice state
  const [discountPercent, setDiscountPercent] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('upi')
  const [processing, setProcessing] = useState(false)
  
  const printRef = useRef(null)

  useEffect(() => {
    loadBills()
    const sub = supabase.channel('pos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, loadBills)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function loadBills() {
    const { data, error } = await supabase
      .from('bills')
      .select(`
        *,
        order:orders(
          order_number, order_type, table_id,
          table:restaurant_tables(table_number),
          waiter:profiles!waiter_id(full_name),
          order_items(id, quantity, unit_price, status, menu_item:menu_items(name))
        )
      `)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      
    if (error) toast.error('Failed to load bills')
    else {
      setBills(data || [])
      // Auto-select first bill if none selected and data exists
      if (data?.length > 0 && !selectedBillId) {
        setSelectedBillId(data[0].id)
      } else if (data?.length === 0) {
        setSelectedBillId(null)
      }
    }
    setLoading(false)
  }
  
  const selectedBill = bills.find(b => b.id === selectedBillId)
  
  // Calculate dynamic totals based on discount
  const subtotal = selectedBill?.subtotal || 0
  const discountAmount = (subtotal * (discountPercent / 100)) || 0
  const taxableAmount = subtotal - discountAmount
  
  // Recalculate taxes based on new taxable amount
  const taxDetails = selectedBill?.tax_details || []
  let totalTax = 0
  const recalculatedTaxes = taxDetails.map(t => {
    const amt = (taxableAmount * (t.rate / 100))
    totalTax += amt
    return { ...t, amount: amt }
  })
  
  const grandTotal = taxableAmount + totalTax
  
  // UPI QR logic
  const upiId = 'restaurant@upi' // Replace with actual
  const upiName = 'KitChain Cafe'
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${grandTotal.toFixed(2)}&cu=INR`

  async function markPaid() {
    if (!selectedBill) return
    setProcessing(true)
    
    try {
      const { error } = await supabase.from('bills').update({
        payment_status: 'paid',
        payment_method: paymentMethod,
        discount_amount: discountAmount,
        tax_details: recalculatedTaxes,
        tax_total: totalTax,
        grand_total: grandTotal,
        processed_by: profile.id,
        paid_at: new Date().toISOString()
      }).eq('id', selectedBill.id)
      
      if (error) throw error
      
      toast.success(`Bill #${selectedBill.bill_number} marked as PAID!`)
      setDiscountPercent(0)
      setSelectedBillId(null)
      loadBills() // Refresh lists
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  if (loading) return <div className="full-loader"><span className="spinner spinner-lg" /></div>

  return (
    <div className="pos-layout">
      {/* Left: Bill List */}
      <div className="bill-list">
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MdReceiptLong /> Pending Bills ({bills.length})
        </h2>
        
        {bills.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <div className="empty-state-title">No pending bills!</div>
            <p className="text-sm text-muted">Waiting for waiters to generate bills...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {bills.map(bill => (
              <div 
                key={bill.id} 
                className={`bill-card ${selectedBillId === bill.id ? 'selected' : ''}`}
                onClick={() => { setSelectedBillId(bill.id); setDiscountPercent(0); }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700 }}>
                    Order #{bill.order?.order_number}
                    {bill.order?.order_type === 'dine_in' ? ` • Table ${bill.order?.table?.table_number}` : ' • Takeaway'}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>₹{bill.grand_total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Bill #{bill.bill_number}</span>
                  <span>Waiter: {bill.order?.waiter?.full_name}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {new Date(bill.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Invoice Panel */}
      <div className="invoice-panel">
        {!selectedBill ? (
           <div className="empty-state" style={{ height: '100%' }}>
             <MdReceiptLong size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
             <div className="empty-state-title">Select a bill to process</div>
           </div>
        ) : (
          <>
            <div className="invoice-panel-head">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Invoice #{selectedBill.bill_number}</h3>
                <span className="badge badge-pending">PENDING</span>
              </div>
              <div className="text-sm text-muted" style={{ marginTop: '0.25rem' }}>
                Order #{selectedBill.order?.order_number} • Waiter: {selectedBill.order?.waiter?.full_name}
              </div>
            </div>
            
            <div className="invoice-panel-body">
              {/* Items */}
              <div style={{ marginBottom: '1.5rem' }}>
                {selectedBill.order?.order_items?.filter(i => i.status !== 'cancelled').map(item => (
                  <div key={item.id} className="invoice-line">
                    <span>{item.menu_item?.name} <span className="text-muted">×{item.quantity}</span></span>
                    <span>₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              
              {/* Totals */}
              <div className="invoice-line subtotal-row">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              
              <div className="invoice-line discount-row" style={{ alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Discount 
                  <select 
                    className="form-select" 
                    style={{ width: '80px', padding: '0.2rem 0.5rem', fontSize: '0.8rem', height: 'auto', backgroundPosition: 'right 0.3rem center' }}
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                    <option value={15}>15%</option>
                    <option value={20}>20%</option>
                    <option value={100}>100%</option>
                  </select>
                </span>
                <span>- ₹{discountAmount.toFixed(2)}</span>
              </div>
              
              {recalculatedTaxes.map(tax => (
                <div key={tax.name} className="invoice-line tax-row">
                  <span>{tax.name} @ {tax.rate}%</span>
                  <span>₹{tax.amount.toFixed(2)}</span>
                </div>
              ))}
              
              <div className="invoice-line total">
                <span>GRAND TOTAL</span>
                <span style={{ color: 'var(--accent)' }}>₹{grandTotal.toFixed(2)}</span>
              </div>
              
              {/* QR Code for UPI */}
              {paymentMethod === 'upi' && grandTotal > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '2rem', padding: '1rem', background: 'white', borderRadius: 'var(--radius-md)', width: 'fit-content', margin: '2rem auto 0' }}>
                  <QRCodeCanvas value={upiUrl} size={150} level="M" />
                  <span style={{ color: '#000', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.5rem' }}>Scan to Pay ₹{grandTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
            
            <div className="invoice-panel-foot">
              <div className="payment-methods">
                <button className={`pay-method-btn ${paymentMethod === 'cash' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cash')}>
                  <MdMoney className="icon" /> Cash
                </button>
                <button className={`pay-method-btn ${paymentMethod === 'upi' ? 'selected' : ''}`} onClick={() => setPaymentMethod('upi')}>
                  <MdQrCode className="icon" /> UPI / QR
                </button>
                <button className={`pay-method-btn ${paymentMethod === 'card' ? 'selected' : ''}`} onClick={() => setPaymentMethod('card')}>
                  <MdCreditCard className="icon" /> Card
                </button>
                <button className={`pay-method-btn ${paymentMethod === 'split' ? 'selected' : ''}`} onClick={() => setPaymentMethod('split')}>
                  <MdRestaurantMenu className="icon" /> Split
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrint}>
                  <MdPrint /> Print
                </button>
                <button 
                  className="btn btn-success" 
                  style={{ flex: 2 }} 
                  onClick={markPaid}
                  disabled={processing}
                >
                  {processing ? <span className="spinner" style={{width:16,height:16}}/> : <><MdCheckCircle /> Mark as Paid</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hidden Print Receipt Template */}
      {selectedBill && (
        <div id="print-invoice" className="no-print print-invoice" style={{ display: 'none' }}>
           <div style={{ textAlign: 'center', marginBottom: '10px' }}>
             <h2 style={{ margin: 0 }}>KITCHAIN CAFE</h2>
             <div style={{ fontSize: '11px' }}>123, MG Road, Bangalore</div>
             <div style={{ fontSize: '11px' }}>GSTIN: 27XXXXX1234Z5</div>
             <div style={{ fontSize: '11px' }}>Ph: +91 98765 43210</div>
           </div>
           
           <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', margin: '10px 0', fontSize: '11px' }}>
             <div>Invoice No : #{selectedBill.bill_number}</div>
             <div>Date       : {new Date().toLocaleString()}</div>
             <div>Table      : {selectedBill.order?.table?.table_number || 'Takeaway'}</div>
             <div>Waiter     : {selectedBill.order?.waiter?.full_name}</div>
           </div>
           
           <table style={{ width: '100%', fontSize: '11px', marginBottom: '10px' }}>
             <tbody>
               {selectedBill.order?.order_items?.filter(i => i.status !== 'cancelled').map(item => (
                 <tr key={item.id}>
                   <td>{item.menu_item?.name} x{item.quantity}</td>
                   <td style={{ textAlign: 'right' }}>{(item.unit_price * item.quantity).toFixed(2)}</td>
                 </tr>
               ))}
             </tbody>
           </table>
           
           <div style={{ borderTop: '1px dashed #000', paddingTop: '5px', fontSize: '11px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span>Subtotal</span>
               <span>{subtotal.toFixed(2)}</span>
             </div>
             {discountAmount > 0 && (
               <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <span>Discount ({discountPercent}%)</span>
                 <span>-{discountAmount.toFixed(2)}</span>
               </div>
             )}
             <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span>Taxable Amount</span>
               <span>{taxableAmount.toFixed(2)}</span>
             </div>
             {recalculatedTaxes.map(tax => (
               <div key={tax.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                 <span>{tax.name} @ {tax.rate}%</span>
                 <span>{tax.amount.toFixed(2)}</span>
               </div>
             ))}
           </div>
           
           <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', margin: '10px 0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
             <span>GRAND TOTAL</span>
             <span>{grandTotal.toFixed(2)}</span>
           </div>
           
           <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '10px' }}>
             <div>Paid via: {paymentMethod.toUpperCase()}</div>
             <div style={{ marginTop: '5px' }}>Thank you, visit again!</div>
             <div style={{ marginTop: '2px' }}>Powered by KitChain</div>
           </div>
        </div>
      )}
      
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-invoice, #print-invoice * { visibility: visible; }
          #print-invoice { 
            display: block !important;
            position: absolute; 
            left: 0; top: 0; 
            width: 80mm; /* Standard thermal printer width */
            padding: 5px;
          }
        }
      `}</style>
    </div>
  )
}
