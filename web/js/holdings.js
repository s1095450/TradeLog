// web/js/holdings.js
// 持倉總覽頁的邏輯

let holdingsData = [];
let holdingsSortCol = 'market';
let holdingsSortAsc = true;

// ==================== 初始化 ====================

async function initHoldings() {
    gsap.from("#holdings-container", { y: 30, opacity: 0, duration: 0.8, ease: "power3.out" });
    await refreshHoldings();
}

// ==================== 資料刷新 ====================

async function refreshHoldings() {
    const res = await API.getHoldings();
    if (res.status !== 'success') return;

    holdingsData = res.data;
    renderHoldingsSummary();
    renderHoldingsTable();

    // 同步刷新股價（確保新增的持倉也能立即顯示最新價）
    await refreshLivePrices();
    renderHoldingsTable();
    updateUnrealizedCards();
}

// ==================== 刷新股價（持倉頁專用） ====================

async function refreshHoldingsPrice() {
    await refreshLivePrices();
    renderHoldingsTable();
    updateUnrealizedCards();
}

// ==================== 未實現盈虧摘要卡片 ====================

function updateUnrealizedCards() {
    let twUnrealized = 0;
    let usUnrealizedUsd = 0;

    holdingsData.forEach(h => {
        const lp = livePricesData[h.symbol];
        if (!lp || lp.price == null) return;
        const unrealized = (lp.price - h.avg_cost) * h.qty;
        if (h.market === '台股') twUnrealized += unrealized;
        else if (h.market === '美股') usUnrealizedUsd += unrealized;
    });

    const twEl = document.getElementById('h-tw-unrealized');
    const usUsdEl = document.getElementById('h-us-unrealized-usd');
    const usTwdEl = document.getElementById('h-us-unrealized-twd');
    const rateEl = document.getElementById('h-usdtwd-rate');

    if (twEl) {
        twEl.innerText = (twUnrealized >= 0 ? '+' : '') + formatNum(twUnrealized, 0) + ' TWD';
        twEl.className = `text-xl font-extrabold table-num mt-1 ${twUnrealized >= 0 ? 'text-success' : 'text-danger'}`;
    }
    if (usUsdEl) {
        usUsdEl.innerText = (usUnrealizedUsd >= 0 ? '+' : '') + formatNum(usUnrealizedUsd) + ' USD';
        usUsdEl.className = `text-xl font-extrabold table-num mt-1 ${usUnrealizedUsd >= 0 ? 'text-success' : 'text-danger'}`;
    }
    if (usTwdEl && usdTwdRate) {
        const twd = usUnrealizedUsd * usdTwdRate;
        usTwdEl.innerText = '≈ ' + (twd >= 0 ? '+' : '') + formatNum(twd, 0) + ' TWD';
        usTwdEl.className = `text-xs table-num mt-0.5 ${twd >= 0 ? 'text-success/70' : 'text-danger/70'}`;
    }
    if (rateEl && usdTwdRate) {
        rateEl.innerText = `匯率 ${usdTwdRate.toFixed(2)}`;
    }
}

// ==================== 統計摘要 ====================

function renderHoldingsSummary() {
    const twStocks = holdingsData.filter(h => h.market === '台股');
    const usStocks = holdingsData.filter(h => h.market === '美股');

    const twCost = twStocks.reduce((sum, h) => sum + h.total_cost, 0);
    const usCost = usStocks.reduce((sum, h) => sum + h.total_cost, 0);

    document.getElementById('h-tw-count').innerText = twStocks.length;
    document.getElementById('h-us-count').innerText = usStocks.length;
    document.getElementById('h-tw-cost').innerText  = `$${twCost.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TWD`;
    document.getElementById('h-us-cost').innerText  = `$${usCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD`;
}

// ==================== 表格 ====================

function holdingsSort(col) {
    if (holdingsSortCol === col) holdingsSortAsc = !holdingsSortAsc;
    else { holdingsSortCol = col; holdingsSortAsc = true; }
    renderHoldingsTable();
}

