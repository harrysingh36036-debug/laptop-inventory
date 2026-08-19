import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSales, getSalesSummary, getDailyReport, getDailyStoreSales, getRepairsByStore } from '../api';
import { inr } from '../utils';
import InventoryStats from './InventoryStats';
import SearchBox from './SearchBox';

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

function savePdf(filename, title, subtitle, headers, rows) {
  const doc = new jsPDF({ orientation: rows.length > 20 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(110, 116, 128);
  doc.text(subtitle || '', 14, 22);
  autoTable(doc, {
    startY: 26,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 43, 60], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 250] }
  });
  doc.save(filename);
}

export default function ReportsTab({ stores = [], logs = [], laptops = [], isAdmin = false, homeStoreId = null, onOpenStore }) {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [reportDate, setReportDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [daily, setDaily] = useState(null); // app_daily_report payload
  const [storeSales, setStoreSales] = useState(null); // app_daily_store_sales payload
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState('');
  const [repairByStore, setRepairByStore] = useState(null); // app_repairs_by_store payload
  const storeName = (id) => stores.find((s) => s.id === id)?.store_name;

  // Store filter: admins pick any store; managers are locked to their home store.
  const [storeFilter, setStoreFilter] = useState('all');
  const visibleStores = isAdmin ? stores : stores.filter((s) => s.id === homeStoreId);
  const effectiveFilter = isAdmin ? storeFilter : homeStoreId ? String(homeStoreId) : 'all';
  const applyStore = (rows = []) =>
    effectiveFilter === 'all' ? rows : rows.filter((r) => String(r.store_id) === effectiveFilter);

  // Rows + totals after the store filter (so totals match the visible stores).
  const dailyStores = applyStore(daily?.stores || []);
  const storeSalesRows = applyStore(storeSales?.stores || []);
  const dailyTotals = dailyStores.reduce(
    (a, s) => ({
      in_store: a.in_store + (s.in_store || 0),
      sold_on: a.sold_on + (s.sold_on || 0),
      transferred_out_on: a.transferred_out_on + (s.transferred_out_on || 0),
      transferred_in_on: a.transferred_in_on + (s.transferred_in_on || 0),
      out_total: a.out_total + (s.out_total || 0)
    }),
    { in_store: 0, sold_on: 0, transferred_out_on: 0, transferred_in_on: 0, out_total: 0 }
  );
  const storeSalesTotals = storeSalesRows.reduce(
    (a, s) => ({ units: a.units + (s.units || 0), amount: a.amount + (s.amount || 0), profit: a.profit + (s.profit || 0) }),
    { units: 0, amount: 0, profit: 0 }
  );
  const repairRows = applyStore(repairByStore?.stores || []);
  const repairTotals = repairRows.reduce(
    (a, s) => ({
      count: a.count + (s.count || 0),
      total_cost: a.total_cost + (s.total_cost || 0),
      total_charge: a.total_charge + (s.total_charge || 0),
      profit: a.profit + (s.profit || 0)
    }),
    { count: 0, total_cost: 0, total_charge: 0, profit: 0 }
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, sum, rb] = await Promise.all([getSales(), getSalesSummary(), getRepairsByStore().catch(() => null)]);
        if (!alive) return;
        setSales(s || []);
        setSummary(sum || null);
        setRepairByStore(rb || null);
      } catch {
        /* reports stay usable with whatever loaded */
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!reportDate) return;
    let alive = true;
    setDailyLoading(true);
    setDailyError('');
    (async () => {
      try {
        const [r, ss] = await Promise.all([getDailyReport(reportDate), getDailyStoreSales(reportDate)]);
        if (!alive) return;
        setDaily(r || null);
        setStoreSales(ss || null);
      } catch (e) {
        if (!alive) return;
        setDailyError(e.message);
      } finally {
        if (alive) setDailyLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reportDate]);

  const buildInventory = () => {
    const headers = ['SKU', 'Brand', 'Product Line', 'Model', 'Serial', 'Store', 'Status', 'Processor', 'RAM', 'Generation', 'Storage', 'Purchase Rate', 'Vendor', 'Created At'];
    const rows = (laptops || []).map((l) => [
      l.id, l.brand, l.product_line || '', l.brand_model, l.serial_number,
      storeName(l.current_store_id) || l.current_store_id || '',
      l.status, l.processor_type, l.ram || '', l.generation || '',
      l.storage_size ? `${l.storage_size} ${l.storage_type || ''}`.trim() : (l.storage_type || ''),
      l.purchase_rate, l.purchased_from || '', l.created_at || ''
    ]);
    return { headers, rows };
  };

  const downloadInventory = () => {
    const { headers, rows } = buildInventory();
    saveCsv(`inventory-report-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  const downloadInventoryPdf = () => {
    const { headers, rows } = buildInventory();
    savePdf(`inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`, 'Inventory Report', `${rows.length} laptops · generated ${new Date().toLocaleString()}`, headers, rows);
  };

  const buildTransfers = () => {
    const headers = ['#', 'Date / Time', 'Laptop', 'Serial', 'From Store', 'To Store', 'Transferred By'];
    const rows = (logs || []).map((l, i) => [
      i + 1, l.changed_at || '', l.brand_model || '', l.serial_number || '',
      l.from_store_name || storeName(l.from_store_id) || '',
      l.to_store_name || storeName(l.to_store_id) || '',
      l.transferred_by || ''
    ]);
    return { headers, rows };
  };

  const downloadTransfers = () => {
    const { headers, rows } = buildTransfers();
    saveCsv(`transfer-history-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  const downloadTransfersPdf = () => {
    const { headers, rows } = buildTransfers();
    savePdf(`transfer-history-${new Date().toISOString().slice(0, 10)}.pdf`, 'Transfer History', `${rows.length} moves · generated ${new Date().toLocaleString()}`, headers, rows);
  };

  const buildSales = () => {
    const headers = ['Sale ID', 'Laptop', 'Serial', 'Store', 'Customer', 'Sale Price', 'Cost', 'Profit', 'Sold By', 'Sold At'];
    const rows = (sales || []).map((s) => [
      s.id, s.brand_model || '', s.serial_number || '',
      storeName(s.store_id) || s.store_id || '',
      s.customer_name || (s.customer_id ? `#${s.customer_id}` : ''),
      s.sale_price ?? '', s.cost_price ?? '', s.profit ?? '', s.sold_by || '', s.sold_at || ''
    ]);
    return { headers, rows };
  };

  const downloadSales = () => {
    const { headers, rows } = buildSales();
    saveCsv(`sales-report-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  const downloadSalesPdf = () => {
    const { headers, rows } = buildSales();
    savePdf(`sales-report-${new Date().toISOString().slice(0, 10)}.pdf`, 'Sales Report', `${rows.length} sales · generated ${new Date().toLocaleString()}`, headers, rows);
  };

  const buildProfit = () => {
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Units Sold', String(summary?.count ?? 0)],
      ['Total Sales (₹)', String(summary?.total_sales ?? 0)],
      ['Total Profit (₹)', String(summary?.total_profit ?? 0)],
      ['Generated At', `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`]
    ];
    return { headers, rows };
  };

  const downloadProfit = () => {
    const { headers, rows } = buildProfit();
    saveCsv(`profit-summary-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  const downloadProfitPdf = () => {
    const { headers, rows } = buildProfit();
    savePdf(`profit-summary-${new Date().toISOString().slice(0, 10)}.pdf`, 'Profit Summary', `Generated ${new Date().toLocaleString()}`, headers, rows);
  };

  const buildRepairs = () => {
    const headers = ['Store', 'Repairs', 'Item Cost (₹)', 'Charged to Customer (₹)', 'Profit (₹)'];
    const rows = (repairRows || []).map((st) => [
      st.store_name || `#${st.store_id}`,
      String(st.count ?? 0),
      String(st.total_cost ?? 0),
      String(st.total_charge ?? 0),
      String(st.profit ?? 0)
    ]);
    rows.push([
      'Totals',
      String(repairTotals.count),
      String(repairTotals.total_cost),
      String(repairTotals.total_charge),
      String(repairTotals.profit)
    ]);
    return { headers, rows };
  };

  const downloadRepairs = () => {
    const { headers, rows } = buildRepairs();
    saveCsv(`repair-report-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  const downloadRepairsPdf = () => {
    const { headers, rows } = buildRepairs();
    savePdf(`repair-report-${new Date().toISOString().slice(0, 10)}.pdf`, 'Repair Report', `Generated ${new Date().toLocaleString()}`, headers, rows);
  };

  // Daily report PDF: per-store status + store-wise sales.
  const downloadDailyPdf = () => {
    if (!daily && !storeSales) return;
    const d = daily || { date: reportDate, stores: [], totals: {} };
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Daily Report', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(110, 116, 128);
    doc.text(`${d.date} · generated ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 26,
      head: [['Store', 'In Store', 'Sold', 'Transferred Out', 'Transferred In', 'Out Total']],
      body: dailyStores.map((st) => [
        st.store_name,
        String(st.in_store ?? 0),
        String(st.sold_on ?? 0),
        String(st.transferred_out_on ?? 0),
        String(st.transferred_in_on ?? 0),
        String(st.out_total ?? 0)
      ]),
      foot: [['Totals', String(dailyTotals.in_store), String(dailyTotals.sold_on), String(dailyTotals.transferred_out_on), String(dailyTotals.transferred_in_on), String(dailyTotals.out_total)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 43, 60], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      footStyles: { fillColor: [244, 246, 250], fontStyle: 'bold', textColor: [30, 33, 41] },
      alternateRowStyles: { fillColor: [244, 246, 250] }
    });
    if (storeSales) {
      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || doc.internal.pageSize.getHeight() - 20) + 8,
        head: [['Store', 'Units', 'Amount (₹)', 'Profit (₹)']],
        body: storeSalesRows.map((st) => [
          st.store_name,
          String(st.units ?? 0),
          String(Number(st.amount || 0).toLocaleString('en-IN')),
          String(Number(st.profit || 0).toLocaleString('en-IN'))
        ]),
        foot: [['Totals', String(storeSalesTotals.units), String(Number(storeSalesTotals.amount).toLocaleString('en-IN')), String(Number(storeSalesTotals.profit).toLocaleString('en-IN'))]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 43, 60], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        footStyles: { fillColor: [244, 246, 250], fontStyle: 'bold', textColor: [30, 33, 41] },
        alternateRowStyles: { fillColor: [244, 246, 250] }
      });
    }
    doc.save(`daily-report-${d.date}.pdf`);
  };

  // Printable daily report (per-store status + store-wise sales).
  const printDailyReport = () => {
    if (!daily && !storeSales) return;
    const d = daily || { date: reportDate, stores: [], totals: {} };
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) return;
    const rows = dailyStores
      .map(
        (st) => `<tr>
        <td>${escapeHtml(st.store_name)}</td>
        <td class="num">${st.in_store ?? 0}</td>
        <td class="num">${st.sold_on ?? 0}</td>
        <td class="num">${st.transferred_out_on ?? 0}</td>
        <td class="num">${st.transferred_in_on ?? 0}</td>
        <td class="num">${st.out_total ?? 0}</td>
        <td>${(st.models || []).map((m) => `${escapeHtml(m.model)} × ${m.count}`).join(', ') || '—'}</td>
      </tr>`
      )
      .join('');
    const t = dailyTotals;
    const srows = storeSalesRows
      .map(
        (st) => `<tr>
        <td>${escapeHtml(st.store_name)}</td>
        <td class="num">${st.units ?? 0}</td>
        <td class="num">₹ ${Number(st.amount || 0).toLocaleString('en-IN')}</td>
        <td class="num">₹ ${Number(st.profit || 0).toLocaleString('en-IN')}</td>
      </tr>`
      )
      .join('');
    const st = storeSalesTotals;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Daily Report — ${escapeHtml(d.date)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1d24; padding: 28px; }
  h1 { font-size: 20px; }
  .meta { color: #6b7280; font-size: 12px; margin: 2px 0 18px; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 8px; border: 1px solid #e2e6ee; vertical-align: top; }
  th { background: #f4f6fa; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; background: #f8fafc; }
  .foot { margin-top: 24px; text-align: center; color: #9aa3b2; font-size: 11px; }
</style></head><body>
  <h1>Daily Report</h1>
  <p class="meta">${escapeHtml(d.date)} · generated ${new Date().toLocaleString()}</p>
  <h2>Store status — in / out</h2>
  <table>
    <thead><tr><th>Store</th><th>In Store</th><th>Sold</th><th>Transferred Out</th><th>Transferred In</th><th>Out Total</th><th>Models</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Totals</td><td class="num">${t.in_store ?? 0}</td><td class="num">${t.sold_on ?? 0}</td><td class="num">${t.transferred_out_on ?? 0}</td><td class="num">${t.transferred_in_on ?? 0}</td><td class="num">${t.out_total ?? 0}</td><td></td></tr></tfoot>
  </table>
  <h2>Store-wise sales</h2>
  <table>
    <thead><tr><th>Store</th><th>Units</th><th>Amount</th><th>Profit</th></tr></thead>
    <tbody>${srows}</tbody>
    <tfoot><tr><td>Totals</td><td class="num">${st.units ?? 0}</td><td class="num">₹ ${Number(st.amount || 0).toLocaleString('en-IN')}</td><td class="num">₹ ${Number(st.profit || 0).toLocaleString('en-IN')}</td></tr></tfoot>
  </table>
  <p class="foot">Laptop Inventory · daily report</p>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const reports = [
    {
      title: 'Inventory Report',
      desc: `${laptops.length} laptops · store, status, specs & cost per unit`,
      action: downloadInventory,
      pdfAction: downloadInventoryPdf,
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
      pdfAction: downloadSalesPdf,
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
      pdfAction: downloadTransfersPdf,
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
      pdfAction: downloadProfitPdf,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      title: 'Repair Report',
      desc: 'Store-wise repairs · item cost vs charged to customer',
      stat: repairByStore ? `Charged ₹${Number(repairByStore?.totals?.total_charge || 0).toLocaleString('en-IN')}` : '',
      disabled: !repairRows.length,
      action: downloadRepairs,
      pdfAction: downloadRepairsPdf,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
        </svg>
      )
    }
  ];

  const statsStoreId = effectiveFilter === 'all' ? null : Number(effectiveFilter);

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Inventory Overview</h2>
            <p className="text-xs text-ink-faint">Stock levels by brand, generation and configuration.</p>
          </div>
          {isAdmin && visibleStores.length > 0 && (
            <select
              value={effectiveFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="field w-auto max-w-[220px]"
            >
              <option value="all">All stores</option>
              {visibleStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.store_name}
                </option>
              ))}
            </select>
          )}
        </div>
        <InventoryStats stores={stores} search={search} storeId={statsStoreId} />
      </section>

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
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={r.action}
                disabled={r.disabled}
                className="btn-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                CSV
              </button>
              <button
                onClick={r.pdfAction}
                disabled={r.disabled}
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
              >
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Daily report */}
      <section className="panel p-5" id="daily-report">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Daily report</h2>
            <p className="text-xs text-ink-faint">Per-store system in / out and store-wise sales for one day.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && visibleStores.length > 0 && (
              <select
                value={effectiveFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="field w-auto max-w-[220px]"
              >
                <option value="all">All stores</option>
                {visibleStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="field max-w-[170px]"
            />
            <button onClick={printDailyReport} disabled={dailyLoading || (!daily && !storeSales)} className="btn-ghost disabled:opacity-40">
              Print
            </button>
            <button onClick={downloadDailyPdf} disabled={dailyLoading || (!daily && !storeSales)} className="btn-ghost disabled:opacity-40">
              PDF
            </button>
          </div>
        </div>

        {dailyError && (
          <p className="mt-4 rounded-lg border border-stock-risk/30 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{dailyError}</p>
        )}
        {dailyLoading && <p className="mt-4 text-sm text-ink-faint">Loading daily report…</p>}

        {!dailyLoading && daily && (
          <div className="mt-5 space-y-6">
            {/* Summary cards: system counts per store for the selected date */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <button
                onClick={() => onOpenStore?.('')}
                className="panel flex flex-col items-start gap-1 p-4 text-left transition-colors hover:bg-surface-2/70"
                title="Open all stores in Inventory"
              >
                <span className="truncate w-full text-xs font-semibold uppercase tracking-wide text-ink-faint">All Stores</span>
                <span className="mt-1 font-display text-2xl font-bold text-accent">{dailyTotals.in_store}</span>
                <span className="text-[11px] text-ink-faint">
                  {dailyTotals.sold_on} sold on {reportDate}
                </span>
              </button>
              {dailyStores.map((st) => (
                <button
                  key={st.store_id}
                  onClick={() => onOpenStore?.(st.store_id)}
                  className="panel flex flex-col items-start gap-1 p-4 text-left transition-colors hover:bg-surface-2/70"
                  title={`Open ${st.store_name} in Inventory`}
                >
                  <span className="truncate w-full text-xs font-semibold uppercase tracking-wide text-ink-faint">{st.store_name}</span>
                  <span className="mt-1 font-display text-2xl font-bold text-accent">{st.in_store ?? 0}</span>
                  <span className="text-[11px] text-ink-faint">
                    {st.in_store === 1 ? 'system' : 'systems'} · {st.sold_on ?? 0} sold
                  </span>
                </button>
              ))}
            </div>

            {/* Daily report: uniform per-store tiles (in / out) */}
            <div>
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Store status — in / out on {reportDate}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dailyStores.map((st) => (
                  <button
                    key={st.store_id}
                    onClick={() => onOpenStore?.(st.store_id)}
                    className="panel flex flex-col gap-2.5 p-4 text-left transition-colors hover:bg-surface-2/70"
                    title={`Open ${st.store_name} in Inventory`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{st.store_name}</span>
                      <span className="mono-chip">{st.in_store ?? 0} in store</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Sold', value: st.sold_on ?? 0, strong: false },
                        { label: 'Transferred Out', value: st.transferred_out_on ?? 0, strong: false },
                        { label: 'Transferred In', value: st.transferred_in_on ?? 0, strong: false }
                      ].map((m) => (
                        <div key={m.label} className="flex flex-col items-center justify-between rounded-lg border border-line bg-surface-2/60 px-1 py-2 text-center">
                          <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-faint">{m.label}</p>
                          <p className={`mt-1 font-mono text-sm ${m.strong ? 'font-medium text-accent' : 'text-ink-dim'}`}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-2">
                      <span className="text-[11px] text-ink-faint">Out total</span>
                      <span className="font-mono text-sm font-medium text-accent">{st.out_total ?? 0}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(st.models || []).map((m) => (
                        <span
                          key={m.model}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenStore?.(st.store_id, m.model);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenStore?.(st.store_id, m.model);
                            }
                          }}
                          className="cursor-pointer rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim transition-colors hover:border-accent-line hover:text-accent"
                          title={`Find ${m.model} in ${st.store_name}`}
                        >
                          {m.model} × {m.count}
                        </span>
                      ))}
                      {(st.models || []).length === 0 && <span className="text-[10px] text-ink-faint">—</span>}
                    </div>
                  </button>
                ))}
                {dailyStores.length === 0 && (
                  <p className="col-span-full px-1 text-sm text-ink-faint">No stores on this date.</p>
                )}
              </div>
            </div>

            {/* Store-wise sales: uniform tiles */}
            {storeSales && (
              <div>
                <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Store-wise sales on {reportDate}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {storeSalesRows.map((st) => (
                    <button
                      key={st.store_id}
                      onClick={() => onOpenStore?.(st.store_id)}
                      className="panel flex flex-col gap-2 p-4 text-left transition-colors hover:bg-surface-2/70"
                      title={`Open ${st.store_name} in Inventory`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{st.store_name}</span>
                        <span className="mono-chip">{st.units ?? 0} units</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col items-center justify-between rounded-lg border border-line bg-surface-2/60 px-2 py-2 text-center">
                          <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-faint">Amount</p>
                          <p className="mt-1 font-mono text-sm text-ink">{inr(st.amount)}</p>
                        </div>
                        <div className="flex flex-col items-center justify-between rounded-lg border border-line bg-surface-2/60 px-2 py-2 text-center">
                          <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-faint">Profit</p>
                          <p className="mt-1 font-mono text-sm text-ink-dim">{inr(st.profit)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                  {storeSalesRows.length === 0 && (
                    <p className="col-span-full px-1 text-sm text-ink-faint">No sales on this date.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Store-wise repairs */}
      {repairByStore && (
        <section className="panel p-5" id="store-repairs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Store-wise repairs</h2>
              <p className="text-xs text-ink-faint">Item cost spent vs amount charged to customers, per store.</p>
            </div>
            <button onClick={downloadRepairs} disabled={!repairRows.length} className="btn-ghost disabled:opacity-40">
              CSV
            </button>
            <button onClick={downloadRepairsPdf} disabled={!repairRows.length} className="btn-ghost disabled:opacity-40">
              PDF
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {repairRows.map((st) => (
              <div key={st.store_id} className="panel flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{st.store_name}</span>
                  <span className="mono-chip">{st.count ?? 0} repairs</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center justify-between rounded-lg border border-line bg-surface-2/60 px-1 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-faint">Item Cost</p>
                    <p className="mt-1 font-mono text-sm text-ink-dim">{inr(st.total_cost)}</p>
                  </div>
                  <div className="flex flex-col items-center justify-between rounded-lg border border-line bg-surface-2/60 px-1 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-faint">Charged</p>
                    <p className="mt-1 font-mono text-sm text-ink">{inr(st.total_charge)}</p>
                  </div>
                  <div className="flex flex-col items-center justify-between rounded-lg border border-line bg-surface-2/60 px-1 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink-faint">Profit</p>
                    <p className="mt-1 font-mono text-sm text-ink-dim">{inr(st.profit)}</p>
                  </div>
                </div>
              </div>
            ))}
            {repairRows.length === 0 && (
              <p className="col-span-full px-1 text-sm text-ink-faint">No repairs recorded yet.</p>
            )}
          </div>
        </section>
      )}

    </div>
  );
}