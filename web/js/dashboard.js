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
let pageSize = 20;
let currentPage = 1;
let currentPageIds = [];

// ==================== 初始化 ====================

async function initDashboard() {
    gsap.from("#sidebar", { x: -50, opacity: 0, duration: 0.8, ease: "power3.out" });
    gsap.from("#stats-cards > div", { y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) closeAllDropdowns();
    });

    renderForm();
    initSearchPickers();
    await refreshData();
    refreshDashboardLivePrices();
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

    // 切換市場時清除搜尋與日期篩選
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    document.getElementById('btn-clear-search')?.classList.add('hidden');
    if (fpSearch.length) fpSearch.forEach(fp => fp.clear());
    document.getElementById('btn-clear-date')?.classList.add('hidden');

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
    currentPage = 1;

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

// ==================== 欄位驗證 ====================

function showFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    if (!input) return;

    input.classList.add('!border-danger');

    let errorEl = document.getElementById(`${fieldId}-error`);
    if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.id = `${fieldId}-error`;
        input.parentNode.appendChild(errorEl);
    }
    errorEl.className = 'text-danger text-xs mt-1 ml-1 flex items-center gap-1';
    errorEl.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold-duotone" class="text-sm flex-shrink-0"></iconify-icon>${message}`;

    input.addEventListener('input', () => clearFieldError(fieldId), { once: true });
}

function clearFieldError(fieldId) {
    const input = document.getElementById(fieldId);
    if (input) input.classList.remove('!border-danger');
    document.getElementById(`${fieldId}-error`)?.remove();
}

// ==================== 儲存 / 編輯 / 取消 ====================

async function saveRecord() {
    let data = {};
    const isStockMode = (inputMarket === '台股' || inputMarket === '美股');

    try {
        if (isStockMode) {
            const symbol = document.getElementById('f_symbol').value.trim();
            const qty    = parseFloat(document.getElementById('f_qty').value);
            const price  = parseFloat(document.getElementById('f_price').value);

            let valid = true;
            if (!symbol)      { showFieldError('f_symbol', '請輸入股票代碼'); valid = false; }
            if (!(qty  > 0))  { showFieldError('f_qty',    '數量必須大於 0'); valid = false; }
            if (!(price > 0)) { showFieldError('f_price',  '單價必須大於 0'); valid = false; }
            if (!valid) return;

            data = {
                date: document.getElementById('f_date').value,
                market: inputMarket,
                symbol: symbol.toUpperCase(),
                name: document.getElementById('f_name').value,
                action: document.getElementById('f_action').value,
                qty: qty,
                price_twd: inputMarket === '台股' ? price : 0,
                price_usd: inputMarket === '美股' ? price : 0,
                actual_twd: parseFloat(document.getElementById('f_actual_twd').value || 0),
                fee: parseFloat(document.getElementById('f_fee').value || 0),
                profit: 0,
                remark: document.getElementById('f_remark').value
            };
        } else {
            const cSymbol = document.getElementById('f_c_symbol').value.trim();
            const cPrice  = parseFloat(document.getElementById('f_c_price').value);

            let valid = true;
            if (!cSymbol)      { showFieldError('f_c_symbol', '請輸入幣種代碼'); valid = false; }
            if (!(cPrice > 0)) { showFieldError('f_c_price',  '成交金額必須大於 0'); valid = false; }
            if (!valid) return;

            data = {
                dt: document.getElementById('f_dt').value,
                symbol: cSymbol.toUpperCase(),
                action: document.getElementById('f_c_action').value,
                price: cPrice,
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
            showToast(`儲存失敗：${res.message || '未知錯誤'}`, 'error');
        }
    } catch (e) {
        showToast('請檢查欄位格式是否正確！', 'error');
    }
}

function editRow(id) {
    const row = allRecords.find(r => r.id === id);

    const targetMarket = (viewMarket === 'Crypto') ? 'Crypto' : row.market;
    if (inputMarket !== targetMarket) setInputMarket(targetMarket);

    editingId = id;

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

    setSaveButtonState(true);
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('sidebar').scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    renderForm();
    setSaveButtonState(false);
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

function setSaveButtonState(isEditing) {
    const btn = document.getElementById('btn-save');
    const base = 'w-full mt-6 font-bold py-3.5 rounded-xl transition transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex justify-center items-center gap-2 text-base text-white dark:text-bgDark';
    if (isEditing) {
        btn.className = `${base} bg-purple-500 hover:bg-purple-400`;
        btn.innerHTML = `<iconify-icon icon="solar:pen-bold" class="text-xl"></iconify-icon> 更新紀錄`;
    } else {
        const color = inputMarket === 'Crypto' ? 'bg-crypto hover:bg-teal-400' : 'bg-primary hover:bg-cyan-400';
        btn.className = `${base} ${color}`;
        btn.innerHTML = `<iconify-icon icon="solar:diskette-bold" class="text-xl"></iconify-icon> 儲存紀錄`;
    }
}

// ==================== 刪除 ====================

async function deleteRows(ids) {
    if (!confirm("確定要刪除嗎？")) return;
    const tableMode = (viewMarket === '台股' || viewMarket === '美股') ? 'Stock' : 'Crypto';
    const res = await API.deleteRecords(tableMode, ids);
    if (res.status === 'success') {
        await refreshData();
    } else {
        showToast(`刪除失敗：${res.message || '未知錯誤'}`, 'error');
    }
}

async function deleteSelected() {
    if (selectedRows.size === 0) return;
    if (confirm(`確定要刪除這 ${selectedRows.size} 筆紀錄嗎？`)) {
        const tableMode = (viewMarket === '台股' || viewMarket === '美股') ? 'Stock' : 'Crypto';
        const res = await API.deleteRecords(tableMode, Array.from(selectedRows));
        if (res.status === 'success') {
            selectedRows.clear();
            updateBatchDeleteButton();
            await refreshData();
        } else {
            showToast(`刪除失敗：${res.message || '未知錯誤'}`, 'error');
        }
    }
}

// ==================== 表格 ====================

function handleSort(col) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = false; }
    currentPage = 1;
    renderTable();
}

