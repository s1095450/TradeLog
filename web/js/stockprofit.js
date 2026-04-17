// web/js/stockprofit.js
// 個股盈虧頁邏輯

let stockProfitData = [];
let expandedSymbols = new Set();
let spSortCol = 'last_date';
let spSortAsc = false;
let spFilterMarket = 'all';

// ==================== 初始化 ====================

async function initStockProfit() {
    await refreshStockProfit();
    gsap.from("#page-stockprofit", { y: 30, opacity: 0, duration: 0.8, ease: "power3.out" });
}

// ==================== 資料刷新 ====================

async function refreshStockProfit() {
    const res = await API.getStockProfit();
    if (res.status !== 'success') return;

    stockProfitData = res.data.symbols;

    // 統計卡
    const s = res.data.summary;
    const fmt = (val) => {
        const prefix = val > 0 ? '+' : '';
        return `${prefix}${formatNum(val)}`;
    };
    const colorClass = (val) => val >= 0 ? 'text-success' : 'text-danger';

    document.getElementById('sp-stat-twd').innerText    = fmt(s.twd);
    document.getElementById('sp-stat-twd').className    = `text-3xl font-extrabold table-num mt-2 ${colorClass(s.twd)}`;
    document.getElementById('sp-stat-usd').innerText    = fmt(s.usd);
    document.getElementById('sp-stat-usd').className    = `text-3xl font-extrabold table-num mt-2 ${colorClass(s.usd)}`;
    const spUsdTwdEl = document.getElementById('sp-stat-usd-twd');
    if (spUsdTwdEl) {
        const twdVal  = s.usd_twd != null ? s.usd_twd : 0;
        const twdSign = twdVal >= 0 ? '+' : '';
        spUsdTwdEl.innerText  = `≈ ${twdSign}${formatNum(twdVal, 0)} TWD`;
        spUsdTwdEl.className  = `text-xs table-num mt-0.5 ${colorClass(twdVal)}` + ' opacity-70';
    }
    document.getElementById('sp-stat-crypto').innerText = fmt(s.crypto);
    document.getElementById('sp-stat-crypto').className = `text-3xl font-extrabold table-num mt-2 ${colorClass(s.crypto)}`;

    renderStockProfitList();
}

// ==================== 分類篩選 ====================

function spFilter(market) {
    spFilterMarket = market;
    renderStockProfitList();
}

// ==================== 排序 ====================

function spSort(col) {
    if (spSortCol === col) spSortAsc = !spSortAsc;
    else { spSortCol = col; spSortAsc = false; }
    renderStockProfitList();
}

// ==================== 展開/收合 ====================

function toggleExpand(symbol) {
    if (expandedSymbols.has(symbol)) expandedSymbols.delete(symbol);
    else expandedSymbols.add(symbol);
    renderStockProfitList();
}

// ==================== 渲染列表 ====================

