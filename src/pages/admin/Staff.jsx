import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { MdCheck, MdBlock, MdPerson, MdRefresh } from 'react-icons/md'

export default function Staff() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'active'

  async function loadProfiles() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) toast.error('Failed to load staff')
    else setProfiles(data || [])
    
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const pendingUsers = profiles.filter(p => !p.is_active)
  const activeUsers  = profiles.filter(p => p.is_active)
  const displayUsers = activeTab === 'pending' ? pendingUsers : activeUsers

  async function updateProfileStatus(id, newStatus, newRole) {
    const patch = { is_active: newStatus }
    if (newRole) patch.role = newRole

    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)

    if (error) {
      toast.error('Failed to update user')
    } else {
      toast.success(newStatus ? 'User approved!' : 'Access revoked')
      loadProfiles()
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Are you sure you want to permanently delete this user?')) return
    
    // Call our secure postgres function to delete from auth.users
    const { error } = await supabase.rpc('delete_employee', { target_id: id })
    if (error) {
      toast.error('Failed to delete user: ' + error.message)
    } else {
      toast.success('User permanently deleted')
      loadProfiles()
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2>Staff Management</h2>
          <p className="text-secondary text-sm">Approve new signups and manage roles</p>
        </div>
        <button className="btn btn-ghost" onClick={loadProfiles}>
          <MdRefresh /> Refresh
        </button>
      </div>

      <div className="category-tabs" style={{ marginBottom: '1.5rem' }}>
        <button 
          className={`cat-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Approval
          {pendingUsers.length > 0 && (
            <span className="badge badge-queued" style={{ marginLeft: '0.5rem' }}>{pendingUsers.length}</span>
          )}
        </button>
        <button 
          className={`cat-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active Staff
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="empty-state" style={{ padding: '4rem 2rem' }}>
            <MdPerson size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <div className="empty-state-title">
              {activeTab === 'pending' ? 'No pending approvals' : 'No active staff found'}
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>Name</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>Joined</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>Role</th>
                  <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayUsers.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 500 }}>{user.full_name}</div>
                      <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>ID: {user.id.slice(0, 8)}...</div>
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {activeTab === 'pending' ? (
                        <select 
                          className="form-select" 
                          style={{ fontSize: '0.85rem', padding: '0.4rem' }}
                          id={`role-select-${user.id}`}
                          defaultValue="waiter"
                        >
                          <option value="waiter">Waiter</option>
                          <option value="kitchen_staff">Kitchen Staff</option>
                          <option value="cashier">Cashier</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`badge badge-${user.role === 'admin' ? 'info' : 'secondary'}`}>
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      {activeTab === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => deleteUser(user.id)}
                          >
                            <MdBlock /> Delete
                          </button>
                          <button 
                            className="btn btn-success btn-sm"
                            onClick={() => {
                              const select = document.getElementById(`role-select-${user.id}`)
                              updateProfileStatus(user.id, true, select.value)
                            }}
                          >
                            <MdCheck /> Approve
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => updateProfileStatus(user.id, false)}
                          disabled={user.role === 'admin'} // basic safety to not lock yourself out immediately
                        >
                          <MdBlock /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