function toggleRowSelection(cb) {
    const val = parseInt(cb.value);
    if (cb.checked) selectedRows.add(val);
    else selectedRows.delete(val);
    updateBatchDeleteButton();
}

function toggleSelectAll(cb) {
    if (cb.checked) currentPageIds.forEach(id => selectedRows.add(id));
    else currentPageIds.forEach(id => selectedRows.delete(id));
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

    // 搜尋篩選
    const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    if (searchVal) {
        displayData = displayData.filter(r =>
            (r.symbol || '').toLowerCase().includes(searchVal) ||
            (r.name   || '').toLowerCase().includes(searchVal) ||
            (r.remark || '').toLowerCase().includes(searchVal)
        );
        document.getElementById('btn-clear-search').classList.toggle('hidden', !searchVal);
    }

    // 日期範圍篩選
    const dateStart = document.getElementById('filter-date-start')?.value || '';
    const dateEnd   = document.getElementById('filter-date-end')?.value   || '';
    if (dateStart) {
        displayData = displayData.filter(r => (r.date || r.dt || '') >= dateStart);
        document.getElementById('btn-clear-date').classList.remove('hidden');
    }
    if (dateEnd) {
        displayData = displayData.filter(r => (r.date || r.dt || '') <= dateEnd);
        document.getElementById('btn-clear-date').classList.remove('hidden');
    }

    displayData.sort((a, b) => {
        let valA = a[sortCol] || '';
        let valB = b[sortCol] || '';
        if (typeof valA === 'string') return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return sortAsc ? valA - valB : valB - valA;
    });

    // ── 分頁 ──
    const totalItems = displayData.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * pageSize;
    const pagedData = displayData.slice(startIdx, startIdx + pageSize);
    currentPageIds = pagedData.map(r => r.id);

    const allChecked = pagedData.length > 0 && pagedData.every(r => selectedRows.has(r.id));
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
            ${getTh(`盈虧(${currency})`, 'profit')}
            <th class="px-3 py-3 text-center whitespace-nowrap">備註</th>
            <th class="px-3 py-3 text-center whitespace-nowrap">操作</th>
        </tr>`;

        let rowsHtml = '';
        pagedData.forEach(row => {
            const price = viewMarket === '台股' ? row.price_twd : row.price_usd;
            const pColor = row.profit > 0 ? 'text-success' : (row.profit < 0 ? 'text-danger' : 'text-gray-500 dark:text-gray-400');
            const isChecked = selectedRows.has(row.id) ? 'checked' : '';
            const symbolColor = viewMarket === '台股' ? 'color: #26C0DB' : 'color: #A78BFA';
            let profitDisplay;
            if (row.action === '賣出') {
                const costBasis = row.total_cost - row.profit;
                const pct = costBasis > 0 ? row.profit / costBasis * 100 : 0;
                const pctSign = pct > 0 ? '+' : '';
                profitDisplay = `<span class="${pColor}">${row.profit > 0 ? '+' : ''}${formatNum(row.profit)} (${pctSign}${pct.toFixed(2)}%)</span>`;
            } else {
                profitDisplay = `<span class="text-gray-400">-</span>`;
            }
            rowsHtml += `
                <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors group">
                    <td class="px-4 py-3 text-center"><input type="checkbox" value="${row.id}" onchange="toggleRowSelection(this)" ${isChecked}></td>
                    <td class="${tdText}">${formatDateStr(row.date)}</td>
                    <td class="${tdText} font-bold" style="${symbolColor}">${row.symbol}</td>
                    <td class="${tdText}">${row.name || '-'}</td>
                    <td class="${tdNum}">${row.qty}</td>
                    <td class="${tdNum} font-bold text-yellow-400 dark:text-yellow-300">${price}</td>
                    <td class="${tdNum} font-bold text-purple-500 dark:text-purple-400">${formatNum(row.total_cost)}</td>
                    <td class="${tdNum}">${row.actual_twd}</td>
                    <td class="${tdNum}">${row.fee}</td>
                    <td class="${tdNum} font-bold ${pColor}">${profitDisplay}</td>
                    <td class="${tdText} text-xs text-gray-500 truncate max-w-[120px]" title="${escapeHtml(row.remark)}">${escapeHtml(row.remark) || '-'}</td>
                    <td class="px-3 py-3 text-center flex gap-3 justify-center whitespace-nowrap opacity-70 group-hover:opacity-100 transition-opacity">
                        <button onclick="editRow(${row.id})" class="text-primary hover:text-cyan-400 transition transform hover:scale-125"><iconify-icon icon="solar:pen-bold" class="text-lg"></iconify-icon></button>
                        <button onclick="deleteRows([${row.id}])" class="text-danger hover:text-red-400 transition transform hover:scale-125"><iconify-icon icon="solar:trash-bin-trash-bold" class="text-lg"></iconify-icon></button>
                    </td>
                </tr>`;
        });
        body.innerHTML = rowsHtml;
    } else {
        head.innerHTML = `<tr>${chkHead}
            ${getTh('時間', 'dt')} ${getTh('幣種', 'symbol')}
            ${getTh('成交金額(USDT)', 'price')} ${getTh('盈虧(USDT)', 'profit')}
            <th class="px-3 py-3 text-center whitespace-nowrap">備註</th>
            <th class="px-3 py-3 text-center whitespace-nowrap">操作</th>
        </tr>`;

        let rowsHtml = '';
        pagedData.forEach(row => {
            const pColor = row.profit > 0 ? 'text-success' : (row.profit < 0 ? 'text-danger' : 'text-gray-500 dark:text-gray-400');
            const isChecked = selectedRows.has(row.id) ? 'checked' : '';
            let profitDisplay;
            if (row.action === '賣出') {
                const costBasis = row.price - row.profit;
                const pct = costBasis > 0 ? row.profit / costBasis * 100 : 0;
                const pctSign = pct > 0 ? '+' : '';
                profitDisplay = `<span class="${pColor}">${row.profit > 0 ? '+' : ''}${formatNum(row.profit)} (${pctSign}${pct.toFixed(2)}%)</span>`;
            } else {
                profitDisplay = `<span class="text-gray-400">-</span>`;
            }
            rowsHtml += `
                <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-inputBgLight/60 dark:hover:bg-inputBgDark/60 transition-colors group">
                    <td class="px-4 py-3 text-center"><input type="checkbox" value="${row.id}" onchange="toggleRowSelection(this)" ${isChecked}></td>
                    <td class="${tdText}">${row.dt}</td>
                    <td class="${tdText} font-bold text-crypto tracking-wide">${row.symbol}</td>
                    <td class="${tdNum}">${row.price}</td>
                    <td class="${tdNum} font-bold ${pColor}">${profitDisplay}</td>
                    <td class="${tdText} text-xs text-gray-500 truncate max-w-[150px]" title="${escapeHtml(row.remark)}">${escapeHtml(row.remark) || '-'}</td>
                    <td class="px-3 py-3 text-center flex gap-3 justify-center whitespace-nowrap opacity-70 group-hover:opacity-100 transition-opacity">
                        <button onclick="editRow(${row.id})" class="text-crypto hover:text-teal-400 transition transform hover:scale-125"><iconify-icon icon="solar:pen-bold" class="text-lg"></iconify-icon></button>
                        <button onclick="deleteRows([${row.id}])" class="text-danger hover:text-red-400 transition transform hover:scale-125"><iconify-icon icon="solar:trash-bin-trash-bold" class="text-lg"></iconify-icon></button>
                    </td>
                </tr>`;
        });
        body.innerHTML = rowsHtml;
    }

    renderPaginationBar(totalItems, totalPages);
}

// ==================== 分頁 ====================

function renderPaginationBar(totalItems, totalPages) {
    const bar = document.getElementById('pagination-bar');
    if (!bar) return;

    if (totalItems === 0) { bar.innerHTML = ''; return; }

    const btnBase = 'min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-colors';
    const btnActive = `${btnBase} bg-primary text-white dark:text-bgDark`;
    const btnInactive = `${btnBase} text-gray-500 dark:text-gray-400 hover:bg-inputBgLight dark:hover:bg-inputBgDark`;
    const btnDisabled = `${btnBase} text-gray-300 dark:text-gray-600 cursor-not-allowed`;

    // 頁碼按鈕（最多顯示 5 頁，超過用 ...）
    let pageButtons = '';
    const delta = 2;
    const start = Math.max(1, currentPage - delta);
    const end = Math.min(totalPages, currentPage + delta);

    if (start > 1) {
        pageButtons += `<button onclick="goToPage(1)" class="${1 === currentPage ? btnActive : btnInactive}">1</button>`;
        if (start > 2) pageButtons += `<span class="text-gray-400 text-xs px-1">…</span>`;
    }
    for (let i = start; i <= end; i++) {
        pageButtons += `<button onclick="goToPage(${i})" class="${i === currentPage ? btnActive : btnInactive}">${i}</button>`;
    }
    if (end < totalPages) {
        if (end < totalPages - 1) pageButtons += `<span class="text-gray-400 text-xs px-1">…</span>`;
        pageButtons += `<button onclick="goToPage(${totalPages})" class="${totalPages === currentPage ? btnActive : btnInactive}">${totalPages}</button>`;
    }

    const sizeOptions = [10, 20, 50].map(n =>
        `<option value="${n}" ${pageSize === n ? 'selected' : ''}>${n} 筆／頁</option>`
    ).join('');

    const startCount = (currentPage - 1) * pageSize + 1;
    const endCount = Math.min(currentPage * pageSize, totalItems);

    bar.innerHTML = `
        <span class="text-xs text-gray-400">${startCount}–${endCount} / 共 ${totalItems} 筆</span>
        <div class="flex items-center gap-1">
            <button onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="${currentPage <= 1 ? btnDisabled : btnInactive}">‹</button>
            ${pageButtons}
            <button onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} class="${currentPage >= totalPages ? btnDisabled : btnInactive}">›</button>
        </div>
        <select onchange="setPageSize(this.value)"
            class="text-xs font-bold bg-inputBgLight dark:bg-inputBgDark text-gray-600 dark:text-gray-300 rounded-lg px-2 h-8 border border-transparent outline-none cursor-pointer">
            ${sizeOptions}
        </select>`;
}

function goToPage(page) {
    currentPage = page;
    renderTable();
}

function setPageSize(size) {
    pageSize = parseInt(size);
    currentPage = 1;
    renderTable();
}

function onSearchInput() {
    currentPage = 1;
    renderTable();
}

// ==================== 導覽 ====================

function navigateTo(page) {
    const pages = ['dashboard', 'holdings', 'charts', 'stockprofit', 'calendar'];
    pages.forEach(p => {
        document.getElementById(`page-${p}`).classList.toggle('hidden', p !== page);
        const btn = document.getElementById(`nav-${p}`);
        if (!btn) return;
        if (p === page) btn.classList.add('active');
        else { btn.classList.remove('active'); btn.querySelector('iconify-icon').style.color = ''; }
    });

    // 日曆頁整頁顯示，隱藏左側輸入區
    const sidebar = document.getElementById('sidebar');
    if (page === 'calendar') {
        gsap.to(sidebar, { width: 0, opacity: 0, padding: 0, marginRight: 0, duration: 0.25, ease: 'power2.inOut',
            onComplete: () => sidebar.classList.add('hidden') });
    } else {
        sidebar.classList.remove('hidden');
        gsap.to(sidebar, { width: 320, opacity: 1, padding: '', marginRight: '', duration: 0.25, ease: 'power2.inOut' });
    }

    if (page === 'holdings')    initHoldings();
    if (page === 'charts')      initCharts();
    if (page === 'stockprofit') initStockProfit();
    if (page === 'calendar')    initCalendar();
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
        showToast(`已匯出：${res.filename}`, 'success');
    } else if (res.status === 'cancelled') {
        // 使用者關閉對話框，不顯示任何提示
    } else {
        showToast(`匯出失敗：${res.message}`, 'error');
    }
}
// ==================== 搜尋/篩選 ====================

let fpSearch = [];

function initSearchPickers() {
    fpSearch.forEach(fp => fp.destroy());
    fpSearch = [];

    const config = { dateFormat: 'Ymd', allowInput: true, onChange: () => renderTable() };
    const s = flatpickr('#filter-date-start', config);
    const e = flatpickr('#filter-date-end', config);
    fpSearch = [s, e];
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('btn-clear-search').classList.add('hidden');
    renderTable();
}

function clearDateFilter() {
    fpSearch.forEach(fp => fp.clear());
    document.getElementById('btn-clear-date').classList.add('hidden');
    renderTable();
}

// ==================== Dashboard 未實現盈虧 ====================

async function refreshDashboardLivePrices() {
    await refreshLivePrices();
    updateDashboardUnrealized();
}

function updateDashboardUnrealized() {
    // 需要持倉資料才能計算，直接從後端取
    API.getHoldings().then(res => {
        if (res.status !== 'success') return;
        const holdings = res.data;

        let twUnrealized = 0;
        let usUnrealizedUsd = 0;

        holdings.forEach(h => {
            const lp = livePricesData[h.symbol];
            if (!lp || lp.price == null) return;
            const unrealized = (lp.price - h.avg_cost) * h.qty;
            if (h.market === '台股') twUnrealized += unrealized;
            else if (h.market === '美股') usUnrealizedUsd += unrealized;
        });

        const twEl       = document.getElementById('dash-tw-unrealized');
        const usUsdEl    = document.getElementById('dash-us-unrealized-usd');
        const usTwdEl    = document.getElementById('dash-us-unrealized-twd');
        const rateEl     = document.getElementById('dash-usdtwd-rate');

        if (twEl) {
            const sign = twUnrealized >= 0 ? '+' : '';
            twEl.innerText = `${sign}${formatNum(twUnrealized, 0)} TWD`;
            twEl.className = `text-xl font-extrabold table-num ${twUnrealized >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (usUsdEl) {
            const sign = usUnrealizedUsd >= 0 ? '+' : '';
            usUsdEl.innerText = `${sign}${formatNum(usUnrealizedUsd)} USD`;
            usUsdEl.className = `text-xl font-extrabold table-num ${usUnrealizedUsd >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (usTwdEl && usdTwdRate) {
            const twd  = usUnrealizedUsd * usdTwdRate;
            const sign = twd >= 0 ? '+' : '';
            usTwdEl.innerText = `≈ ${sign}${formatNum(twd, 0)} TWD`;
            usTwdEl.className = `text-xs table-num ${twd >= 0 ? 'text-success/70' : 'text-danger/70'}`;
        }
        if (rateEl && usdTwdRate) {
            rateEl.innerText = `匯率 ${usdTwdRate.toFixed(2)}`;
        }
    });
}