function renderStockProfitList() {
    const container = document.getElementById('sp-list');
    const thead = document.getElementById('sp-thead');

    // 更新分類按鈕樣式
    const filterMap = { 'all': 'sp-filter-all', '台股': 'sp-filter-tw', '美股': 'sp-filter-us', 'Crypto': 'sp-filter-crypto' };
    Object.entries(filterMap).forEach(([market, id]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const isActive = spFilterMarket === market;
        btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition ${
            isActive ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-inputBgLight dark:hover:bg-inputBgDark'
        }`;
    });

    // 篩選
    const filtered = spFilterMarket === 'all'
        ? stockProfitData
        : stockProfitData.filter(s => s.market === spFilterMarket);

    // 預計算排序用欄位（同時算平均成本）
    const enriched = filtered.map(s => {
        const sellRecords = s.records.filter(r => r.action === '賣出');
        const totalCostBasis = sellRecords.reduce((sum, r) => {
            const p = parseFloat(r.price_twd || r.price_usd || r.price || 0);
            const q = parseFloat(r.qty || 1);
            const pft = parseFloat(r.profit || 0);
            return sum + (s.market === 'Crypto' ? (p - pft) : (p * q - pft));
        }, 0);
        const totalPct = totalCostBasis > 0 ? s.total_profit / totalCostBasis * 100 : null;
        const totalQtySold = sellRecords.reduce((sum, r) => sum + parseFloat(r.qty || 0), 0);
        // 移動平均成本（方案 B）：所有賣出的加權均成本
        const avgCost = (s.market !== 'Crypto' && totalQtySold > 0)
            ? totalCostBasis / totalQtySold
            : null;
        return {
            ...s,
            _trade_count:      s.buy_count + s.sell_count,
            _total_pct:        totalPct,
            _avg_cost:         avgCost,
            _total_cost_basis: totalCostBasis,
        };
    });

    // 排序（null 值一律排到最後）
    const sorted = [...enriched].sort((a, b) => {
        const vA = a[spSortCol];
        const vB = b[spSortCol];
        if (vA == null && vB == null) return 0;
        if (vA == null) return 1;
        if (vB == null) return -1;
        if (typeof vA === 'string') return spSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return spSortAsc ? vA - vB : vB - vA;
    });

    // 動態表頭
    const cols = [
        { label: '市場',       key: 'market'        },
        { label: '代碼',       key: 'symbol'        },
        { label: '名稱',       key: null            },
        { label: '最後交易日', key: 'last_date'     },
        { label: '交易次數',   key: '_trade_count'  },
        { label: '平均成本',   key: null            },
        { label: '已實現盈虧', key: 'total_profit'  },
        { label: '報酬率',     key: '_total_pct'    },
        { label: '',           key: null            },
    ];

    thead.innerHTML = `<tr>
        ${cols.map(col => {
            if (!col.key) {
                return `<th class="px-4 py-3 text-center whitespace-nowrap select-none">${col.label}</th>`;
            }
            const isSorted = spSortCol === col.key;
            const icon = isSorted
                ? `<iconify-icon icon="${spSortAsc ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}" class="text-primary text-base"></iconify-icon>`
                : '';
            return `<th class="px-4 py-3 text-center whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-inputBgDark transition select-none" onclick="spSort('${col.key}')">
                <div class="flex items-center justify-center gap-1">${col.label} ${icon}</div>
            </th>`;
        }).join('')}
    </tr>`;

    // 空狀態
    if (sorted.length === 0) {
        container.innerHTML = `
    <tr><td colspan="9" class="py-20 text-center text-gray-400">
        <div class="flex flex-col items-center justify-center gap-3">
            <iconify-icon icon="solar:chart-bold-duotone" class="text-5xl"></iconify-icon>
            <span class="text-sm font-medium">尚無交易紀錄</span>
        </div>
    </td></tr>`;
        return;
    }

    let listHtml = '';
    sorted.forEach(s => {
        const isExpanded  = expandedSymbols.has(s.symbol);
        const pColor      = s.total_profit > 0 ? 'text-success' : (s.total_profit < 0 ? 'text-danger' : 'text-gray-400');
        const currency    = s.market === '台股' ? 'TWD' : (s.market === '美股' ? 'USD' : 'USDT');
        const totalPctStr = s._total_pct !== null
            ? `${s._total_pct > 0 ? '+' : ''}${s._total_pct.toFixed(2)}%`
            : '-';
        const profitStr   = `${s.total_profit > 0 ? '+' : ''}${formatNum(s.total_profit)}`;
        const marketColor = s.market === '台股' ? 'text-primary bg-primary/10' : (s.market === '美股' ? 'text-purple-400 bg-purple-400/10' : 'text-crypto bg-crypto/10');

        // 平均成本欄位
        let avgCostCell;
        if (s._avg_cost === null) {
            avgCostCell = `<span class="text-gray-400">—</span>`;
        } else if (s.market === '美股' && usdTwdRate) {
            avgCostCell = `<div class="flex flex-col items-center leading-tight">
                <span class="table-num">${formatNum(s._avg_cost, 4)} USD</span>
                <span class="text-xs opacity-60 table-num">≈ ${formatNum(s._avg_cost * usdTwdRate, 2)} TWD</span>
            </div>`;
        } else {
            const dec = s.market === '台股' ? 2 : 4;
            avgCostCell = `<span class="table-num">${formatNum(s._avg_cost, dec)} ${currency}</span>`;
        }

        // 交易明細（展開）
        let detailHtml = '';
        if (isExpanded) {
            const detailRows = s.records.map(r => {
                const isBuy       = r.action === '買入';
                const actionColor = isBuy ? 'text-success' : 'text-danger';
                const actionIcon  = isBuy ? 'solar:cart-large-minimalistic-bold-duotone' : 'solar:tag-price-bold-duotone';
                const date        = r.date ? formatDateStr(r.date) : (r.dt || '');
                const price       = r.price_twd || r.price_usd || r.price || 0;
                const profit      = parseFloat(r.profit || 0);
                const profitColor = profit > 0 ? 'text-success' : (profit < 0 ? 'text-danger' : 'text-gray-400');
                let profitDisplay;
                let pctDisplay;
                if (r.action === '賣出') {
                    const qty       = parseFloat(r.qty || 1);
                    const costBasis = s.market === 'Crypto' ? (price - profit) : (price * qty - profit);
                    const pct       = costBasis > 0 ? profit / costBasis * 100 : 0;
                    const pctSign   = pct > 0 ? '+' : '';
                    if (s.market === '美股') {
                        const rate      = parseFloat(r.usd_twd_rate || 0);
                        const profitTwd = rate ? Math.round(profit * rate) : null;
                        const twdLine   = profitTwd !== null
                            ? `<div class="text-xs ${profitColor} opacity-60 table-num">≈ ${profit > 0 ? '+' : ''}${profitTwd.toLocaleString()} TWD</div>`
                            : '';
                        profitDisplay = `<div class="flex flex-col items-center leading-tight">
                            <span class="font-bold ${profitColor}">${profit > 0 ? '+' : ''}${formatNum(profit)} USD</span>
                            ${twdLine}
                        </div>`;
                    } else {
                        profitDisplay = `<span class="font-bold ${profitColor}">${profit > 0 ? '+' : ''}${formatNum(profit)}</span>`;
                    }
                    pctDisplay = `<span class="font-bold ${profitColor}">${pctSign}${pct.toFixed(2)}%</span>`;
                } else {
                    profitDisplay = `<span class="text-gray-400">-</span>`;
                    pctDisplay    = `<span class="text-gray-400">-</span>`;
                }

                return `
                    <tr class="border-b border-gray-100 dark:border-gray-700/30 hover:bg-inputBgLight/40 dark:hover:bg-inputBgDark/40 transition-colors">
                        <td class="px-4 py-2.5 text-center text-xs text-gray-500">${date}</td>
                        <td class="px-4 py-2.5 text-center">
                            <span class="flex items-center justify-center gap-1 text-xs font-bold ${actionColor}">
                                <iconify-icon icon="${actionIcon}"></iconify-icon>${r.action}
                            </span>
                        </td>
                        <td class="px-4 py-2.5 text-center text-xs table-num">${s.market === 'Crypto' ? '<span class="text-gray-400">-</span>' : `${parseFloat(r.qty || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} 股`}</td>
                        <td class="px-4 py-2.5 text-center text-xs table-num">${s.market === 'Crypto' ? formatNum(r.price) : `${formatNum(price)} ${currency}`}</td>
                        <td class="px-4 py-2.5 text-center text-xs table-num">${profitDisplay}</td>
                        <td class="px-4 py-2.5 text-center text-xs table-num">${pctDisplay}</td>
                        <td class="px-4 py-2.5 text-center text-xs text-gray-400 truncate max-w-[120px]">${escapeHtml(r.remark) || '-'}</td>
                    </tr>`;
            }).join('');

            detailHtml = `
                <tr class="bg-gray-50/50 dark:bg-bgDark/50">
                    <td colspan="9" class="px-4 py-0">
                        <div class="overflow-hidden transition-all">
                            <table class="w-full text-center border-collapse">
                                <thead>
                                    <tr class="text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                        <th class="px-4 py-2 text-center">日期</th>
                                        <th class="px-4 py-2 text-center">動作</th>
                                        <th class="px-4 py-2 text-center">數量</th>
                                        <th class="px-4 py-2 text-center">單價</th>
                                        <th class="px-4 py-2 text-center">盈虧</th>
                                        <th class="px-4 py-2 text-center">報酬率</th>
                                        <th class="px-4 py-2 text-center">備註</th>
                                    </tr>
                                </thead>
                                <tbody>${detailRows}</tbody>
                            </table>
                        </div>
                    </td>
                </tr>`;
        }

        listHtml += `
            <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors cursor-pointer group"
                onclick="toggleExpand('${s.symbol}')">
                <td class="px-4 py-3.5 text-center">
                    <span class="px-2 py-1 rounded-lg text-xs font-bold ${marketColor}">${s.market}</span>
                </td>
                <td class="px-4 py-3.5 text-center font-bold ${marketColor.split(' ')[0]}">${s.symbol}</td>
                <td class="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300">${s.name || '-'}</td>
                <td class="px-4 py-3.5 text-center text-xs text-gray-500">${formatDateStr(s.last_date)}</td>
                <td class="px-4 py-3.5 text-center table-num text-gray-500 text-sm">${s.buy_count} 買 / ${s.sell_count} 賣</td>
                <td class="px-4 py-3.5 text-center">${avgCostCell}</td>
                <td class="px-4 py-3.5 text-center font-bold table-num ${pColor}">${
                    s.market === '美股' && s.sell_count > 0
                        ? `<div class="flex flex-col items-center leading-tight">
                            <span>${profitStr} USD</span>
                            <span class="text-xs opacity-60 font-normal">≈ ${s.total_profit >= 0 ? '+' : ''}${formatNum(s.total_profit_twd || 0, 0)} TWD</span>
                           </div>`
                        : `${profitStr} ${s.sell_count > 0 ? currency : ''}`
                }</td>
                <td class="px-4 py-3.5 text-center font-bold table-num ${pColor}">${totalPctStr}</td>
                <td class="px-4 py-3.5 text-center text-gray-400 group-hover:text-primary transition-colors">
                    <iconify-icon icon="${isExpanded ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}" class="text-lg"></iconify-icon>
                </td>
            </tr>
            ${detailHtml}`;
    });
    container.innerHTML = listHtml;
}
