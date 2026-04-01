// web/js/dashboard.js
// 主頁（Dashboard）的所有邏輯

let inputMarket = '台股';
let viewMarket = '台股';
let tableTab = '買入';
let allRecords = [];
let editingId = null;
let sortCol = 'id';
let sortAsc = false;
let selectedRows = new Set();
let fpInstance = null;

// ==================== 初始化 ====================

async function initDashboard() {
    gsap.from("#sidebar", { x: -50, opacity: 0, duration: 0.8, ease: "power3.out" });
    gsap.from("#stats-cards > div", { y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) closeAllDropdowns();
    });

    renderForm();
    await refreshData();
}

// ==================== 資料刷新 ====================

async function refreshData() {
    // 刷新統計卡
    const stats = await API.getDashboardStats();
    if (stats.status === 'success') {
        animateValue("stat-twd", stats.data.twd, 'TWD');
        animateValue("stat-usd", stats.data.usd, 'USD');
        animateValue("stat-crypto", stats.data.crypto, 'USDT');
    }

    // 刷新表格
    const tableMode = (viewMarket === '台股' || viewMarket === '美股') ? 'Stock' : 'Crypto';
    const res = await API.getRecords(tableMode);

    if (res.status === 'success') {
        allRecords = res.data.map(r => {
            if (tableMode === 'Stock')
                r.total_cost = r.qty * (r.market === '台股' ? r.price_twd : r.price_usd);
            return r;
        });
        renderTable();
    }
}

// ==================== 市場切換 ====================

function setInputMarket(market) {
    if (editingId) cancelEdit();
    inputMarket = market;

    const activeClass = "flex-1 py-2 rounded-lg text-sm font-bold bg-primary text-white dark:text-bgDark transition-all shadow-md flex justify-center items-center gap-1";
    const activeCrypto = activeClass.replace('bg-primary', 'bg-crypto');
    const inactiveClass = "flex-1 py-2 rounded-lg text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-all flex justify-center items-center gap-1";

    document.getElementById('btn-in-tw').className = market === '台股' ? activeClass : inactiveClass;
    document.getElementById('btn-in-us').className = market === '美股' ? activeClass : inactiveClass;
    document.getElementById('btn-in-crypto').className = market === 'Crypto' ? activeCrypto : inactiveClass;

    const saveBtn = document.getElementById('btn-save');
    saveBtn.className = `w-full mt-6 font-bold py-3.5 rounded-xl transition transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex justify-center items-center gap-2 text-base text-white dark:text-bgDark ${market === 'Crypto' ? 'bg-crypto hover:bg-teal-400' : 'bg-primary hover:bg-cyan-400'}`;

    renderForm();
}

function setViewMarket(market) {
    viewMarket = market;
    selectedRows.clear();
    updateBatchDeleteButton();

    const activeClass = "px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-sm text-white dark:text-bgDark ";
    const inactiveClass = "px-5 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-all bg-transparent";

    document.getElementById('btn-view-tw').className = market === '台股' ? activeClass + 'bg-primary' : inactiveClass;
    document.getElementById('btn-view-us').className = market === '美股' ? activeClass + 'bg-primary' : inactiveClass;
    document.getElementById('btn-view-crypto').className = market === 'Crypto' ? activeClass + 'bg-crypto' : inactiveClass;

    refreshData();
}

function setTableTab(tab) {
    selectedRows.clear();
    updateBatchDeleteButton();
    tableTab = tab;

    const activeClass = 'px-5 py-2 rounded-xl bg-inputBgLight dark:bg-inputBgDark text-primary font-bold transition flex items-center gap-1.5 shadow-sm border border-gray-200 dark:border-gray-600';
    const inactiveClass = 'px-5 py-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-inputBgDark transition flex items-center gap-1.5 border border-transparent';

    document.getElementById('tab-buy').className = tab === '買入' ? activeClass : inactiveClass;
    document.getElementById('tab-sell').className = tab === '賣出' ? activeClass : inactiveClass;
    renderTable();
}

// ==================== 表單 ====================

function getLocalToday(isStock) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return isStock ? `${year}${month}${day}` : `${year}-${month}-${day} ${hours}:${mins}`;
}

function calculateFee() {
    if (inputMarket !== '台股') return;

    const actionInput = document.getElementById('f_action');
    const qtyInput = document.getElementById('f_qty');
    const priceInput = document.getElementById('f_price');
    const actualInput = document.getElementById('f_actual_twd');
    const feeInput = document.getElementById('f_fee');

    if (!actionInput || !qtyInput || !priceInput || !actualInput || !feeInput) return;

    const action = actionInput.value;
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const actual = parseFloat(actualInput.value) || 0;

    if (qty > 0 && price > 0 && actual > 0) {
        const cost = qty * price;
        let fee = action === '買入' ? actual - cost : cost - actual;
        feeInput.value = fee >= 0 ? Math.round(fee) : 0;
    }
}

