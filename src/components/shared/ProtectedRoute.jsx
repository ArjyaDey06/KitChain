import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const ROLE_HOME = {
  admin:         '/admin/dashboard',
  waiter:        '/waiter/tables',
  kitchen_staff: '/kitchen/kds',
  cashier:       '/cashier/pos',
}

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="full-loader"><span className="spinner" /></div>
  if (!user)   return <Navigate to="/login" state={{ from: location }} replace />
  if (profile && !profile.is_active) return <Navigate to="/pending" replace />

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    const home = ROLE_HOME[profile.role] || '/login'
    return <Navigate to={home} replace />
  }

  return children
}

export { ROLE_HOME }
