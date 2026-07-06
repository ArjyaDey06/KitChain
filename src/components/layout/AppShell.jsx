import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useAuth } from '../../context/AuthContext'
import {
  MdDashboard, MdTableBar, MdKitchen, MdPointOfSale, MdLocalDining
} from 'react-icons/md'
import { NavLink } from 'react-router-dom'

const PAGE_TITLE = {
  '/admin/dashboard': 'Dashboard',
  '/admin/menu':      'Menu Management',
  '/admin/inventory': 'Inventory',
  '/admin/staff':     'Staff',
  '/admin/audit':     'Audit Logs',
  '/admin/tables':    'Tables',
  '/admin/orders':    'Orders',
  '/waiter/tables':   'Table Map',
  '/waiter/orders':   'My Orders',
  '/kitchen/kds':     'Kitchen Display',
  '/cashier/pos':     'POS / Billing',
  '/cashier/inventory': 'Inventory',
}

const BOTTOM_NAV = {
  admin:         [
    { to: '/admin/dashboard', icon: <MdDashboard />, label: 'Dashboard' },
    { to: '/admin/tables',    icon: <MdTableBar />,  label: 'Tables' },
    { to: '/admin/menu',      icon: <MdLocalDining />, label: 'Menu' },
  ],
  waiter:        [
    { to: '/waiter/tables', icon: <MdTableBar />,    label: 'Tables' },
    { to: '/waiter/orders', icon: <MdLocalDining />, label: 'Orders' },
  ],
  kitchen_staff: [
    { to: '/kitchen/kds', icon: <MdKitchen />, label: 'KDS' },
  ],
  cashier: [
    { to: '/cashier/pos', icon: <MdPointOfSale />, label: 'POS' },
  ],
}

export function AppShell() {
  const [collapsed, setCollapsed]     = useState(false)
  const [mobileOpen, setMobileOpen]   = useState(false)
  const location = useLocation()
  const { profile } = useAuth()
  const title = PAGE_TITLE[location.pathname] || 'KitChain'
  const bottomItems = BOTTOM_NAV[profile?.role] || []

  return (
    <div className="app-shell">
      {/* Sidebar overlay on mobile */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 199, backdropFilter: 'blur(2px)'
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        mobileOpen={mobileOpen}
      />

      <main className={`app-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Topbar
          title={title}
          collapsed={collapsed}
          onMenuClick={() => setMobileOpen(o => !o)}
        />
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {bottomItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