function renderForm() {
    if (fpInstance) fpInstance.destroy();
    const container = document.getElementById('form-container');
    const inputClass = 'sync-h w-full px-3 bg-inputBgLight dark:bg-inputBgDark text-gray-800 dark:text-white rounded-xl border border-transparent focus:border-primary outline-none transition-all shadow-sm text-sm font-medium';
    const labelClass = 'text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 font-bold mb-1 ml-1';
    const todayStr = getLocalToday(inputMarket !== 'Crypto');
    let html = '';

    if (inputMarket === '台股' || inputMarket === '美股') {
        const currency = inputMarket === '台股' ? 'TWD' : 'USD';
        html += `
            <div class="grid grid-cols-2 gap-3 w-full">
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon>交易日期</label><input type="text" id="f_date" class="${inputClass}" value="${todayStr}"></div>
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon>買賣動作</label>${createDropdown('f_action', ['買入', '賣出'], '買入')}</div>
            </div>
            <div class="grid grid-cols-2 gap-3 w-full">
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:tag-bold-duotone"></iconify-icon>股票代碼</label><input type="text" id="f_symbol" class="${inputClass} uppercase"></div>
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:text-square-bold-duotone"></iconify-icon>股票名稱</label><input type="text" id="f_name" class="${inputClass}"></div>
            </div>
            <div class="grid grid-cols-2 gap-3 w-full">
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:layers-bold-duotone"></iconify-icon>數量(股)</label><input type="number" id="f_qty" class="${inputClass}" step="0.01" oninput="calculateFee()"></div>
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:wad-of-money-bold-duotone"></iconify-icon>單價 (${currency})</label><input type="number" id="f_price" class="${inputClass}" step="0.01" oninput="calculateFee()"></div>
            </div>
            <div class="grid grid-cols-2 gap-3 w-full">
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:card-bold-duotone"></iconify-icon>實際扣款(TWD)</label><input type="number" id="f_actual_twd" class="${inputClass}" step="0.01" oninput="calculateFee()"></div>
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:ticket-sale-bold-duotone"></iconify-icon>手續費(${currency})</label><input type="number" id="f_fee" class="${inputClass}" value="0" step="0.01"></div>
            </div>
            <div class="w-full mt-1">
                <label class="${labelClass}"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon>備註</label>
                <input type="text" id="f_remark" class="${inputClass}">
            </div>`;
    } else {
        html += `
            <div class="grid grid-cols-2 gap-3 w-full">
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:calendar-bold-duotone"></iconify-icon>日期時間</label><input type="text" id="f_dt" class="${inputClass}" value="${todayStr}"></div>
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:hand-money-bold-duotone"></iconify-icon>買賣動作</label>${createDropdown('f_c_action', ['買入', '賣出'], '買入')}</div>
            </div>
            <div class="w-full"><label class="${labelClass}"><iconify-icon icon="ic:twotone-currency-bitcoin"></iconify-icon>幣種 (如 BTC)</label><input type="text" id="f_c_symbol" class="${inputClass} uppercase"></div>
            <div class="grid grid-cols-2 gap-3 w-full">
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:wad-of-money-bold-duotone"></iconify-icon>成交金額(USDT)</label><input type="number" id="f_c_price" class="${inputClass}" step="0.000001"></div>
                <div class="w-full"><label class="${labelClass}"><iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>盈虧金額(USDT)</label><input type="number" id="f_c_profit" class="${inputClass}" value="0" step="0.01"></div>
            </div>
            <div class="w-full mt-1">
                <label class="${labelClass}"><iconify-icon icon="solar:document-text-bold-duotone"></iconify-icon>備註</label>
                <input type="text" id="f_c_remark" class="${inputClass}">
            </div>`;
    }

    container.innerHTML = html;

    fpInstance = flatpickr(inputMarket === 'Crypto' ? "#f_dt" : "#f_date", {
        enableTime: inputMarket === 'Crypto',
        dateFormat: inputMarket === 'Crypto' ? "Y-m-d H:i" : "Ymd",
        time_24hr: true,
        allowInput: true
    });
}

// ==================== 儲存 / 編輯 / 取消 ====================

