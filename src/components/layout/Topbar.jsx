import { MdMenu, MdNotifications } from 'react-icons/md'
import { useAuth } from '../../context/AuthContext'

const ROLE_LABEL = {
  admin:         '👑 Admin',
  waiter:        '🍽 Waiter',
  kitchen_staff: '👨‍🍳 Kitchen',
  cashier:       '💳 Cashier',
}

export function Topbar({ title, collapsed, onMenuClick }) {
  const { profile } = useAuth()
  const initials = profile?.full_name
    ?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <header className={`topbar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="topbar-left">
        {/* Mobile hamburger */}
        <button className="btn btn-ghost btn-icon" onClick={onMenuClick} style={{ display: 'none' }}
          id="mob-menu-btn">
          <MdMenu size={20} />
        </button>
        <h1 className="topbar-title" style={{ fontSize: '1rem' }}>{title}</h1>
        <span className="live-dot">LIVE</span>
      </div>

      <div className="topbar-right">
        <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }}>
          <MdNotifications size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{profile?.full_name || 'User'}</div>
            <div className="topbar-role-badge">{ROLE_LABEL[profile?.role] || profile?.role}</div>
          </div>
          <div className="topbar-avatar">{initials}</div>
        </div>
      </div>
    </header>
  )
}
