import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, ExternalLink, RefreshCw,
  ChevronUp, ChevronDown, Download, Upload,
  Eye, Edit3, ShoppingCart, CheckCircle,
  Clock, AlertTriangle, Link2, DollarSign,
  Tag, Layers, ArrowRightLeft, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { comparePrices } from './priceEngine';

const CATEGORIES = ['Electronics', 'Home', 'Clothing', 'Hobbies', 'Gifts', 'Other'];
const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#94a3b8' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'high', label: 'High', color: '#ef4444' }
];
const STATUSES = [
  { value: 'wishlist', label: 'Wishlist', icon: Clock },
  { value: 'ordered', label: 'Ordered', icon: ShoppingCart },
  { value: 'received', label: 'Received', icon: CheckCircle }
];

const App = () => {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem('buylist-data');
    return saved ? JSON.parse(saved) : [];
  });
  const [isEditing, setIsEditing] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    localStorage.setItem('buylist-data', JSON.stringify(items));
  }, [items]);

  const addItem = () => {
    const newItem = {
      id: crypto.randomUUID(),
      name: '',
      category: 'Other',
      priority: 'medium',
      status: 'wishlist',
      price: '',
      currency: 'USD',
      links: [{ url: '', label: 'Main' }],
      createdAt: new Date().toISOString(),
      lastChecked: null
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id, updates) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const addLink = (itemId) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          links: [...item.links, { url: '', label: `Mirror ${item.links.length}` }]
        };
      }
      return item;
    }));
  };

  const updateLink = (itemId, linkIndex, updates) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const newLinks = [...item.links];
        newLinks[linkIndex] = { ...newLinks[linkIndex], ...updates };
        return { ...item, links: newLinks };
      }
      return item;
    }));
  };

  const removeLink = (itemId, linkIndex) => {
    setItems(items.map(item => {
      if (item.id === itemId && item.links.length > 1) {
        const newLinks = item.links.filter((_, i) => i !== linkIndex);
        return { ...item, links: newLinks };
      }
      return item;
    }));
  };

  const moveItem = (index, direction) => {
    const newItems = [...items];
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < items.length) {
      [newItems[index], newItems[nextIndex]] = [newItems[nextIndex], newItems[index]];
      setItems(newItems);
    }
  };

  const refreshPrices = async () => {
    setIsRefreshing(true);

    try {
      const updatedItems = await Promise.all(
        items.map(async (item) => {
          if (!item.links?.length) {
            return item;
          }

          try {
            const comparison =
              await comparePrices(
                item.links
              );

            const cheapest =
              comparison.cheapest;

            const oldPrice =
              parseFloat(item.price) || 0;

            return {
              ...item,

              previousPrice:
                oldPrice > 0
                  ? oldPrice.toFixed(2)
                  : null,

              price:
                cheapest?.price != null
                  ? Number(cheapest.price).toFixed(2)
                  : '',

              currency:
                cheapest?.currency ||
                item.currency ||
                'USD',

              cheapestVendor:
                cheapest?.label || null,

              cheapestURL:
                cheapest?.url || null,

              priceData:
                comparison.prices || [],

              lastChecked:
                new Date().toISOString()
            };
          } catch (err) {
            console.error(
              `Failed refreshing ${item.name}`,
              err
            );

            return item;
          }
        })
      );

      setItems(updatedItems);
    } catch (err) {
      console.error(
        'Global refresh failed',
        err
      );
    }

    setIsRefreshing(false);
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buylist-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setItems(data);
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'All' || item.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, filterCategory]);

  const totalPrice = useMemo(() => {
    return filteredItems.reduce((acc, item) => acc + (parseFloat(item.price) || 0), 0).toFixed(2);
  }, [filteredItems]);

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <h1>BuyList</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track your desires across the web</p>
        </motion.div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="secondary" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? <Eye size={18} /> : <Edit3 size={18} />}
            {isEditing ? 'Preview' : 'Edit'}
          </button>
          <button className="secondary" onClick={exportData} title="Export Data">
            <Download size={18} />
          </button>
          <label className="secondary" style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center' }}>
            <Upload size={18} />
            <input type="file" hidden onChange={importData} accept=".json" />
          </label>
          <button className="primary" onClick={addItem}>
            <Plus size={18} /> Add Item
          </button>
        </div>
      </header>

      <section className="glass card" style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search items..."
            style={{ width: '100%', paddingLeft: '40px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Tag size={18} style={{ color: 'var(--text-muted)' }} />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option>All</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Budget</p>
            <p style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent)' }}>${totalPrice}</p>
          </div>
          <button className={`secondary ${isRefreshing ? 'animate-spin' : ''}`} onClick={refreshPrices} disabled={isRefreshing}>
            <RefreshCw size={18} /> Refresh Prices
          </button>
        </div>
      </section>

      <div className={isEditing ? '' : 'grid'}>
        <AnimatePresence mode="popLayout">
          {filteredItems.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`glass card ${isEditing ? '' : 'animate-in'}`}
              style={{ padding: '20px', marginBottom: isEditing ? '16px' : '0' }}
            >
              {isEditing ? (
                // EDIT MODE
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button className="secondary" style={{ padding: '4px' }} onClick={() => moveItem(index, -1)}><ChevronUp size={16} /></button>
                      <button className="secondary" style={{ padding: '4px' }} onClick={() => moveItem(index, 1)}><ChevronDown size={16} /></button>
                    </div>
                    <input
                      type="text"
                      placeholder="Item Name"
                      style={{ fontSize: '1.2rem', fontWeight: '600', flex: 1 }}
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    />
                    <select value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className="danger" onClick={() => removeItem(item.id)}><Trash2 size={18} /></button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Price Tracking</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <DollarSign size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input
                            type="number"
                            placeholder="0.00"
                            style={{ width: '100%', paddingLeft: '30px' }}
                            value={item.price}
                            onChange={(e) => updateItem(item.id, { price: e.target.value })}
                          />
                        </div>
                        <select style={{ width: '80px' }} value={item.currency} onChange={(e) => updateItem(item.id, { currency: e.target.value })}>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Priority & Status</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          style={{ flex: 1 }}
                          value={item.priority}
                          onChange={(e) => updateItem(item.id, { priority: e.target.value })}
                        >
                          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <select
                          style={{ flex: 1 }}
                          value={item.status}
                          onChange={(e) => updateItem(item.id, { status: e.target.value })}
                        >
                          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mirror Links</label>
                      <button className="secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => addLink(item.id)}>
                        <Plus size={14} /> Add Link
                      </button>
                    </div>
                    {item.links.map((link, lIndex) => (
                      <div key={lIndex} style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Label"
                          style={{ width: '120px' }}
                          value={link.label}
                          onChange={(e) => updateLink(item.id, lIndex, { label: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder="https://..."
                          style={{ flex: 1 }}
                          value={link.url}
                          onChange={(e) => updateLink(item.id, lIndex, { url: e.target.value })}
                        />
                        {item.links.length > 1 && (
                          <button className="danger" style={{ padding: '8px' }} onClick={() => removeLink(item.id, lIndex)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // PREVIEW MODE
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                          {item.category}
                        </span>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: PRIORITIES.find(p => p.value === item.priority).color }} />
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '700' }}>{item.name || 'Untitled Item'}</h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        {item.previousPrice && parseFloat(item.price) < parseFloat(item.previousPrice) && <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>↓</span>}
                        {item.previousPrice && parseFloat(item.price) > parseFloat(item.previousPrice) && <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>↑</span>}
                        <p style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--accent)' }}>
                          {item.price ? `${item.currency === 'EUR' ? '€' : item.currency === 'GBP' ? '£' : '$'}${item.price}` : '—'}
                        </p>
                      </div>
                      {item.lastChecked && (
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          Checked {new Date(item.lastChecked).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      {(() => {
                        const StatusIcon = STATUSES.find(s => s.value === item.status).icon;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <StatusIcon size={16} />
                            {STATUSES.find(s => s.value === item.status).label}
                          </div>
                        );
                      })()}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {item.links.map((link, lIndex) => (
                        <a
                          key={lIndex}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary"
                          style={{
                            textDecoration: 'none',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            background: lIndex === 0 ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            color: lIndex === 0 ? 'var(--primary)' : 'var(--text)',
                            border: lIndex === 0 ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Link2 size={14} />
                          {link.label || 'Link'}
                          <ExternalLink size={12} style={{ opacity: 0.5 }} />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
            <Layers size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
            <p>No items found. Start by adding something you want!</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
