import { useEffect, useState } from 'react';
import { getSales, getSalesSummary, getDailyReport, getDailyStoreSales } from '../api';
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

export default function ReportsTab({ stores = [], logs = [], laptops = [] }) {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daily, setDaily] = useState(null); // app_daily_report payload
  const [storeSales, setStoreSales] = useState(null); // app_daily_store_sales payload
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState('');
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

  const downloadInventory = () => {
    const rows = [
      ['SKU', 'Brand', 'Product Line', 'Model', 'Serial', 'Store', 'Status', 'Processor', 'RAM', 'Generation', 'Storage', 'Purchase Rate', 'Vendor', 'Created At']
    ];
    (laptops || []).forEach((l) =>
      rows.push([
        l.id, l.brand, l.product_line || '', l.brand_model, l.serial_number,
        storeName(l.current_store_id) || l.current_store_id || '',
        l.status, l.processor_type, l.ram || '', l.generation || '',
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

  // Printable daily report (per-store status + store-wise sales).
  const printDailyReport = () => {
    if (!daily && !storeSales) return;
    const d = daily || { date: reportDate, stores: [], totals: {} };
    const ss = storeSales || { date: reportDate, stores: [], totals: {} };
    const w = window.open('', '_blank', 'width=760,height=900');
    if (!w) return;
    const rows = (d.stores || [])
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
    const t = d.totals || {};
    const srows = (ss.stores || [])
      .map(
        (st) => `<tr>
        <td>${escapeHtml(st.store_name)}</td>
        <td class="num">${st.units ?? 0}</td>
        <td class="num">₹ ${Number(st.amount || 0).toLocaleString('en-IN')}</td>
        <td class="num">₹ ${Number(st.profit || 0).toLocaleString('en-IN')}</td>
      </tr>`
      )
      .join('');
    const st = ss.totals || {};
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

      {/* Daily report */}
      <section className="panel p-5" id="daily-report">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Daily report</h2>
            <p className="text-xs text-ink-faint">Per-store system in / out and store-wise sales for one day.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="field max-w-[170px]"
            />
            <button onClick={printDailyReport} disabled={dailyLoading || (!daily && !storeSales)} className="btn-ghost disabled:opacity-40">
              Print
            </button>
          </div>
        </div>

        {dailyError && (
          <p className="mt-4 rounded-lg border border-stock-risk/30 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{dailyError}</p>
        )}
        {dailyLoading && <p className="mt-4 text-sm text-ink-faint">Loading daily report…</p>}

        {!dailyLoading && daily && (
          <div className="mt-5 space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Store</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">In Store</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Sold</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Transferred Out</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Transferred In</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Out Total</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Models</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline)]">
                  {(daily.stores || []).map((st) => (
                    <tr key={st.store_id} className="transition-colors duration-150 hover:bg-surface-2/60">
                      <td className="px-3 py-2.5 font-medium text-ink">{st.store_name}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-ink">{st.in_store ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{st.sold_on ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{st.transferred_out_on ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{st.transferred_in_on ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-accent">{st.out_total ?? 0}</td>
                      <td className="px-3 py-2.5 text-[11px] text-ink-dim">
                        {(st.models || []).map((m) => (
                          <span key={m.model} className="mr-1.5 inline-block rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">
                            {m.model} × {m.count}
                          </span>
                        ))}
                        {(st.models || []).length === 0 && <span className="text-ink-faint">—</span>}
                      </td>
                    </tr>
                  ))}
                  {(daily.stores || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-ink-faint">No stores on this date.</td>
                    </tr>
                  )}
                </tbody>
                {daily.totals && (
                  <tfoot>
                    <tr className="border-t border-line">
                      <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink">Totals</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink">{daily.totals.in_store ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink-dim">{daily.totals.sold_on ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink-dim">{daily.totals.transferred_out_on ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink-dim">{daily.totals.transferred_in_on ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-accent">{daily.totals.out_total ?? 0}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {storeSales && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Store</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Units</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Amount</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--hairline)]">
                    {(storeSales.stores || []).map((st) => (
                      <tr key={st.store_id} className="transition-colors duration-150 hover:bg-surface-2/60">
                        <td className="px-3 py-2.5 font-medium text-ink">{st.store_name}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{st.units ?? 0}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-ink">{inr(st.amount)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{inr(st.profit)}</td>
                      </tr>
                    ))}
                    {(storeSales.stores || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-sm text-ink-faint">No sales on this date.</td>
                      </tr>
                    )}
                  </tbody>
                  {storeSales.totals && (
                    <tfoot>
                      <tr className="border-t border-line">
                        <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink">Totals</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink">{storeSales.totals.units ?? 0}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink">{inr(storeSales.totals.amount)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-ink-dim">{inr(storeSales.totals.profit)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <InventoryStats stores={stores} laptops={laptops} search={search} />
    </div>
  );
}