async function saveRecord() {
    let data = {};
    const isStockMode = (inputMarket === '台股' || inputMarket === '美股');

    try {
        if (isStockMode) {
            data = {
                date: document.getElementById('f_date').value,
                market: inputMarket,
                symbol: document.getElementById('f_symbol').value.toUpperCase(),
                name: document.getElementById('f_name').value,
                action: document.getElementById('f_action').value,
                qty: parseFloat(document.getElementById('f_qty').value || 0),
                price_twd: inputMarket === '台股' ? parseFloat(document.getElementById('f_price').value || 0) : 0,
                price_usd: inputMarket === '美股' ? parseFloat(document.getElementById('f_price').value || 0) : 0,
                actual_twd: parseFloat(document.getElementById('f_actual_twd').value || 0),
                fee: parseFloat(document.getElementById('f_fee').value || 0),
                profit: 0,
                remark: document.getElementById('f_remark').value
            };
        } else {
            data = {
                dt: document.getElementById('f_dt').value,
                symbol: document.getElementById('f_c_symbol').value.toUpperCase(),
                action: document.getElementById('f_c_action').value,
                price: parseFloat(document.getElementById('f_c_price').value || 0),
                profit: parseFloat(document.getElementById('f_c_profit').value || 0),
                remark: document.getElementById('f_c_remark').value
            };
        }

        const tableMode = isStockMode ? 'Stock' : 'Crypto';
        const res = editingId
            ? await API.updateRecord(tableMode, editingId, data)
            : await API.addRecord(tableMode, data);

        if (res.status === 'success') {
            flashSuccess();
            if (editingId) cancelEdit();
            else {
                if (isStockMode) document.getElementById('f_symbol').value = '';
                else document.getElementById('f_c_symbol').value = '';
            }
            if (viewMarket !== inputMarket) setViewMarket(inputMarket);
            else await refreshData();
        } else {
            alert("儲存失敗: " + res.message);
        }
    } catch (e) {
        alert("請檢查欄位格式是否正確！");
    }
}

function editRow(id) {
    const row = allRecords.find(r => r.id === id);
    editingId = id;

    const targetMarket = (viewMarket === 'Crypto') ? 'Crypto' : row.market;
    if (inputMarket !== targetMarket) setInputMarket(targetMarket);

    if (inputMarket !== 'Crypto') {
        fpInstance.setDate(row.date);
        selectOption('f_action', row.action);
        document.getElementById('f_symbol').value = row.symbol;
        document.getElementById('f_name').value = row.name || '';
        document.getElementById('f_qty').value = row.qty || '';
        document.getElementById('f_price').value = (row.market === '台股') ? (row.price_twd || '') : (row.price_usd || '');
        document.getElementById('f_actual_twd').value = row.actual_twd || '';
        document.getElementById('f_fee').value = row.fee || '';
        document.getElementById('f_remark').value = row.remark || '';
    } else {
        fpInstance.setDate(row.dt);
        selectOption('f_c_action', row.action);
        document.getElementById('f_c_symbol').value = row.symbol;
        document.getElementById('f_c_price').value = row.price || '';
        document.getElementById('f_c_profit').value = row.profit || '';
        document.getElementById('f_c_remark').value = row.remark || '';
    }

    const btn = document.getElementById('btn-save');
    btn.innerHTML = `<iconify-icon icon="solar:pen-bold" class="text-xl"></iconify-icon> 更新紀錄`;
    btn.classList.replace('bg-primary', 'bg-purple-500');
    btn.classList.replace('hover:bg-cyan-400', 'hover:bg-purple-400');
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('sidebar').scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    renderForm();
    const btn = document.getElementById('btn-save');
    btn.innerHTML = `<iconify-icon icon="solar:diskette-bold" class="text-xl"></iconify-icon> 儲存紀錄`;
    btn.classList.replace('bg-purple-500', 'bg-primary');
    btn.classList.replace('hover:bg-purple-400', 'hover:bg-cyan-400');
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

// ==================== 刪除 ====================

async function deleteRows(ids) {
    if (!confirm("確定要刪除嗎？")) return;
    const tableMode = (viewMarket === '台股' || viewMarket === '美股') ? 'Stock' : 'Crypto';
    await API.deleteRecords(tableMode, ids);
    refreshData();
}

async function deleteSelected() {
    if (selectedRows.size === 0) return;
    if (confirm(`確定要刪除這 ${selectedRows.size} 筆紀錄嗎？`)) {
        const tableMode = (viewMarket === '台股' || viewMarket === '美股') ? 'Stock' : 'Crypto';
        await API.deleteRecords(tableMode, Array.from(selectedRows));
        selectedRows.clear();
        updateBatchDeleteButton();
        refreshData();
    }
}

// ==================== 表格 ====================

function handleSort(col) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = false; }
    renderTable();
}

