import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { 
  MdRestaurantMenu, MdAdd, MdEdit, MdDelete, 
  MdSearch, MdCheck, MdClose, MdLayers,
  MdRadioButtonChecked
} from 'react-icons/md'

export default function Menu() {
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems]     = useState([])
  const [activeTab, setActiveTab]     = useState('items') // 'items' | 'categories'
  const [loading, setLoading]         = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCatFilter, setSelectedCatFilter] = useState('all')

  // Modals state
  const [showItemModal, setShowItemModal] = useState(false)
  const [currentItem, setCurrentItem]     = useState(null) // null = Add, object = Edit
  const [showCatModal, setShowCatModal]   = useState(false)
  const [currentCat, setCurrentCat]       = useState(null)   // null = Add, object = Edit

  // Form states for Item
  const [itemName, setItemName]           = useState('')
  const [itemPrice, setItemPrice]         = useState('')
  const [itemDesc, setItemDesc]           = useState('')
  const [itemCategoryId, setItemCategoryId] = useState('')
  const [itemIsVeg, setItemIsVeg]         = useState(true)
  const [itemIsAvailable, setItemIsAvailable] = useState(true)
  const [itemPrepTime, setItemPrepTime]   = useState('')
  const [itemTags, setItemTags]           = useState('')

  // Form states for Category
  const [catName, setCatName]             = useState('')
  const [catDesc, setCatDesc]             = useState('')
  const [catSortOrder, setCatSortOrder]   = useState('0')
  const [catIsActive, setCatIsActive]     = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const { data: cats, error: catErr } = await supabase
        .from('menu_categories')
        .select('*')
        .order('sort_order', { ascending: true })
      if (catErr) throw catErr
      setCategories(cats || [])

      const { data: items, error: itemErr } = await supabase
        .from('menu_items')
        .select('*, category:menu_categories(name)')
        .order('name', { ascending: true })
      if (itemErr) throw itemErr
      setMenuItems(items || [])
    } catch (err) {
      toast.error('Failed to load menu data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Quick toggle availability
  async function toggleAvailability(item) {
    const nextVal = !item.is_available
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: nextVal })
      .eq('id', item.id)

    if (error) {
      toast.error('Failed to update availability')
    } else {
      toast.success(`${item.name} is now ${nextVal ? 'Available' : 'Unavailable'}`)
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: nextVal } : i))
    }
  }

  // Quick toggle category active
  async function toggleCategoryActive(cat) {
    const nextVal = !cat.is_active
    const { error } = await supabase
      .from('menu_categories')
      .update({ is_active: nextVal })
      .eq('id', cat.id)

    if (error) {
      toast.error('Failed to update category status')
    } else {
      toast.success(`Category ${cat.name} is now ${nextVal ? 'Active' : 'Inactive'}`)
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: nextVal } : c))
    }
  }

  // Item Add/Edit submit
  async function handleItemSubmit(e) {
    e.preventDefault()
    if (!itemName || !itemPrice || !itemCategoryId) {
      return toast.error('Please fill in required fields')
    }

    const payload = {
      name: itemName,
      price: parseFloat(itemPrice),
      description: itemDesc || null,
      category_id: itemCategoryId,
      is_veg: itemIsVeg,
      is_available: itemIsAvailable,
      prep_time_min: itemPrepTime ? parseInt(itemPrepTime) : null,
      tags: itemTags ? itemTags.split(',').map(t => t.trim()).filter(Boolean) : []
    }

    try {
      if (currentItem) {
        // Edit
        const { error } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', currentItem.id)
        if (error) throw error
        toast.success('Menu item updated')
      } else {
        // Add
        const { error } = await supabase
          .from('menu_items')
          .insert(payload)
        if (error) throw error
        toast.success('Menu item added')
      }
      setShowItemModal(false)
      loadData()
    } catch (err) {
      toast.error(err.message || 'Operation failed')
    }
  }

  // Category Add/Edit submit
  async function handleCatSubmit(e) {
    e.preventDefault()
    if (!catName) return toast.error('Category Name is required')

    const payload = {
      name: catName,
      description: catDesc || null,
      sort_order: parseInt(catSortOrder) || 0,
      is_active: catIsActive
    }

    try {
      if (currentCat) {
        const { error } = await supabase
          .from('menu_categories')
          .update(payload)
          .eq('id', currentCat.id)
        if (error) throw error
        toast.success('Category updated')
      } else {
        const { error } = await supabase
          .from('menu_categories')
          .insert(payload)
        if (error) throw error
        toast.success('Category added')
      }
      setShowCatModal(false)
      loadData()
    } catch (err) {
      toast.error(err.message || 'Operation failed')
    }
  }

  // Delete item
  async function deleteItem(id, name) {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', id)
      if (error) throw error
      toast.success('Item deleted successfully')
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to delete item')
    }
  }

  // Delete Category
  async function deleteCategory(id, name) {
    if (!window.confirm(`Are you sure you want to delete category "${name}"? Warning: Dishes under this category will need update.`)) return
    try {
      const { error } = await supabase.from('menu_categories').delete().eq('id', id)
      if (error) throw error
      toast.success('Category deleted successfully')
      loadData()
    } catch (err) {
      toast.error('Could not delete category. Make sure no menu items refer to it first.')
    }
  }

  // Open Item Modal
  function openItemModal(item = null) {
    setCurrentItem(item)
    if (item) {
      setItemName(item.name)
      setItemPrice(item.price.toString())
      setItemDesc(item.description || '')
      setItemCategoryId(item.category_id)
      setItemIsVeg(item.is_veg)
      setItemIsAvailable(item.is_available)
      setItemPrepTime(item.prep_time_min ? item.prep_time_min.toString() : '')
      setItemTags(item.tags ? item.tags.join(', ') : '')
    } else {
      setItemName('')
      setItemPrice('')
      setItemDesc('')
      setItemCategoryId(categories[0]?.id || '')
      setItemIsVeg(true)
      setItemIsAvailable(true)
      setItemPrepTime('')
      setItemTags('')
    }
    setShowItemModal(true)
  }

  // Open Category Modal
  function openCatModal(cat = null) {
    setCurrentCat(cat)
    if (cat) {
      setCatName(cat.name)
      setCatDesc(cat.description || '')
      setCatSortOrder(cat.sort_order.toString())
      setCatIsActive(cat.is_active)
    } else {
      setCatName('')
      setCatDesc('')
      setCatSortOrder((categories.length + 1).toString())
      setCatIsActive(true)
    }
    setShowCatModal(true)
  }

  // Filters
  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCat = selectedCatFilter === 'all' || item.category_id === selectedCatFilter
    return matchesSearch && matchesCat
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: '3rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Menu Management</h2>
          <p className="text-secondary text-sm">Organize categories and customize dishes</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {activeTab === 'items' ? (
            <button className="btn btn-primary" onClick={() => openItemModal(null)}>
              <MdAdd /> Add Dish
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => openCatModal(null)}>
              <MdAdd /> Add Category
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="category-tabs" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`cat-tab ${activeTab === 'items' ? 'active' : ''}`}
          onClick={() => setActiveTab('items')}
        >
          <MdRestaurantMenu style={{ marginRight: '0.5rem' }} /> Dishes ({menuItems.length})
        </button>
        <button 
          className={`cat-tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          <MdLayers style={{ marginRight: '0.5rem' }} /> Categories ({categories.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '5rem 0', textAlign: 'center' }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {/* TAB 1: DISHES */}
          {activeTab === 'items' && (
            <div>
              {/* Filters Bar */}
              <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <MdSearch size={18} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search dishes..."
                    className="form-input"
                    style={{ paddingLeft: '2.25rem' }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '200px' }}>
                  <label className="text-secondary text-xs" style={{ whiteSpace: 'nowrap' }}>Category:</label>
                  <select 
                    className="form-select"
                    value={selectedCatFilter}
                    onChange={e => setSelectedCatFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Grid */}
              {filteredItems.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                  <div className="empty-state-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍽</div>
                  <h4 style={{ color: 'var(--text-secondary)' }}>No dishes found</h4>
                  <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>Try clearing filters or add a new dish.</p>
                </div>
              ) : (
                <div className="menu-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {filteredItems.map(item => (
                    <div 
                      key={item.id} 
                      className={`card ${!item.is_available ? 'unavailable' : ''}`}
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        border: '1px solid var(--border)',
                        padding: '1.25rem',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        position: 'relative'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span className={`menu-item-veg ${item.is_veg ? 'veg' : 'non-veg'}`} />
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {item.tags?.map(t => (
                              <span key={t} className="badge badge-secondary" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>{t}</span>
                            ))}
                          </div>
                        </div>

                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>{item.name}</h3>
                        <p className="text-xs text-muted" style={{ marginBottom: '0.5rem' }}>{item.category?.name}</p>
                        <p className="text-sm text-secondary" style={{ 
                          height: '2.5rem', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          display: '-webkit-box', 
                          WebkitLineBreak: '3',
                          WebkitBoxOrient: 'vertical',
                          marginBottom: '1rem'
                        }}>
                          {item.description || 'No description provided.'}
                        </p>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.2rem' }}>₹{item.price.toFixed(2)}</span>
                          {item.prep_time_min && (
                            <span className="text-xs text-muted">{item.prep_time_min} mins prep</span>
                          )}
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input 
                              type="checkbox"
                              checked={item.is_available} 
                              onChange={() => toggleAvailability(item)}
                              style={{ display: 'none' }}
                            />
                            <span style={{ 
                              width: '10px', 
                              height: '10px', 
                              borderRadius: '50%', 
                              backgroundColor: item.is_available ? 'var(--success)' : 'var(--danger)',
                              display: 'inline-block'
                            }} />
                            {item.is_available ? 'In Stock' : 'Out of Stock'}
                          </label>

                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }} onClick={() => openItemModal(item)}>
                              <MdEdit size={16} />
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '0.4rem', color: 'var(--danger)' }} onClick={() => deleteItem(item.id, item.name)}>
                              <MdDelete size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Sort Order</th>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Category Name</th>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Description</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No categories added yet.
                        </td>
                      </tr>
                    ) : (
                      categories.map(cat => (
                        <tr key={cat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--accent)' }}>
                            #{cat.sort_order}
                          </td>
                          <td style={{ padding: '1rem', fontWeight: 500 }}>
                            {cat.name}
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            {cat.description || '-'}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <button 
                              className={`badge badge-${cat.is_active ? 'success' : 'secondary'}`}
                              onClick={() => toggleCategoryActive(cat)}
                              style={{ border: 'none', cursor: 'pointer' }}
                            >
                              {cat.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openCatModal(cat)}>
                                <MdEdit /> Edit
                              </button>
                              <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteCategory(cat.id, cat.name)}>
                                <MdDelete /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* DISH FORM MODAL */}
      {showItemModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '550px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3>{currentItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
              <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setShowItemModal(false)}>
                <MdClose size={24} />
              </button>
            </div>
            
            <form onSubmit={handleItemSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Dish Name *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={itemName} 
                    onChange={e => setItemName(e.target.value)}
                    placeholder="e.g., Penne Arrabiata"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (₹) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    required 
                    value={itemPrice} 
                    onChange={e => setItemPrice(e.target.value)}
                    placeholder="e.g., 299.00"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select 
                    className="form-select" 
                    value={itemCategoryId} 
                    onChange={e => setItemCategoryId(e.target.value)}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Prep Time (mins)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={itemPrepTime} 
                    onChange={e => setItemPrepTime(e.target.value)}
                    placeholder="e.g., 15"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Description</label>
                <textarea 
                  className="form-input" 
                  rows="2"
                  value={itemDesc} 
                  onChange={e => setItemDesc(e.target.value)}
                  placeholder="Short description of ingredients or allergy warnings..."
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Tags (comma separated)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={itemTags} 
                  onChange={e => setItemTags(e.target.value)}
                  placeholder="e.g., spicy, bestseller, chef_special"
                />
              </div>

              <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', background: 'var(--bg-raised)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={itemIsVeg} 
                    onChange={e => setItemIsVeg(e.target.checked)}
                  />
                  Is Vegetarian
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={itemIsAvailable} 
                    onChange={e => setItemIsAvailable(e.target.checked)}
                  />
                  Available (In Stock)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowItemModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Dish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY FORM MODAL */}
      {showCatModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '450px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3>{currentCat ? 'Edit Category' : 'Add New Category'}</h3>
              <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setShowCatModal(false)}>
                <MdClose size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCatSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Category Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  value={catName} 
                  onChange={e => setCatName(e.target.value)}
                  placeholder="e.g., Mocktails"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Sort Order (number)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={catSortOrder} 
                  onChange={e => setCatSortOrder(e.target.value)}
                  placeholder="e.g., 5"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Description</label>
                <textarea 
                  className="form-input" 
                  rows="2"
                  value={catDesc} 
                  onChange={e => setCatDesc(e.target.value)}
                  placeholder="Optional category description..."
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={catIsActive} 
                    onChange={e => setCatIsActive(e.target.checked)}
                  />
                  Active Category (shown in order builder)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
