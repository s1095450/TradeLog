// web/js/stockprofit.js
// 個股盈虧頁邏輯

let stockProfitData = [];
let expandedSymbols = new Set();
let spSortCol = 'last_date';
let spSortAsc = false;

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
    document.getElementById('sp-stat-crypto').innerText = fmt(s.crypto);
    document.getElementById('sp-stat-crypto').className = `text-3xl font-extrabold table-num mt-2 ${colorClass(s.crypto)}`;

    renderStockProfitList();
}

// ==================== 排序 ====================

const SP_SORT_LABELS = { last_date: '最後交易日', total_profit: '盈虧金額', symbol: '代碼' };

function spSort(col) {
    if (spSortCol === col) spSortAsc = !spSortAsc;
    else { spSortCol = col; spSortAsc = false; }

    // 更新排序按鈕樣式與方向箭頭
    ['last_date', 'total_profit', 'symbol'].forEach(c => {
        const btn = document.getElementById(`sp-sort-${c}`);
        if (!btn) return;
        if (c === spSortCol) {
            btn.classList.add('bg-primary/20', 'text-primary');
            btn.classList.remove('text-gray-400');
            const arrow = spSortAsc ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold';
            btn.innerHTML = `${SP_SORT_LABELS[c]} <iconify-icon icon="${arrow}" class="text-sm align-middle"></iconify-icon>`;
        } else {
            btn.classList.remove('bg-primary/20', 'text-primary');
            btn.classList.add('text-gray-400');
            btn.innerHTML = SP_SORT_LABELS[c];
        }
    });

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
    container.innerHTML = '';

    if (stockProfitData.length === 0) {
        container.innerHTML = `
    <tr><td colspan="7" class="py-20 text-center text-gray-400">
        <div class="flex flex-col items-center justify-center gap-3">
            <iconify-icon icon="solar:chart-bold-duotone" class="text-5xl"></iconify-icon>
            <span class="text-sm font-medium">尚無交易紀錄</span>
        </div>
    </td></tr>`;
        return;
    }

    const sorted = [...stockProfitData].sort((a, b) => {
        let vA = a[spSortCol] || '';
        let vB = b[spSortCol] || '';
        if (typeof vA === 'string') return spSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return spSortAsc ? vA - vB : vB - vA;
    });

    sorted.forEach(s => {
        const isExpanded  = expandedSymbols.has(s.symbol);
        const pColor      = s.total_profit > 0 ? 'text-success' : (s.total_profit < 0 ? 'text-danger' : 'text-gray-400');
        const profitStr = s.total_profit > 0
            ? `+${formatNum(s.total_profit)}`
            : formatNum(s.total_profit);
        const currency    = s.market === '台股' ? 'TWD' : (s.market === '美股' ? 'USD' : 'USDT');
        const marketColor = s.market === '台股' ? 'text-primary bg-primary/10' : (s.market === '美股' ? 'text-purple-400 bg-purple-400/10' : 'text-crypto bg-crypto/10');

        // 交易明細
        let detailHtml = '';
        if (isExpanded) {
            const detailRows = s.records.map(r => {
                const isBuy    = r.action === '買入';
                const actionColor = isBuy ? 'text-success' : 'text-danger';
                const actionIcon  = isBuy ? 'solar:cart-large-minimalistic-bold-duotone' : 'solar:tag-price-bold-duotone';
                const date     = r.date || r.dt || '';
                const price    = r.price_twd || r.price_usd || r.price || 0;
                const profit   = parseFloat(r.profit || 0);
                const profitColor = profit > 0 ? 'text-success' : (profit < 0 ? 'text-danger' : 'text-gray-400');
                const profitDisplay = r.action === '賣出'
                    ? `<span class="font-bold ${profitColor}">${profit > 0 ? '+' : ''}${formatNum(profit)}</span>`
                    : `<span class="text-gray-400">-</span>`;

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
                        <td class="px-4 py-2.5 text-center text-xs text-gray-400 truncate max-w-[120px]">${r.remark || '-'}</td>
                    </tr>`;
            }).join('');

            detailHtml = `
                <tr class="bg-gray-50/50 dark:bg-bgDark/50">
                    <td colspan="7" class="px-4 py-0">
                        <div class="overflow-hidden transition-all">
                            <table class="w-full text-center border-collapse">
                                <thead>
                                    <tr class="text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                        <th class="px-4 py-2 text-center">日期</th>
                                        <th class="px-4 py-2 text-center">動作</th>
                                        <th class="px-4 py-2 text-center">數量</th>
                                        <th class="px-4 py-2 text-center">單價</th>
                                        <th class="px-4 py-2 text-center">盈虧</th>
                                        <th class="px-4 py-2 text-center">備註</th>
                                    </tr>
                                </thead>
                                <tbody>${detailRows}</tbody>
                            </table>
                        </div>
                    </td>
                </tr>`;
        }

        container.innerHTML += `
            <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors cursor-pointer group"
                onclick="toggleExpand('${s.symbol}')">
                <td class="px-4 py-3.5 text-center">
                    <span class="px-2 py-1 rounded-lg text-xs font-bold ${marketColor}">${s.market}</span>
                </td>
                <td class="px-4 py-3.5 text-center font-bold ${marketColor.split(' ')[0]}">${s.symbol}</td>
                <td class="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300">${s.name || '-'}</td>
                <td class="px-4 py-3.5 text-center text-xs text-gray-500">${s.last_date}</td>
                <td class="px-4 py-3.5 text-center table-num text-gray-500 text-sm">${s.buy_count} 買 / ${s.sell_count} 賣</td>
                <td class="px-4 py-3.5 text-center font-bold table-num ${pColor}">${profitStr} ${s.sell_count > 0 ? currency : ''}</td>
                <td class="px-4 py-3.5 text-center text-gray-400 group-hover:text-primary transition-colors">
                    <iconify-icon icon="${isExpanded ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}" class="text-lg"></iconify-icon>
                </td>
            </tr>
            ${detailHtml}`;
    });
}