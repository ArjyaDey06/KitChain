import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { 
  MdInventory, MdTrendingUp, MdWarning, 
  MdAdd, MdEdit, MdDelete, MdHistory, 
  MdSettings, MdClose, MdRestaurant, 
  MdSearch, MdCheck, MdAutoAwesome
} from 'react-icons/md'

export default function Inventory() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('stock') // 'stock' | 'log' | 'recipes'
  const [loading, setLoading]     = useState(true)

  // Data states
  const [stockItems, setStockItems]         = useState([])
  const [adjustments, setAdjustments]       = useState([])
  const [menuItems, setMenuItems]           = useState([])
  const [categories, setCategories]         = useState([])
  
  // Search states
  const [stockSearch, setStockSearch]       = useState('')
  const [logSearch, setLogSearch]           = useState('')
  
  // Recipe selection state
  const [selectedMenuItem, setSelectedMenuItem] = useState(null)
  const [recipeIngredients, setRecipeIngredients] = useState([])

  // Modal states
  const [showItemModal, setShowItemModal]   = useState(false)
  const [currentItem, setCurrentItem]       = useState(null) // null = Add, object = Edit
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustItem, setAdjustItem]         = useState(null)

  // Form states for Inventory Item
  const [itemName, setItemName]             = useState('')
  const [itemUnit, setItemUnit]             = useState('grams')
  const [itemLimit, setItemLimit]           = useState('0')
  const [itemCost, setItemCost]             = useState('')
  const [itemSupplier, setItemSupplier]     = useState('')
  const [itemNotes, setItemNotes]           = useState('')

  // Form states for Adjustment
  const [adjustAction, setAdjustAction]     = useState('add') // 'add' | 'remove'
  const [adjustQty, setAdjustQty]           = useState('')
  const [adjustReason, setAdjustReason]     = useState('manual_add')
  const [adjustNotes, setAdjustNotes]       = useState('')

  // Form states for Recipe Mapping
  const [newRecipeIngId, setNewRecipeIngId] = useState('')
  const [newRecipeQty, setNewRecipeQty]     = useState('')

  async function loadStockData() {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      setStockItems(data || [])
    } catch (err) {
      toast.error('Failed to load inventory stock')
      console.error(err)
    }
  }

  async function loadAdjustmentsData() {
    try {
      const { data, error } = await supabase
        .from('inventory_adjustments')
        .select('*, item:inventory_items(name, unit), staff:profiles(full_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setAdjustments(data || [])
    } catch (err) {
      toast.error('Failed to load adjustments log')
      console.error(err)
    }
  }

  async function loadMenuAndCategories() {
    try {
      const { data: cats } = await supabase
        .from('menu_categories')
        .select('*')
        .order('sort_order')
      setCategories(cats || [])

      const { data: items } = await supabase
        .from('menu_items')
        .select('*')
        .order('name')
      setMenuItems(items || [])
    } catch (err) {
      console.error('Failed to load menus', err)
    }
  }

  async function loadRecipe(menuItemId) {
    if (!menuItemId) return
    try {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select('*, ingredient:inventory_items(name, unit)')
        .eq('menu_item_id', menuItemId)
      if (error) throw error
      setRecipeIngredients(data || [])
    } catch (err) {
      toast.error('Failed to load recipe mapping')
      console.error(err)
    }
  }

  async function initModule() {
    setLoading(true)
    await Promise.all([
      loadStockData(),
      loadAdjustmentsData(),
      loadMenuAndCategories()
    ])
    setLoading(false)
  }

  useEffect(() => {
    initModule()
  }, [])

  // Auto load recipe if menu item selection changes
  useEffect(() => {
    if (selectedMenuItem) {
      loadRecipe(selectedMenuItem.id)
    } else {
      setRecipeIngredients([])
    }
  }, [selectedMenuItem])

  // Handle Item form Submit (Add/Edit)
  async function handleItemSubmit(e) {
    e.preventDefault()
    if (!itemName || !itemUnit) return toast.error('Name and Unit are required')

    const payload = {
      name: itemName,
      unit: itemUnit,
      threshold_limit: parseFloat(itemLimit) || 0,
      cost_per_unit: itemCost ? parseFloat(itemCost) : null,
      supplier_name: itemSupplier || null,
      notes: itemNotes || null
    }

    try {
      if (currentItem) {
        const { error } = await supabase
          .from('inventory_items')
          .update(payload)
          .eq('id', currentItem.id)
        if (error) throw error
        toast.success('Inventory item updated')
      } else {
        const { error } = await supabase
          .from('inventory_items')
          .insert({ ...payload, current_stock: 0 }) // Initial stock always 0, populated via adjustment
        if (error) throw error
        toast.success('Inventory item created')
      }
      setShowItemModal(false)
      loadStockData()
    } catch (err) {
      toast.error(err.message || 'Operation failed')
    }
  }

  // Handle Manual Stock Adjustment
  async function handleAdjustmentSubmit(e) {
    e.preventDefault()
    const amt = parseFloat(adjustQty)
    if (isNaN(amt) || amt <= 0) return toast.error('Enter a valid quantity greater than 0')

    const quantityChange = adjustAction === 'add' ? amt : -amt
    const beforeStock = adjustItem.current_stock
    const afterStock = Math.max(0, beforeStock + quantityChange)

    try {
      // 1. Log the adjustment in history
      const { error: logErr } = await supabase
        .from('inventory_adjustments')
        .insert({
          inventory_item_id: adjustItem.id,
          adjusted_by: profile.id,
          reason: adjustReason,
          quantity_change: quantityChange,
          stock_before: beforeStock,
          stock_after: afterStock,
          notes: adjustNotes || null
        })
      if (logErr) throw logErr

      // 2. Update stock count in core table
      const { error: updErr } = await supabase
        .from('inventory_items')
        .update({ current_stock: afterStock })
        .eq('id', adjustItem.id)
      if (updErr) throw updErr

      toast.success('Stock adjusted successfully!')
      setShowAdjustModal(false)
      setAdjustQty('')
      setAdjustNotes('')
      // Reload
      await Promise.all([loadStockData(), loadAdjustmentsData()])
    } catch (err) {
      toast.error(err.message || 'Adjustment failed')
    }
  }

  // Handle Recipe Ingredient Mapping Add
  async function handleAddRecipeIng(e) {
    e.preventDefault()
    if (!selectedMenuItem) return toast.error('Select a menu dish first')
    if (!newRecipeIngId) return toast.error('Select an ingredient')
    const qty = parseFloat(newRecipeQty)
    if (isNaN(qty) || qty <= 0) return toast.error('Quantity must be greater than 0')

    try {
      const { error } = await supabase
        .from('recipe_ingredients')
        .insert({
          menu_item_id: selectedMenuItem.id,
          inventory_item_id: newRecipeIngId,
          quantity_used: qty
        })
      if (error) {
        if (error.code === '23505') {
          throw new Error('This ingredient is already mapped to this dish. Edit or delete the existing mapping.')
        }
        throw error
      }

      toast.success('Ingredient added to recipe')
      setNewRecipeIngId('')
      setNewRecipeQty('')
      loadRecipe(selectedMenuItem.id)
    } catch (err) {
      toast.error(err.message || 'Mapping failed')
    }
  }

  // Remove Recipe Ingredient Mapping
  async function removeRecipeIng(id) {
    if (!window.confirm('Remove this ingredient from the recipe?')) return
    try {
      const { error } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('id', id)
      if (error) throw error
      toast.success('Ingredient removed from recipe')
      loadRecipe(selectedMenuItem.id)
    } catch (err) {
      toast.error('Failed to remove ingredient')
    }
  }

  // Delete inventory item
  async function deleteStockItem(id, name) {
    if (!window.confirm(`Permanently delete "${name}"? Warning: Will fail if mapped in any recipes.`)) return
    try {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id)
      if (error) throw error
      toast.success('Item deleted successfully')
      loadStockData()
    } catch (err) {
      toast.error('Could not delete item. It is likely mapped to a recipe; remove it from all recipes first.')
    }
  }

  // Seed sample abundant inventory, menu, and recipes
  async function seedSampleInventory() {
    if (!window.confirm('This will auto-populate 21 abundant raw materials, menu items, and recipe ingredient mappings into your database. Continue?')) return
    setLoading(true)
    try {
      // 1. Categories
      await supabase.from('menu_categories').upsert([
        { id: 'a1111111-1111-1111-1111-111111111111', name: 'Starters', sort_order: 1 },
        { id: 'a2222222-2222-2222-2222-222222222222', name: 'Main Course', sort_order: 2 },
        { id: 'a3333333-3333-3333-3333-333333333333', name: 'Beverages', sort_order: 3 },
        { id: 'a4444444-4444-4444-4444-444444444444', name: 'Desserts', sort_order: 4 },
        { id: 'a5555555-5555-5555-5555-555555555555', name: 'Combos', sort_order: 5 },
      ], { onConflict: 'id' })

      // 2. Inventory Items
      const sampleStock = [
        { id: 'b0100000-0000-0000-0000-000000000001', name: 'Pizza Flour', unit: 'kg', current_stock: 50.0, threshold_limit: 10.0, cost_per_unit: 45.0, supplier_name: 'Metro WholeSale', notes: 'High-gluten Italian 00 flour' },
        { id: 'b0200000-0000-0000-0000-000000000002', name: 'Mozzarella Cheese', unit: 'kg', current_stock: 25.0, threshold_limit: 5.0, cost_per_unit: 380.0, supplier_name: 'Amul Dairy', notes: 'Shredded mozzarella cheese' },
        { id: 'b0300000-0000-0000-0000-000000000003', name: 'Tomato Pizza Sauce', unit: 'kg', current_stock: 30.0, threshold_limit: 5.0, cost_per_unit: 120.0, supplier_name: 'San Marzano Co', notes: 'Herb tomato pizza base sauce' },
        { id: 'b0400000-0000-0000-0000-000000000004', name: 'Pepperoni Slices', unit: 'kg', current_stock: 10.0, threshold_limit: 2.0, cost_per_unit: 750.0, supplier_name: 'Prasuma Cold Cuts', notes: 'Pork pepperoni slices' },
        { id: 'b0500000-0000-0000-0000-000000000005', name: 'Jalapeños', unit: 'kg', current_stock: 5.0, threshold_limit: 1.0, cost_per_unit: 180.0, supplier_name: 'Del Monte', notes: 'Sliced pickled jalapeños' },
        { id: 'b0600000-0000-0000-0000-000000000006', name: 'Bell Peppers (Capsicum)', unit: 'kg', current_stock: 15.0, threshold_limit: 3.0, cost_per_unit: 60.0, supplier_name: 'Fresh Veggie Farm', notes: 'Mixed green & red capsicum' },
        { id: 'b0700000-0000-0000-0000-000000000007', name: 'Onions', unit: 'kg', current_stock: 30.0, threshold_limit: 5.0, cost_per_unit: 30.0, supplier_name: 'Fresh Veggie Farm', notes: 'Red onions' },
        { id: 'b0800000-0000-0000-0000-000000000008', name: 'Garlic', unit: 'kg', current_stock: 5.0, threshold_limit: 1.0, cost_per_unit: 150.0, supplier_name: 'Fresh Veggie Farm', notes: 'Peeled garlic cloves' },
        { id: 'b0900000-0000-0000-0000-000000000009', name: 'Olive Oil', unit: 'liters', current_stock: 20.0, threshold_limit: 4.0, cost_per_unit: 450.0, supplier_name: 'Borges India', notes: 'Extra virgin olive oil' },
        { id: 'b1000000-0000-0000-0000-000000000010', name: 'Butter', unit: 'kg', current_stock: 12.0, threshold_limit: 2.0, cost_per_unit: 420.0, supplier_name: 'Amul Dairy', notes: 'Unsalted cooking butter' },
        { id: 'b1100000-0000-0000-0000-000000000011', name: 'Espresso Coffee Beans', unit: 'kg', current_stock: 15.0, threshold_limit: 3.0, cost_per_unit: 850.0, supplier_name: 'Blue Tokai Roasters', notes: 'Arabica Dark Roast' },
        { id: 'b1200000-0000-0000-0000-000000000012', name: 'Whole Milk', unit: 'liters', current_stock: 40.0, threshold_limit: 10.0, cost_per_unit: 60.0, supplier_name: 'Mother Dairy', notes: 'Fresh full cream milk' },
        { id: 'b1300000-0000-0000-0000-000000000013', name: 'Sugar', unit: 'kg', current_stock: 25.0, threshold_limit: 5.0, cost_per_unit: 42.0, supplier_name: 'Local Mart', notes: 'Fine refined sugar' },
        { id: 'b1400000-0000-0000-0000-000000000014', name: 'Potatoes (French Fries)', unit: 'kg', current_stock: 40.0, threshold_limit: 8.0, cost_per_unit: 35.0, supplier_name: 'McCain Fresh', notes: 'Cut potato fry sticks' },
        { id: 'b1500000-0000-0000-0000-000000000015', name: 'Chicken Breast', unit: 'kg', current_stock: 20.0, threshold_limit: 5.0, cost_per_unit: 240.0, supplier_name: 'FreshToHome Meat', notes: 'Boneless fresh chicken breast' },
        { id: 'b1600000-0000-0000-0000-000000000016', name: 'Burger Buns', unit: 'pieces', current_stock: 100.0, threshold_limit: 20.0, cost_per_unit: 8.0, supplier_name: 'Britannia Bakery', notes: 'Brioche burger buns' },
        { id: 'b1700000-0000-0000-0000-000000000017', name: 'Paneer (Cottage Cheese)', unit: 'kg', current_stock: 15.0, threshold_limit: 3.0, cost_per_unit: 320.0, supplier_name: 'Amul Dairy', notes: 'Fresh malai paneer blocks' },
        { id: 'b1800000-0000-0000-0000-000000000018', name: 'Penne Pasta', unit: 'kg', current_stock: 25.0, threshold_limit: 5.0, cost_per_unit: 140.0, supplier_name: 'Barilla India', notes: 'Durum wheat penne pasta' },
        { id: 'b1900000-0000-0000-0000-000000000019', name: 'Heavy Cream', unit: 'liters', current_stock: 10.0, threshold_limit: 2.0, cost_per_unit: 220.0, supplier_name: 'Amul Dairy', notes: 'Fresh cooking cream' },
        { id: 'b2000000-0000-0000-0000-000000000020', name: 'Chocolate Fudge Sauce', unit: 'liters', current_stock: 8.0, threshold_limit: 1.5, cost_per_unit: 310.0, supplier_name: 'Hersheys India', notes: 'Rich dark chocolate sauce' },
        { id: 'b2100000-0000-0000-0000-000000000021', name: 'Takeaway Containers', unit: 'pieces', current_stock: 200.0, threshold_limit: 50.0, cost_per_unit: 5.0, supplier_name: 'EcoPack Solutions', notes: 'Biodegradable meal boxes' }
      ]
      await supabase.from('inventory_items').upsert(sampleStock, { onConflict: 'id' })

      // 3. Menu Items
      const sampleMenu = [
        { id: 'c1000000-0000-0000-0000-000000000001', category_id: 'a1111111-1111-1111-1111-111111111111', name: 'Garlic Bread Sticks', price: 149, description: 'Freshly baked bread sticks brushed with butter & fresh garlic', is_veg: true, is_available: true, preparation_time: 10, tags: ['bestseller', 'starter'] },
        { id: 'c2000000-0000-0000-0000-000000000002', category_id: 'a1111111-1111-1111-1111-111111111111', name: 'Crispy French Fries', price: 119, description: 'Golden fried salted potato fries served with dip', is_veg: true, is_available: true, preparation_time: 8, tags: ['quick', 'snack'] },
        { id: 'c3000000-0000-0000-0000-000000000003', category_id: 'a1111111-1111-1111-1111-111111111111', name: 'Paneer Tikka Skewers', price: 229, description: 'Char-grilled marinated paneer cubes with peppers & onions', is_veg: true, is_available: true, preparation_time: 15, tags: ['tandoori', 'chef_special'] },
        { id: 'c4000000-0000-0000-0000-000000000004', category_id: 'a2222222-2222-2222-2222-222222222222', name: 'Classic Margherita Pizza', price: 299, description: 'Italian tomato sauce, mozzarella cheese, and fresh basil', is_veg: true, is_available: true, preparation_time: 15, tags: ['classic', 'pizza'] },
        { id: 'c5000000-0000-0000-0000-000000000005', category_id: 'a2222222-2222-2222-2222-222222222222', name: 'Loaded Pepperoni Pizza', price: 449, description: 'Crispy pepperoni slices loaded with mozzarella cheese', is_veg: false, is_available: true, preparation_time: 18, tags: ['non_veg', 'popular'] },
        { id: 'c6000000-0000-0000-0000-000000000006', category_id: 'a2222222-2222-2222-2222-222222222222', name: 'Creamy Alfredo Penne', price: 279, description: 'Penne pasta tossed in rich butter cream & parmesan sauce', is_veg: true, is_available: true, preparation_time: 12, tags: ['pasta', 'creamy'] },
        { id: 'c7000000-0000-0000-0000-000000000007', category_id: 'a2222222-2222-2222-2222-222222222222', name: 'Grilled Chicken Burger', price: 249, description: 'Juicy grilled chicken breast patty with brioche bun', is_veg: false, is_available: true, preparation_time: 12, tags: ['burger', 'non_veg'] },
        { id: 'c8000000-0000-0000-0000-000000000008', category_id: 'a3333333-3333-3333-3333-333333333333', name: 'Creamy Cold Coffee', price: 149, description: 'Chilled blended espresso with fresh milk & chocolate drizzle', is_veg: true, is_available: true, preparation_time: 5, tags: ['beverage', 'bestseller'] },
        { id: 'c9000000-0000-0000-0000-000000000009', category_id: 'a4444444-4444-4444-4444-444444444444', name: 'Chocolate Lava Cake', price: 179, description: 'Warm chocolate cake with molten chocolate center', is_veg: true, is_available: true, preparation_time: 8, tags: ['sweet', 'dessert'] }
      ]
      await supabase.from('menu_items').upsert(sampleMenu, { onConflict: 'id' })

      // 4. Recipes
      const sampleRecipes = [
        { menu_item_id: 'c4000000-0000-0000-0000-000000000004', inventory_item_id: 'b0100000-0000-0000-0000-000000000001', quantity_used: 0.2 },
        { menu_item_id: 'c4000000-0000-0000-0000-000000000004', inventory_item_id: 'b0200000-0000-0000-0000-000000000002', quantity_used: 0.15 },
        { menu_item_id: 'c4000000-0000-0000-0000-000000000004', inventory_item_id: 'b0300000-0000-0000-0000-000000000003', quantity_used: 0.1 },
        { menu_item_id: 'c4000000-0000-0000-0000-000000000004', inventory_item_id: 'b0900000-0000-0000-0000-000000000009', quantity_used: 0.01 },

        { menu_item_id: 'c5000000-0000-0000-0000-000000000005', inventory_item_id: 'b0100000-0000-0000-0000-000000000001', quantity_used: 0.2 },
        { menu_item_id: 'c5000000-0000-0000-0000-000000000005', inventory_item_id: 'b0200000-0000-0000-0000-000000000002', quantity_used: 0.18 },
        { menu_item_id: 'c5000000-0000-0000-0000-000000000005', inventory_item_id: 'b0300000-0000-0000-0000-000000000003', quantity_used: 0.1 },
        { menu_item_id: 'c5000000-0000-0000-0000-000000000005', inventory_item_id: 'b0400000-0000-0000-0000-000000000004', quantity_used: 0.1 },
        { menu_item_id: 'c5000000-0000-0000-0000-000000000005', inventory_item_id: 'b0500000-0000-0000-0000-000000000005', quantity_used: 0.02 },

        { menu_item_id: 'c1000000-0000-0000-0000-000000000001', inventory_item_id: 'b0100000-0000-0000-0000-000000000001', quantity_used: 0.15 },
        { menu_item_id: 'c1000000-0000-0000-0000-000000000001', inventory_item_id: 'b1000000-0000-0000-0000-000000000010', quantity_used: 0.05 },
        { menu_item_id: 'c1000000-0000-0000-0000-000000000001', inventory_item_id: 'b0800000-0000-0000-0000-000000000008', quantity_used: 0.02 },
        { menu_item_id: 'c1000000-0000-0000-0000-000000000001', inventory_item_id: 'b0200000-0000-0000-0000-000000000002', quantity_used: 0.05 },

        { menu_item_id: 'c2000000-0000-0000-0000-000000000002', inventory_item_id: 'b1400000-0000-0000-0000-000000000014', quantity_used: 0.25 },
        { menu_item_id: 'c2000000-0000-0000-0000-000000000002', inventory_item_id: 'b1000000-0000-0000-0000-000000000010', quantity_used: 0.02 },

        { menu_item_id: 'c6000000-0000-0000-0000-000000000006', inventory_item_id: 'b1800000-0000-0000-0000-000000000018', quantity_used: 0.15 },
        { menu_item_id: 'c6000000-0000-0000-0000-000000000006', inventory_item_id: 'b1900000-0000-0000-0000-000000000019', quantity_used: 0.08 },
        { menu_item_id: 'c6000000-0000-0000-0000-000000000006', inventory_item_id: 'b1000000-0000-0000-0000-000000000010', quantity_used: 0.03 },
        { menu_item_id: 'c6000000-0000-0000-0000-000000000006', inventory_item_id: 'b0200000-0000-0000-0000-000000000002', quantity_used: 0.04 },

        { menu_item_id: 'c7000000-0000-0000-0000-000000000007', inventory_item_id: 'b1600000-0000-0000-0000-000000000016', quantity_used: 1.0 },
        { menu_item_id: 'c7000000-0000-0000-0000-000000000007', inventory_item_id: 'b1500000-0000-0000-0000-000000000015', quantity_used: 0.18 },
        { menu_item_id: 'c7000000-0000-0000-0000-000000000007', inventory_item_id: 'b0700000-0000-0000-0000-000000000007', quantity_used: 0.02 },
        { menu_item_id: 'c7000000-0000-0000-0000-000000000007', inventory_item_id: 'b0600000-0000-0000-0000-000000000006', quantity_used: 0.02 },

        { menu_item_id: 'c8000000-0000-0000-0000-000000000008', inventory_item_id: 'b1100000-0000-0000-0000-000000000011', quantity_used: 0.02 },
        { menu_item_id: 'c8000000-0000-0000-0000-000000000008', inventory_item_id: 'b1200000-0000-0000-0000-000000000012', quantity_used: 0.25 },
        { menu_item_id: 'c8000000-0000-0000-0000-000000000008', inventory_item_id: 'b1300000-0000-0000-0000-000000000013', quantity_used: 0.02 },
        { menu_item_id: 'c8000000-0000-0000-0000-000000000008', inventory_item_id: 'b2000000-0000-0000-0000-000000000020', quantity_used: 0.01 },

        { menu_item_id: 'c9000000-0000-0000-0000-000000000009', inventory_item_id: 'b2000000-0000-0000-0000-000000000020', quantity_used: 0.05 },
        { menu_item_id: 'c9000000-0000-0000-0000-000000000009', inventory_item_id: 'b1000000-0000-0000-0000-000000000010', quantity_used: 0.03 },
        { menu_item_id: 'c9000000-0000-0000-0000-000000000009', inventory_item_id: 'b1300000-0000-0000-0000-000000000013', quantity_used: 0.02 },
        { menu_item_id: 'c9000000-0000-0000-0000-000000000009', inventory_item_id: 'b0100000-0000-0000-0000-000000000001', quantity_used: 0.03 }
      ]
      await supabase.from('recipe_ingredients').upsert(sampleRecipes, { onConflict: 'menu_item_id,inventory_item_id' })

      toast.success('Successfully seeded abundant inventory, menu items, and recipe mappings!')
      await initModule()
    } catch (err) {
      toast.error('Failed to seed sample data: ' + err.message)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Modal loaders
  function openItemModal(item = null) {
    setCurrentItem(item)
    if (item) {
      setItemName(item.name)
      setItemUnit(item.unit)
      setItemLimit(item.threshold_limit.toString())
      setItemCost(item.cost_per_unit ? item.cost_per_unit.toString() : '')
      setItemSupplier(item.supplier_name || '')
      setItemNotes(item.notes || '')
    } else {
      setItemName('')
      setItemUnit('grams')
      setItemLimit('0')
      setItemCost('')
      setItemSupplier('')
      setItemNotes('')
    }
    setShowItemModal(true)
  }

  function openAdjustModal(item) {
    setAdjustItem(item)
    setAdjustAction('add')
    setAdjustReason('manual_add')
    setAdjustQty('')
    setAdjustNotes('')
    setShowAdjustModal(true)
  }

  // Filters
  const filteredStock = stockItems.filter(item => 
    item.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    (item.supplier_name && item.supplier_name.toLowerCase().includes(stockSearch.toLowerCase()))
  )

  const filteredLogs = adjustments.filter(adj => 
    adj.item?.name.toLowerCase().includes(logSearch.toLowerCase()) ||
    adj.reason.toLowerCase().includes(logSearch.toLowerCase()) ||
    (adj.notes && adj.notes.toLowerCase().includes(logSearch.toLowerCase()))
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: '3rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Inventory Management</h2>
          <p className="text-secondary text-sm">Track ingredients, log adjustments, and map recipe deductions</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {activeTab === 'stock' && (
            <>
              <button className="btn btn-ghost" onClick={seedSampleInventory} style={{ borderColor: 'var(--border)' }}>
                <MdAutoAwesome style={{ color: 'var(--warning)' }} /> Seed Sample Data
              </button>
              <button className="btn btn-primary" onClick={() => openItemModal(null)}>
                <MdAdd /> New Raw Item
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="category-tabs" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`cat-tab ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          <MdInventory style={{ marginRight: '0.5rem' }} /> Stock Levels
        </button>
        <button 
          className={`cat-tab ${activeTab === 'recipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('recipes')}
        >
          <MdRestaurant style={{ marginRight: '0.5rem' }} /> Recipe Mapping
        </button>
        <button 
          className={`cat-tab ${activeTab === 'log' ? 'active' : ''}`}
          onClick={() => setActiveTab('log')}
        >
          <MdHistory style={{ marginRight: '0.5rem' }} /> Adjustments Log
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '5rem 0', textAlign: 'center' }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {/* TAB 1: STOCK LEVELS */}
          {activeTab === 'stock' && (
            <div>
              {/* Search bar */}
              <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <MdSearch size={18} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search stock by name..."
                    className="form-input"
                    style={{ paddingLeft: '2.25rem' }}
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Raw Material</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Current Stock</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Min Alert Threshold</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Cost/Unit</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Supplier</th>
                        <th style={{ padding: '1rem', textAlign: 'center', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📦</div>
                            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>No raw materials found</h4>
                            <p className="text-sm text-muted" style={{ marginBottom: '1.25rem' }}>Your inventory is currently empty. Add items manually or seed sample data to populate 21 ingredients & recipe mappings instantly.</p>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                              <button className="btn btn-primary" onClick={seedSampleInventory}>
                                <MdAutoAwesome /> Seed Sample Inventory & Recipes
                              </button>
                              <button className="btn btn-ghost" onClick={() => openItemModal(null)} style={{ border: '1px solid var(--border)' }}>
                                <MdAdd /> Add Single Item
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredStock.map(item => {
                          const isLowStock = item.current_stock <= item.threshold_limit
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: isLowStock ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                              <td style={{ padding: '1rem' }}>
                                <div style={{ fontWeight: 600 }}>{item.name}</div>
                                {item.notes && <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>{item.notes}</div>}
                              </td>
                              <td style={{ padding: '1rem', fontWeight: 700 }}>
                                <span style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-primary)' }}>
                                  {item.current_stock.toLocaleString()} {item.unit}
                                </span>
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                {item.threshold_limit} {item.unit}
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                {item.cost_per_unit ? `₹${item.cost_per_unit.toFixed(2)}` : '-'}
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                {item.supplier_name || '-'}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'center' }}>
                                {isLowStock ? (
                                  <span className="badge badge-preparing" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <MdWarning /> Low Stock
                                  </span>
                                ) : (
                                  <span className="badge badge-ready">OK</span>
                                )}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                  <button className="btn btn-primary btn-sm" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => openAdjustModal(item)}>
                                    Adjust Stock
                                  </button>
                                  <button className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }} onClick={() => openItemModal(item)}>
                                    <MdEdit size={16} />
                                  </button>
                                  <button className="btn btn-secondary btn-sm" style={{ padding: '0.4rem', color: 'var(--danger)' }} onClick={() => deleteStockItem(item.id, item.name)}>
                                    <MdDelete size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RECIPE MAPPING */}
          {activeTab === 'recipes' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
              
              {/* Menu items sidebar */}
              <div className="card" style={{ padding: '1rem', height: 'fit-content' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Select Dish</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '550px', overflowY: 'auto' }}>
                  {categories.map(cat => {
                    const catItems = menuItems.filter(item => item.category_id === cat.id)
                    if (!catItems.length) return null
                    return (
                      <div key={cat.id} style={{ marginBottom: '0.75rem' }}>
                        <div className="text-secondary text-xs" style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem', paddingLeft: '0.5rem' }}>
                          {cat.name}
                        </div>
                        {catItems.map(item => (
                          <button
                            key={item.id}
                            className={`btn btn-ghost`}
                            style={{ 
                              width: '100%', 
                              textAlign: 'left', 
                              justifyContent: 'flex-start',
                              fontSize: '0.85rem',
                              padding: '0.5rem 0.75rem',
                              background: selectedMenuItem?.id === item.id ? 'var(--bg-raised)' : 'transparent',
                              borderLeft: selectedMenuItem?.id === item.id ? '3px solid var(--accent)' : '3px solid transparent',
                              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0'
                            }}
                            onClick={() => setSelectedMenuItem(item)}
                          >
                            <span className={`menu-item-veg ${item.is_veg ? 'veg' : 'non-veg'}`} style={{ marginRight: '0.5rem' }} />
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.name}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Recipe composer workspace */}
              <div className="card" style={{ padding: '1.5rem' }}>
                {selectedMenuItem ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                      <div>
                        <span className="text-xs text-accent" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Recipe Ingredients</span>
                        <h2 style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>{selectedMenuItem.name}</h2>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="text-xs text-muted">Menu Price</span>
                        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)' }}>₹{selectedMenuItem.price.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Mapped Recipe List */}
                    <div style={{ marginBottom: '2rem' }}>
                      <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Current Ingredients Map</h4>
                      {recipeIngredients.length === 0 ? (
                        <div style={{ padding: '2rem', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          No ingredients mapped to this recipe yet. Set ingredients below to enable stock auto-deduction.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {recipeIngredients.map(ri => (
                            <div key={ri.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-raised)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                              <div>
                                <span style={{ fontWeight: 600 }}>{ri.ingredient?.name}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>
                                  {ri.quantity_used} {ri.ingredient?.unit}
                                </span>
                                <button className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--danger)' }} onClick={() => removeRecipeIng(ri.id)}>
                                  <MdDelete size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add Mapping Form */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                      <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Add Ingredient to Recipe</h4>
                      <form onSubmit={handleAddRecipeIng} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 2, minWidth: '200px' }}>
                          <label className="form-label text-xs">Select Raw Material</label>
                          <select 
                            className="form-select"
                            value={newRecipeIngId}
                            onChange={e => setNewRecipeIngId(e.target.value)}
                          >
                            <option value="">-- Choose Ingredient --</option>
                            {stockItems.map(item => (
                              <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                          <label className="form-label text-xs">
                            Qty used per serving {newRecipeIngId && `(${stockItems.find(i => i.id === newRecipeIngId)?.unit})`}
                          </label>
                          <input 
                            type="number" 
                            step="0.0001"
                            placeholder="e.g. 50"
                            className="form-input"
                            value={newRecipeQty}
                            onChange={e => setNewRecipeQty(e.target.value)}
                          />
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ height: '38px', padding: '0 1.5rem' }}>
                          Add
                        </button>
                      </form>
                    </div>

                  </div>
                ) : (
                  <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>
                    <div className="empty-state-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍳</div>
                    <h3 style={{ color: 'var(--text-secondary)' }}>Select a dish from the sidebar</h3>
                    <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>You can map ingredients to dishes to automate inventory deductions on order preparation.</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: ADJUSTMENTS LOG */}
          {activeTab === 'log' && (
            <div>
              {/* Search bar */}
              <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <MdSearch size={18} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search logs..."
                    className="form-input"
                    style={{ paddingLeft: '2.25rem' }}
                    value={logSearch}
                    onChange={e => setLogSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Logs Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Timestamp</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Raw Material</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Change Quantity</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Stock Before → After</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Reason</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Adjusted By</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No adjustments logged yet.
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map(log => {
                          const isPositive = log.quantity_change > 0
                          return (
                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                {new Date(log.created_at).toLocaleString('en-GB')}
                              </td>
                              <td style={{ padding: '1rem', fontWeight: 600 }}>
                                {log.item?.name || 'Deleted Material'}
                              </td>
                              <td style={{ padding: '1rem', fontWeight: 700, color: isPositive ? 'var(--success)' : 'var(--danger)' }}>
                                {isPositive ? '+' : ''}{log.quantity_change.toLocaleString()} {log.item?.unit}
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                {log.stock_before.toLocaleString()} → {log.stock_after.toLocaleString()} {log.item?.unit}
                              </td>
                              <td style={{ padding: '1rem' }}>
                                <span className={`badge badge-${
                                  log.reason === 'auto_deduction' ? 'queued' : 
                                  log.reason === 'wastage' ? 'preparing' : 'secondary'
                                }`} style={{ fontSize: '0.75rem' }}>
                                  {log.reason.replace('_', ' ')}
                                </span>
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                {log.staff?.full_name || 'System'}
                              </td>
                              <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {log.notes || '-'}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* RAW MATERIAL MODAL */}
      {showItemModal && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3>{currentItem ? 'Edit Raw Material' : 'Add New Raw Material'}</h3>
              <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setShowItemModal(false)}>
                <MdClose size={24} />
              </button>
            </div>
            
            <form onSubmit={handleItemSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Material Name *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={itemName} 
                    onChange={e => setItemName(e.target.value)}
                    placeholder="e.g., Pizza Cheese"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Base Unit *</label>
                  <select 
                    className="form-select" 
                    required
                    value={itemUnit} 
                    onChange={e => setItemUnit(e.target.value)}
                  >
                    <option value="grams">Grams (g)</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="pieces">Pieces (pcs)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="litres">Litres (L)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Min Alert Threshold *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    required 
                    value={itemLimit} 
                    onChange={e => setItemLimit(e.target.value)}
                    placeholder="e.g., 200"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Estimated Cost/Unit (₹)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    value={itemCost} 
                    onChange={e => setItemCost(e.target.value)}
                    placeholder="e.g., 0.65"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Supplier Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={itemSupplier} 
                  onChange={e => setItemSupplier(e.target.value)}
                  placeholder="e.g., Dairy Fresh Distributors"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Notes</label>
                <textarea 
                  className="form-input" 
                  rows="2"
                  value={itemNotes} 
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="Storage instructions, lead times, etc..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowItemModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Material</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL */}
      {showAdjustModal && adjustItem && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '450px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <span className="text-xs text-accent" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Manual Adjust</span>
                <h3 style={{ fontSize: '1.25rem', marginTop: '0.2rem' }}>{adjustItem.name}</h3>
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setShowAdjustModal(false)}>
                <MdClose size={24} />
              </button>
            </div>
            
            <div style={{ background: 'var(--bg-raised)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span className="text-secondary">Current Stock:</span>
              <span style={{ fontWeight: 700 }}>{adjustItem.current_stock.toLocaleString()} {adjustItem.unit}</span>
            </div>

            <form onSubmit={handleAdjustmentSubmit}>
              <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                <button 
                  type="button"
                  className="btn" 
                  style={{ flex: 1, background: adjustAction === 'add' ? 'var(--success)' : 'transparent', color: adjustAction === 'add' ? '#000' : 'var(--text-secondary)' }}
                  onClick={() => { setAdjustAction('add'); setAdjustReason('manual_add') }}
                >
                  Add Stock (+)
                </button>
                <button 
                  type="button"
                  className="btn"
                  style={{ flex: 1, background: adjustAction === 'remove' ? 'var(--danger)' : 'transparent', color: adjustAction === 'remove' ? '#fff' : 'var(--text-secondary)' }}
                  onClick={() => { setAdjustAction('remove'); setAdjustReason('manual_remove') }}
                >
                  Deduct Stock (-)
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Quantity ({adjustItem.unit}) *</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    className="form-input" 
                    required 
                    value={adjustQty} 
                    onChange={e => setAdjustQty(e.target.value)}
                    placeholder="e.g., 500"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Reason *</label>
                  <select 
                    className="form-select" 
                    required 
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                  >
                    {adjustAction === 'add' ? (
                      <>
                        <option value="manual_add">Refill / Purchase</option>
                        <option value="initial_stock">Initial Stock</option>
                        <option value="return">Customer Return</option>
                      </>
                    ) : (
                      <>
                        <option value="manual_remove">Manual Deduct</option>
                        <option value="wastage">Spoilage / Wastage</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Notes / Reference</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={adjustNotes} 
                  onChange={e => setAdjustNotes(e.target.value)}
                  placeholder="e.g. Invoice #2034, or Spilled milk"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: adjustAction === 'add' ? 'var(--success)' : 'var(--danger)', color: adjustAction === 'add' ? '#000' : '#fff' }}>
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
