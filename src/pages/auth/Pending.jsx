import { useAuth } from '../../context/AuthContext'
import { MdHourglassEmpty, MdLogout } from 'react-icons/md'

export default function Pending() {
  const { signOut } = useAuth()

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--bg-base)',
      padding: '2rem'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '3rem 2rem',
        maxWidth: 420,
        textAlign: 'center',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 1.5rem',
          background: 'rgba(245,158,11,0.15)',
          color: 'var(--warning)',
          borderRadius: '50%',
          display: 'grid', placeItems: 'center'
        }}>
          <MdHourglassEmpty size={32} />
        </div>
        
        <h2 style={{ marginBottom: '1rem' }}>Pending Approval</h2>
        
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>
          Your account has been created successfully, but an administrator needs to approve it and assign your role before you can access the system.
        </p>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>
          Please contact your manager if this takes a while.
        </p>

        <button 
          onClick={signOut}
          className="btn btn-secondary" 
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <MdLogout /> Sign Out
        </button>
      </div>
    </div>
  )
}
