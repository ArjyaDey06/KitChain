import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdPerson } from 'react-icons/md'

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName || !email || !password) return toast.error('Fill in all fields')
    setLoading(true)
    try {
      await signUp(fullName, email, password)
      toast.success('Account created! Pending approval.')
      navigate('/pending', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Signup failed')
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

      {/* Right panel — form */}
      <div style={{
        width: '100%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '2rem',
        flexShrink: 0,
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '2rem',
          width: '100%',
          maxWidth: 420,
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideUp 0.3s ease',
        }}>
          <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.25rem'
            }}>
              <div style={{
                width: 36, height: 36,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', fontSize: '1rem',
              }}>🔗</div>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>KitChain</span>
            </div>
            <h2 style={{ marginBottom: '0.25rem' }}>Create Account</h2>
            <p className="text-secondary text-sm">Join your restaurant's ERP system</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', display: 'flex',
                }}>
                  <MdPerson size={17} />
                </span>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  style={{ paddingLeft: '2.25rem' }}
                  required
                />
              </div>
            </div>

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
                  className="form-input"
                  type="email"
                  placeholder="staff@kitchain.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ paddingLeft: '2.25rem' }}
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
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem' }}
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
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ marginTop: '0.5rem', width: '100%' }}
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing up…</> : 'Sign Up'}
            </button>
          </form>

          <div style={{
            marginTop: '1.5rem', textAlign: 'center',
            fontSize: '0.85rem', color: 'var(--text-secondary)',
          }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
