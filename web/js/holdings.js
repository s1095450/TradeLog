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
}

// ==================== 統計摘要 ====================

function renderHoldingsSummary() {
    const twStocks  = holdingsData.filter(h => h.market === '台股');
    const usStocks  = holdingsData.filter(h => h.market === '美股');

    const twCount   = twStocks.length;
    const usCount   = usStocks.length;
    const twCost    = twStocks.reduce((sum, h) => sum + h.total_cost, 0);
    const usCost    = usStocks.reduce((sum, h) => sum + h.total_cost, 0);

    document.getElementById('h-tw-count').innerText  = twCount;
    document.getElementById('h-us-count').innerText  = usCount;
    document.getElementById('h-tw-cost').innerText   = `$${twCost.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('h-us-cost').innerText   = `$${usCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
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
    ];

    thead.innerHTML = `<tr>
        ${cols.map(col => {
            const isSorted = holdingsSortCol === col.key;
            const icon = isSorted
                ? `<iconify-icon icon="${holdingsSortAsc ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}" class="text-primary text-lg"></iconify-icon>`
                : '';
            return `<th class="px-4 py-3 text-center whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-inputBgDark transition select-none" onclick="holdingsSort('${col.key}')">
                <div class="flex items-center justify-center gap-1">${col.label} ${icon}</div>
            </th>`;
        }).join('')}
    </tr>`;

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-20 text-center text-gray-400">
    <div class="flex flex-col items-center justify-center gap-3">
        <iconify-icon icon="solar:case-bold-duotone" class="text-5xl"></iconify-icon>
        <span class="text-sm font-medium">目前沒有持倉</span>
    </div>
</td></tr>`;
        return;
    }

    const tdBase = "px-4 py-3 text-center whitespace-nowrap";
    const tdNum  = `${tdBase} table-num`;

    sorted.forEach(h => {
        const currency    = h.market === '台股' ? 'TWD' : 'USD';
        const marketColor = h.market === '台股' ? 'text-primary' : 'text-purple-400';
        const marketBg    = h.market === '台股' ? 'bg-primary/10' : 'bg-purple-400/10';

        tbody.innerHTML += `
            <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors">
                <td class="${tdBase}">
                    <span class="px-2 py-1 rounded-lg text-xs font-bold ${marketColor} ${marketBg}">${h.market}</span>
                </td>
                <td class="${tdBase} font-bold ${marketColor}">${h.symbol}</td>
                <td class="${tdBase} text-gray-600 dark:text-gray-300">${h.name || '-'}</td>
                <td class="${tdNum}">${h.qty.toLocaleString('en-US', {maximumFractionDigits: 4})}</td>
                <td class="${tdNum}">${h.avg_cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currency}</td>
                <td class="${tdNum} font-bold text-purple-500 dark:text-purple-400">${h.total_cost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currency}</td>
            </tr>`;
    });
}