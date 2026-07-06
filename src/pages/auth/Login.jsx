import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md'

const ROLE_HOME = {
  admin:         '/admin/dashboard',
  waiter:        '/waiter/tables',
  kitchen_staff: '/kitchen/kds',
  cashier:       '/cashier/pos',
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const { signIn, profile }     = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return toast.error('Fill in all fields')
    setLoading(true)
    try {
      await signIn(email, password)
      // profile loads async — wait a tick then navigate
      setTimeout(() => {
        const role = profile?.role || 'waiter'
        navigate(ROLE_HOME[role] || '/waiter/tables', { replace: true })
      }, 600)
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      background: 'var(--bg-base)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Ambient blobs */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
        top: '-150px', left: '-150px', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        bottom: '-100px', right: '-100px', pointerEvents: 'none'
      }} />

      {/* Left panel — branding (hidden on mobile) */}
      <div style={{
        flex: '1', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '3rem',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)',
      }} className="login-brand-panel">
        <div style={{ maxWidth: 440 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem'
          }}>
            <div style={{
              width: 48, height: 48,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
              borderRadius: 'var(--radius-lg)', display: 'grid', placeItems: 'center',
              fontSize: '1.4rem', boxShadow: 'var(--glow)',
            }}>🔗</div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em' }}>KitChain</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Restaurant ERP</div>
            </div>
          </div>

          <h1 style={{ marginBottom: '1rem', lineHeight: 1.2 }}>
            Everything happens<br />
            <span style={{ color: 'var(--accent)' }}>realtime.</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: '2rem' }}>
            From the moment a customer sits down to the bill being paid —
            every action across tables, kitchen, and cashier is synced instantly.
          </p>

          {/* Feature list */}
          {[
            '🍽  Table management & order creation',
            '👨‍🍳  Live kitchen display system',
            '💳  Automated billing & GST invoices',
            '📦  Inventory auto-deduction',
            '📊  Analytics dashboard',
          ].map(f => (
            <div key={f} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem',
              borderBottom: '1px solid var(--border)',
            }}>{f}</div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        width: '100%', maxWidth: 460,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '2rem',
        flexShrink: 0,
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideUp 0.3s ease',
        }}>
          <div style={{ marginBottom: '1.75rem' }}>
            {/* Mobile logo (shows when brand panel hidden) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem'
            }} className="mobile-logo">
              <div style={{
                width: 36, height: 36,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', fontSize: '1rem',
              }}>🔗</div>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>KitChain</span>
            </div>
            <h2 style={{ marginBottom: '0.25rem' }}>Welcome back</h2>
            <p className="text-secondary text-sm">Sign in to your staff account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', display: 'flex',
                }}>
                  <MdEmail size={17} />
                </span>
                <input
                  id="login-email"
                  className="form-input"
                  type="email"
                  placeholder="staff@kitchain.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ paddingLeft: '2.25rem' }}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', display: 'flex',
                }}>
                  <MdLock size={17} />
                </span>
                <input
                  id="login-password"
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem' }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  {showPw ? <MdVisibilityOff size={17} /> : <MdVisibility size={17} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ marginTop: '0.5rem', width: '100%' }}
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p style={{
            marginTop: '1.5rem', textAlign: 'center',
            fontSize: '0.85rem', color: 'var(--text-secondary)',
          }}>
            Don't have an account? <Link to="/signup" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign up</Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-brand-panel { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  )
}