function renderHoldingsTable() {
    const tbody = document.getElementById('holdings-tbody');
    const thead = document.getElementById('holdings-thead');
    tbody.innerHTML = '';

    const sorted = [...holdingsData].sort((a, b) => {
        let vA = a[holdingsSortCol] || '';
        let vB = b[holdingsSortCol] || '';
        if (typeof vA === 'string') return holdingsSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return holdingsSortAsc ? vA - vB : vB - vA;
    });

    // 表頭
    const cols = [
        { label: '市場',          key: 'market'     },
        { label: '代碼',          key: 'symbol'     },
        { label: '名稱',          key: 'name'       },
        { label: '持有數量',      key: 'qty'        },
        { label: '平均成本',      key: 'avg_cost'   },
        { label: '總成本',        key: 'total_cost' },
        { label: '最新股價',      key: null         },
        { label: '未實現盈虧%',   key: null         },
        { label: '未實現金額',    key: null         },
    ];

    thead.innerHTML = `<tr>
        ${cols.map(col => {
            if (!col.key) {
                return `<th class="px-3 py-2.5 text-center whitespace-nowrap text-gray-400 dark:text-gray-500 select-none">
                    <div class="flex items-center justify-center gap-1">${col.label}</div>
                </th>`;
            }
            const isSorted = holdingsSortCol === col.key;
            const icon = isSorted
                ? `<iconify-icon icon="${holdingsSortAsc ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}" class="text-primary text-lg"></iconify-icon>`
                : '';
            return `<th class="px-3 py-2.5 text-center whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-inputBgDark transition select-none" onclick="holdingsSort('${col.key}')">
                <div class="flex items-center justify-center gap-1">${col.label} ${icon}</div>
            </th>`;
        }).join('')}
    </tr>`;

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-20 text-center text-gray-400">
    <div class="flex flex-col items-center justify-center gap-3">
        <iconify-icon icon="solar:case-bold-duotone" class="text-5xl"></iconify-icon>
        <span class="text-sm font-medium">目前沒有持倉</span>
    </div>
</td></tr>`;
        return;
    }

    const tdBase = "px-3 py-2.5 text-center whitespace-nowrap";
    const tdNum  = `${tdBase} table-num`;

    let holdingsHtml = '';
    sorted.forEach(h => {
        const currency    = h.market === '台股' ? 'TWD' : 'USD';
        const marketColor = h.market === '台股' ? 'text-primary' : 'text-purple-400';
        const marketBg    = h.market === '台股' ? 'bg-primary/10' : 'bg-purple-400/10';

        // 即時股價計算
        const lp = livePricesData[h.symbol];
        let priceCell = '<span class="text-gray-400 text-xs">-</span>';
        let pctCell   = '<span class="text-gray-400 text-xs">-</span>';
        let amtCell   = '<span class="text-gray-400 text-xs">-</span>';

        if (lp && lp.price != null) {
            const latestPrice = lp.price;
            const unrealized  = (latestPrice - h.avg_cost) * h.qty;
            const pct         = h.avg_cost > 0 ? ((latestPrice - h.avg_cost) / h.avg_cost * 100) : 0;
            const pColor      = pct >= 0 ? 'text-success' : 'text-danger';
            const pSign       = pct >= 0 ? '+' : '';
            const uSign       = unrealized >= 0 ? '+' : '';

            const decimalPlaces = h.market === '台股' ? 2 : 4;
            priceCell = `<span class="font-bold text-yellow-400 dark:text-yellow-300">${formatNum(latestPrice, decimalPlaces)} ${currency}</span>`;
            pctCell   = `<span class="font-bold ${pColor}">${pSign}${pct.toFixed(2)}%</span>`;

            if (h.market === '美股' && usdTwdRate) {
                const twdAmt = unrealized * usdTwdRate;
                const tSign  = twdAmt >= 0 ? '+' : '';
                amtCell = `<div class="flex flex-col items-center leading-tight">
                    <span class="font-bold ${pColor}">${uSign}${formatNum(unrealized)} USD</span>
                    <span class="text-xs ${pColor} opacity-70">≈ ${tSign}${formatNum(twdAmt, 0)} TWD</span>
                </div>`;
            } else {
                amtCell = `<span class="font-bold ${pColor}">${uSign}${formatNum(unrealized, 0)} ${currency}</span>`;
            }
        }

        holdingsHtml += `
            <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors">
                <td class="${tdBase}">
                    <span class="px-2 py-1 rounded-lg text-xs font-bold ${marketColor} ${marketBg}">${h.market}</span>
                </td>
                <td class="${tdBase} font-bold ${marketColor}">${h.symbol}</td>
                <td class="px-3 py-2.5 text-left whitespace-nowrap text-gray-600 dark:text-gray-300">${h.name || '-'}</td>
                <td class="${tdNum}">${h.qty.toLocaleString('en-US', {maximumFractionDigits: 4})}</td>
                <td class="${tdNum}">${
                    h.market === '美股' && usdTwdRate
                        ? `<div class="flex flex-col items-center leading-tight">
                            <span>${formatNum(h.avg_cost)} USD</span>
                            <span class="text-xs opacity-60">≈ ${formatNum(h.avg_cost * usdTwdRate, 0)} TWD</span>
                           </div>`
                        : `${formatNum(h.avg_cost)} ${currency}`
                }</td>
                <td class="${tdNum} font-bold text-purple-500 dark:text-purple-400">${
                    h.market === '美股' && usdTwdRate
                        ? `<div class="flex flex-col items-center leading-tight">
                            <span>${formatNum(h.total_cost)} USD</span>
                            <span class="text-xs text-purple-400/60 font-normal">≈ ${formatNum(h.total_cost * usdTwdRate, 0)} TWD</span>
                           </div>`
                        : `${formatNum(h.total_cost)} ${currency}`
                }</td>
                <td class="${tdNum}">${priceCell}</td>
                <td class="${tdNum}">${pctCell}</td>
                <td class="${tdNum}">${amtCell}</td>
            </tr>`;
    });
    tbody.innerHTML = holdingsHtml;
}