function toggleRowSelection(cb) {
    const val = parseInt(cb.value);
    if (cb.checked) selectedRows.add(val);
    else selectedRows.delete(val);
    updateBatchDeleteButton();
}

function toggleSelectAll(cb) {
    let displayData = allRecords.filter(r => r.action === tableTab);
    if (viewMarket !== 'Crypto') displayData = displayData.filter(r => r.market === viewMarket);
    if (cb.checked) displayData.forEach(r => selectedRows.add(r.id));
    else selectedRows.clear();
    renderTable();
    updateBatchDeleteButton();
}

function updateBatchDeleteButton() {
    const btn = document.getElementById('btn-batch-delete');
    document.getElementById('selected-count').innerText = selectedRows.size;
    if (selectedRows.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

function getTh(label, colKey, align = "center") {
    const isSorted = sortCol === colKey;
    const iconHtml = isSorted
        ? `<iconify-icon icon="${sortAsc ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}" class="text-primary text-lg"></iconify-icon>`
        : '';
    const justify = align === 'right' ? 'justify-end' : (align === 'left' ? 'justify-start' : 'justify-center');
    return `<th class="px-3 py-3 sortable whitespace-nowrap" onclick="handleSort('${colKey}')">
        <div class="flex items-center gap-1.5 ${justify}">${label} ${iconHtml}</div>
    </th>`;
}

function renderTable() {
    const head = document.getElementById('table-head');
    const body = document.getElementById('table-body');
    head.innerHTML = '';
    body.innerHTML = '';

    let displayData = allRecords.filter(r => r.action === tableTab);
    if (viewMarket === '台股' || viewMarket === '美股')
        displayData = displayData.filter(r => r.market === viewMarket);

    displayData.sort((a, b) => {
        let valA = a[sortCol] || '';
        let valB = b[sortCol] || '';
        if (typeof valA === 'string') return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return sortAsc ? valA - valB : valB - valA;
    });

    const allChecked = displayData.length > 0 && displayData.every(r => selectedRows.has(r.id));
    const chkHead = `<th class="px-4 py-3 w-10 text-center"><input type="checkbox" onclick="toggleSelectAll(this)" ${allChecked ? 'checked' : ''}></th>`;
    const tdText = "px-3 py-3 whitespace-nowrap text-center text-gray-700 dark:text-gray-200";
    const tdNum = "px-3 py-3 whitespace-nowrap text-center table-num text-gray-700 dark:text-gray-200";

    if (viewMarket === '台股' || viewMarket === '美股') {
        const currency = viewMarket === '台股' ? 'TWD' : 'USD';
        head.innerHTML = `<tr>${chkHead}
            ${getTh('日期', 'date')} ${getTh('代碼', 'symbol')} ${getTh('名稱', 'name')}
            ${getTh('數量', 'qty')} ${getTh(`單價(${currency})`, viewMarket === '台股' ? 'price_twd' : 'price_usd')}
            ${getTh(`總成本(${currency})`, 'total_cost')}
            ${getTh('實際扣款', 'actual_twd')} ${getTh('手續費', 'fee')}
            ${getTh('盈虧', 'profit')}
            <th class="px-3 py-3 text-center whitespace-nowrap">備註</th>
            <th class="px-3 py-3 text-center whitespace-nowrap">操作</th>
        </tr>`;

        displayData.forEach(row => {
            const price = viewMarket === '台股' ? row.price_twd : row.price_usd;
            const pColor = row.profit > 0 ? 'text-success' : (row.profit < 0 ? 'text-danger' : 'text-gray-500 dark:text-gray-400');
            const isChecked = selectedRows.has(row.id) ? 'checked' : '';
            body.innerHTML += `
                <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors group">
                    <td class="px-4 py-3 text-center"><input type="checkbox" value="${row.id}" onchange="toggleRowSelection(this)" ${isChecked}></td>
                    <td class="${tdText}">${row.date}</td>
                    <td class="${tdText} font-bold text-primary">${row.symbol}</td>
                    <td class="${tdText}">${row.name || '-'}</td>
                    <td class="${tdNum}">${row.qty}</td>
                    <td class="${tdNum}">${price}</td>
                    <td class="${tdNum} font-bold text-purple-500 dark:text-purple-400">${row.total_cost.toFixed(2)}</td>
                    <td class="${tdNum}">${row.actual_twd}</td>
                    <td class="${tdNum}">${row.fee}</td>
                    <td class="${tdNum} font-bold ${pColor}">${row.profit}</td>
                    <td class="${tdText} text-xs text-gray-500 truncate max-w-[120px]" title="${row.remark || ''}">${row.remark || '-'}</td>
                    <td class="px-3 py-3 text-center flex gap-3 justify-center whitespace-nowrap opacity-70 group-hover:opacity-100 transition-opacity">
                        <button onclick="editRow(${row.id})" class="text-primary hover:text-cyan-400 transition transform hover:scale-125"><iconify-icon icon="solar:pen-bold" class="text-lg"></iconify-icon></button>
                        <button onclick="deleteRows([${row.id}])" class="text-danger hover:text-red-400 transition transform hover:scale-125"><iconify-icon icon="solar:trash-bin-trash-bold" class="text-lg"></iconify-icon></button>
                    </td>
                </tr>`;
        });
    } else {
        head.innerHTML = `<tr>${chkHead}
            ${getTh('時間', 'dt')} ${getTh('幣種', 'symbol')}
            ${getTh('成交金額(USDT)', 'price')} ${getTh('盈虧(USDT)', 'profit')}
            <th class="px-3 py-3 text-center whitespace-nowrap">備註</th>
            <th class="px-3 py-3 text-center whitespace-nowrap">操作</th>
        </tr>`;

        displayData.forEach(row => {
            const pColor = row.profit > 0 ? 'text-success' : (row.profit < 0 ? 'text-danger' : 'text-gray-500 dark:text-gray-400');
            const isChecked = selectedRows.has(row.id) ? 'checked' : '';
            body.innerHTML += `
                <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors group">
                    <td class="px-4 py-3 text-center"><input type="checkbox" value="${row.id}" onchange="toggleRowSelection(this)" ${isChecked}></td>
                    <td class="${tdText}">${row.dt}</td>
                    <td class="${tdText} font-bold text-crypto tracking-wide">${row.symbol}</td>
                    <td class="${tdNum}">${row.price}</td>
                    <td class="${tdNum} font-bold ${pColor}">${row.profit}</td>
                    <td class="${tdText} text-xs text-gray-500 truncate max-w-[150px]" title="${row.remark || ''}">${row.remark || '-'}</td>
                    <td class="px-3 py-3 text-center flex gap-3 justify-center whitespace-nowrap opacity-70 group-hover:opacity-100 transition-opacity">
                        <button onclick="editRow(${row.id})" class="text-crypto hover:text-teal-400 transition transform hover:scale-125"><iconify-icon icon="solar:pen-bold" class="text-lg"></iconify-icon></button>
                        <button onclick="deleteRows([${row.id}])" class="text-danger hover:text-red-400 transition transform hover:scale-125"><iconify-icon icon="solar:trash-bin-trash-bold" class="text-lg"></iconify-icon></button>
                    </td>
                </tr>`;
        });
    }
}
// ==================== 導覽 ====================

function navigateTo(page) {
    ['dashboard', 'holdings', 'charts'].forEach(p => {
        document.getElementById(`page-${p}`).classList.toggle('hidden', p !== page);
        const btn = document.getElementById(`nav-${p}`);
        if (!btn) return;
        if (p === page) btn.classList.add('active');
        else { btn.classList.remove('active'); btn.querySelector('iconify-icon').style.color = ''; }
    });

    if (page === 'holdings') initHoldings();
    if (page === 'charts')   initCharts();
}
// ==================== 匯出 CSV ====================

async function exportCsv() {
    const tableMode = (viewMarket === '台股' || viewMarket === '美股') ? 'Stock' : 'Crypto';
    const btn = document.getElementById('btn-export');
    
    // 按鈕 loading 狀態
    btn.disabled = true;
    btn.innerHTML = `<iconify-icon icon="solar:refresh-bold-duotone" class="text-base animate-spin"></iconify-icon> 匯出中...`;

    const res = await API.exportCsv(tableMode);

    btn.disabled = false;
    btn.innerHTML = `<iconify-icon icon="solar:export-bold-duotone" class="text-base"></iconify-icon> 匯出 CSV`;

    if (res.status === 'success') {
        // 成功提示
        const toast = document.getElementById('toast');
        toast.innerText = `✅ 已匯出至桌面：${res.filename}`;
        toast.classList.remove('opacity-0', 'translate-y-2');
        toast.classList.add('opacity-100', 'translate-y-0');
        setTimeout(() => {
            toast.classList.remove('opacity-100', 'translate-y-0');
            toast.classList.add('opacity-0', 'translate-y-2');
        }, 3000);
    } else {
        alert('匯出失敗：' + res.message);
    }
}