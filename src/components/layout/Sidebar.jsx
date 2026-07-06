import { useState } from 'react'
import { useLocation, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  MdDashboard, MdRestaurantMenu, MdTableBar, MdReceipt,
  MdInventory2, MdPeople, MdManageHistory, MdRoofing,
  MdChevronLeft, MdChevronRight, MdLogout, MdKitchen,
  MdPointOfSale, MdLocalDining,
} from 'react-icons/md'

const NAV = {
  admin: [
    { section: 'Overview', items: [
      { to: '/admin/dashboard', icon: <MdDashboard />, label: 'Dashboard' },
    ]},
    { section: 'Operations', items: [
      { to: '/admin/tables',    icon: <MdTableBar />,       label: 'Tables' },
      { to: '/admin/orders',    icon: <MdLocalDining />,    label: 'Orders' },
    ]},
    { section: 'Management', items: [
      { to: '/admin/menu',      icon: <MdRestaurantMenu />, label: 'Menu' },
      { to: '/admin/inventory', icon: <MdInventory2 />,     label: 'Inventory' },
      { to: '/admin/staff',     icon: <MdPeople />,         label: 'Staff' },
    ]},
    { section: 'Reports', items: [
      { to: '/admin/audit',     icon: <MdManageHistory />,  label: 'Audit Logs' },
    ]},
  ],
  waiter: [
    { section: 'My Work', items: [
      { to: '/waiter/tables', icon: <MdTableBar />,    label: 'Tables' },
      { to: '/waiter/orders', icon: <MdLocalDining />, label: 'My Orders' },
    ]},
  ],
  kitchen_staff: [
    { section: 'Kitchen', items: [
      { to: '/kitchen/kds', icon: <MdKitchen />, label: 'KDS Board' },
    ]},
  ],
  cashier: [
    { section: 'Cashier', items: [
      { to: '/cashier/pos',      icon: <MdPointOfSale />, label: 'POS / Billing' },
      { to: '/cashier/inventory',icon: <MdInventory2 />,  label: 'Inventory' },
    ]},
  ],
}

export function Sidebar({ collapsed, onToggle, mobileOpen }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role || 'waiter'
  const navSections = NAV[role] || []

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🔗</div>
        <span className="sidebar-logo-text">KitChain</span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navSections.map(sec => (
          <div key={sec.section}>
            <div className="nav-section-label">{sec.section}</div>
            {sec.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-item-icon">{item.icon}</span>
                <span className="nav-item-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="sidebar-collapse-btn" onClick={handleSignOut}>
          <span className="nav-item-icon"><MdLogout /></span>
          <span className="nav-item-label">Sign Out</span>
        </button>
        <button className="sidebar-collapse-btn" onClick={onToggle} style={{ marginTop: '0.25rem' }}>
          <span className="nav-item-icon">
            {collapsed ? <MdChevronRight /> : <MdChevronLeft />}
          </span>
          <span className="nav-item-label">Collapse</span>
        </button>
      </div>
    </aside>
  )
}
