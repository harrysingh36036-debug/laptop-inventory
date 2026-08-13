import { useEffect, useState } from 'react';
import { getSales, getSalesSummary } from '../api';
import InventoryStats from './InventoryStats';
import SearchBox from './SearchBox';

function csvEscape(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function saveCsv(filename, rows) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.parentNode && a.parentNode.removeChild(a);
}

export default function ReportsTab({ stores = [], logs = [], laptops = [] }) {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const storeName = (id) => stores.find((s) => s.id === id)?.store_name;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, sum] = await Promise.all([getSales(), getSalesSummary()]);
        if (!alive) return;
        setSales(s || []);
        setSummary(sum || null);
      } catch {
        /* reports stay usable with whatever loaded */
      }
    })();
    return () => { alive = false; };
  }, []);

  const downloadInventory = () => {
    const rows = [
      ['SKU', 'Brand', 'Model', 'Serial', 'Store', 'Status', 'Processor', 'Generation', 'Storage', 'Purchase Rate', 'Vendor', 'Created At']
    ];
    (laptops || []).forEach((l) =>
      rows.push([
        l.id, l.brand, l.brand_model, l.serial_number,
        storeName(l.current_store_id) || l.current_store_id || '',
        l.status, l.processor_type, l.generation,
        l.storage_size ? `${l.storage_size} ${l.storage_type || ''}`.trim() : (l.storage_type || ''),
        l.purchase_rate, l.purchased_from || '', l.created_at || ''
      ])
    );
    saveCsv(`inventory-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const downloadTransfers = () => {
    const rows = [
      ['#', 'Date / Time', 'Laptop', 'Serial', 'From Store', 'To Store', 'Transferred By']
    ];
    (logs || []).forEach((l, i) =>
      rows.push([
        i + 1, l.changed_at || '', l.brand_model || '', l.serial_number || '',
        l.from_store_name || storeName(l.from_store_id) || '',
        l.to_store_name || storeName(l.to_store_id) || '',
        l.transferred_by || ''
      ])
    );
    saveCsv(`transfer-history-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const downloadSales = () => {
    const rows = [
      ['Sale ID', 'Laptop', 'Serial', 'Store', 'Customer', 'Sale Price', 'Cost', 'Profit', 'Sold By', 'Sold At']
    ];
    (sales || []).forEach((s) =>
      rows.push([
        s.id, s.brand_model || '', s.serial_number || '',
        storeName(s.store_id) || s.store_id || '',
        s.customer_name || (s.customer_id ? `#${s.customer_id}` : ''),
        s.sale_price ?? '', s.cost_price ?? '', s.profit ?? '', s.sold_by || '', s.sold_at || ''
      ])
    );
    saveCsv(`sales-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const downloadProfit = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Units Sold', String(summary?.count ?? 0)],
      ['Total Sales (₹)', String(summary?.total_sales ?? 0)],
      ['Total Profit (₹)', String(summary?.total_profit ?? 0)],
      ['Generated At', `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`]
    ];
    saveCsv(`profit-summary-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const reports = [
    {
      title: 'Inventory Report',
      desc: `${laptops.length} laptops · store, status, specs & cost per unit`,
      action: downloadInventory,
      disabled: !laptops.length,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    {
      title: 'Sales Report',
      desc: `${sales.length} sales · prices, customers & profit per unit`,
      stat: summary ? `₹${Number(summary.total_sales || 0).toLocaleString('en-IN')}` : '',
      disabled: !sales.length,
      action: downloadSales,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      title: 'Transfer History',
      desc: `${logs.length} moves between stores`,
      stat: `${logs.length ? `${logs.length} movements` : ''}`,
      disabled: !logs.length,
      action: downloadTransfers,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    },
    {
      title: 'Profit Summary',
      desc: 'Total sales, cost & profit',
      stat: summary ? `Profit ₹${Number(summary.total_profit || 0).toLocaleString('en-IN')}` : '',
      action: downloadProfit,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-rise">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search reports by laptop, serial, store, brand or customer…"
        countLabel={`${laptops.length} laptops · ${sales.length} sales · ${logs.length} transfers`}
        className="max-w-md"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reports.map((r) => (
          <div key={r.title} className="panel flex flex-col p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent">
              {r.icon}
            </div>
            <h3 className="font-display text-sm font-semibold tracking-tight text-ink">{r.title}</h3>
            <p className="mt-1 flex-1 text-xs text-ink-faint">{r.desc}</p>
            {r.stat && <p className="mt-2 font-mono text-lg font-medium tracking-tight text-accent">{r.stat}</p>}
            <button
              onClick={r.action}
              disabled={r.disabled}
              className="btn-accent mt-4 self-start disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download CSV
            </button>
          </div>
        ))}
      </div>

      <InventoryStats stores={stores} laptops={laptops} search={search} />
    </div>
  );
}