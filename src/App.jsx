import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute, ROLE_HOME } from './components/shared/ProtectedRoute'
import { useAuth } from './context/AuthContext'

// Pages
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import Pending from './pages/auth/Pending'
import Dashboard from './pages/admin/Dashboard'
import Staff from './pages/admin/Staff'
import TableMap from './pages/waiter/TableMap'
import OrderBuilder from './pages/waiter/OrderBuilder'
import KDSBoard from './pages/kitchen/KDSBoard'
import POSScreen from './pages/cashier/POSScreen'

// Placeholder components for pages we haven't built yet
const Placeholder = ({ title }) => (
  <div className="empty-state" style={{ height: '50vh' }}>
    <div className="empty-state-icon">🚧</div>
    <div className="empty-state-title">{title}</div>
    <p className="text-muted text-sm">This module is under construction.</p>
  </div>
)

export default function App() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return <div className="full-loader"><span className="spinner spinner-lg" /></div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={ROLE_HOME[profile?.role] || '/waiter/tables'} replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to={ROLE_HOME[profile?.role] || '/waiter/tables'} replace /> : <Signup />} />
        <Route path="/pending" element={<Pending />} />
        
        {/* Protected App Routes */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          
          {/* Admin Routes */}
          <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><Dashboard /></ProtectedRoute>} />
          <Route path="/admin/tables" element={<ProtectedRoute allowedRoles={['admin']}><TableMap /></ProtectedRoute>} />
          <Route path="/admin/menu" element={<ProtectedRoute allowedRoles={['admin']}><Placeholder title="Menu Management" /></ProtectedRoute>} />
          <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={['admin']}><Placeholder title="Inventory" /></ProtectedRoute>} />
          <Route path="/admin/staff" element={<ProtectedRoute allowedRoles={['admin']}><Staff /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute allowedRoles={['admin']}><Placeholder title="Order History" /></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute allowedRoles={['admin']}><Placeholder title="Audit Logs" /></ProtectedRoute>} />
          
          {/* Waiter Routes */}
          <Route path="/waiter/tables" element={<ProtectedRoute allowedRoles={['admin', 'waiter']}><TableMap /></ProtectedRoute>} />
          <Route path="/waiter/order/:tableId?" element={<ProtectedRoute allowedRoles={['admin', 'waiter']}><OrderBuilder /></ProtectedRoute>} />
          <Route path="/waiter/orders" element={<ProtectedRoute allowedRoles={['admin', 'waiter']}><Placeholder title="My Orders" /></ProtectedRoute>} />
          
          {/* Kitchen Routes */}
          <Route path="/kitchen/kds" element={<ProtectedRoute allowedRoles={['admin', 'kitchen_staff']}><KDSBoard /></ProtectedRoute>} />
          
          {/* Cashier Routes */}
          <Route path="/cashier/pos" element={<ProtectedRoute allowedRoles={['admin', 'cashier']}><POSScreen /></ProtectedRoute>} />
          <Route path="/cashier/inventory" element={<ProtectedRoute allowedRoles={['admin', 'cashier']}><Placeholder title="Inventory Checks" /></ProtectedRoute>} />
          
          {/* Default Route */}
          <Route path="/" element={<Navigate to={user ? (ROLE_HOME[profile?.role] || '/waiter/tables') : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
