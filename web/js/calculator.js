// web/js/calculator.js
// 投資小工具面板：匯率換算 + 股數試算

const Calculator = (() => {
    let isOpen = false;
    let exchangeRate = null;   // 快取匯率
    let calcUnit = 'TWD';      // 股數試算金額單位
    let lastStockSymbol = null; // 上次試算的股票代號（供刷新使用）
    let returnMode = 'forward'; // 報酬試算模式
    let returnUnit = 'TWD';     // 報酬試算幣別

    // ==================== 面板開關 ====================

    function togglePanel() {
        const panel = document.getElementById('calculator-panel');
        const navBtn = document.getElementById('nav-calculator');

        if (isOpen) {
            // 關閉動畫
            gsap.to(panel, {
                duration: 0.3,
                x: -20,
                opacity: 0,
                ease: 'power2.in',
                onComplete: () => {
                    panel.style.display = 'none';
                    gsap.set(panel, { x: 0, opacity: 1 });
                }
            });
            navBtn.classList.remove('active');
            isOpen = false;
        } else {
            // 開啟動畫
            panel.style.display = 'flex';
            gsap.fromTo(panel,
                { x: -30, opacity: 0 },
                { duration: 0.35, x: 0, opacity: 1, ease: 'back.out(1.4)' }
            );
            navBtn.classList.add('active');
            isOpen = true;

            // 若尚未載入匯率，自動抓一次
            if (exchangeRate === null) {
                loadExchangeRate();
            }
        }
    }

    // ==================== 匯率換算 ====================

    async function loadExchangeRate() {
        const res = await API.getExchangeRate();
        if (res.status === 'success') {
            exchangeRate = res.data.rate;
            updateSourceLabel(res.data.updated_at);
        }
    }

    function convertCurrency(source) {
        if (!exchangeRate) return;

        const twdEl = document.getElementById('calc-twd');
        const usdEl = document.getElementById('calc-usd');

        if (source === 'twd') {
            const val = parseFloat(twdEl.value);
            usdEl.value = isNaN(val) ? '' : (val / exchangeRate).toFixed(2);
        } else {
            const val = parseFloat(usdEl.value);
            twdEl.value = isNaN(val) ? '' : (val * exchangeRate).toFixed(2);
        }
    }

    function swapCurrency() {
        const twdEl = document.getElementById('calc-twd');
        const usdEl = document.getElementById('calc-usd');

        // 對調數值
        const tmp = twdEl.value;
        twdEl.value = usdEl.value;
        usdEl.value = tmp;

        // 旋轉 icon 動畫
        gsap.to('#swap-icon', { rotation: '+=180', duration: 0.3, ease: 'power2.out' });
    }

    // ==================== 股數試算 ====================

    function setCalcUnit(unit) {
        calcUnit = unit;
        document.getElementById('calc-amount-unit').textContent = unit;

        const twdBtn = document.getElementById('calc-unit-twd');
        const usdBtn = document.getElementById('calc-unit-usd');
        const activeClass = ['bg-primary', 'text-white', 'dark:text-bgDark'];
        const inactiveClass = ['text-gray-500', 'dark:text-gray-400', 'hover:text-gray-800', 'dark:hover:text-white'];

        if (unit === 'TWD') {
            twdBtn.classList.add(...activeClass);
            twdBtn.classList.remove(...inactiveClass);
            usdBtn.classList.remove(...activeClass);
            usdBtn.classList.add(...inactiveClass);
        } else {
            usdBtn.classList.add(...activeClass);
            usdBtn.classList.remove(...inactiveClass);
            twdBtn.classList.remove(...activeClass);
            twdBtn.classList.add(...inactiveClass);
        }
    }

    async function calcShares() {
        const symbol = document.getElementById('calc-symbol').value.trim().toUpperCase();
        const amount = parseFloat(document.getElementById('calc-amount').value);
        const resultEl = document.getElementById('calc-result');
        const errorEl = document.getElementById('calc-error');

        resultEl.classList.add('hidden');
        errorEl.classList.add('hidden');

        if (!symbol) { showError('請輸入股票代號'); return; }
        if (isNaN(amount) || amount <= 0) { showError('請輸入有效的投入金額'); return; }

        // 若輸入 TWD 且無匯率，先抓匯率
        if (calcUnit === 'TWD' && !exchangeRate) {
            await loadExchangeRate();
            if (!exchangeRate) { showError('無法取得匯率，請稍後再試'); return; }
        }

        // 抓股價
        const res = await API.getStockPrice(symbol);
        if (res.status !== 'success') { showError(res.message || '查詢失敗'); return; }

        lastStockSymbol = symbol;
        const stockPrice = res.data.price;
        updateSourceLabel(res.data.updated_at);

        // 換算
        const amountUSD = calcUnit === 'TWD' ? amount / exchangeRate : amount;
        const amountTWD = calcUnit === 'TWD' ? amount : amount * exchangeRate;
        const shares = Math.floor(amountUSD / stockPrice);
        const remainder = amountUSD - shares * stockPrice;

        // 顯示結果
        document.getElementById('res-twd').textContent = `${formatNum(amountTWD)} TWD`;
        document.getElementById('res-usd').textContent = `${formatNum(amountUSD)} USD`;
        document.getElementById('res-stock-label').textContent = `${symbol} 現價`;
        document.getElementById('res-price').textContent = `$${stockPrice.toFixed(2)} USD`;
        document.getElementById('res-shares').textContent = `${shares} 股`;
        document.getElementById('res-remainder').textContent = `$${remainder.toFixed(2)} USD`;

        resultEl.classList.remove('hidden');
        gsap.from(resultEl, { duration: 0.3, y: 8, opacity: 0, ease: 'power2.out' });
    }

    // ==================== 報酬試算 ====================

    function setReturnMode(mode) {
        returnMode = mode;
        const activeClass   = ['bg-primary', 'text-white', 'dark:text-bgDark'];
        const inactiveClass = ['text-gray-500', 'dark:text-gray-400', 'hover:text-gray-800', 'dark:hover:text-white'];
        const fwdBtn = document.getElementById('ret-mode-fwd');
        const revBtn = document.getElementById('ret-mode-rev');

        if (mode === 'forward') {
            fwdBtn.classList.add(...activeClass);    fwdBtn.classList.remove(...inactiveClass);
            revBtn.classList.remove(...activeClass); revBtn.classList.add(...inactiveClass);
            document.getElementById('ret-fwd-row').classList.remove('hidden');
            document.getElementById('ret-rev-row').classList.add('hidden');
        } else {
            revBtn.classList.add(...activeClass);    revBtn.classList.remove(...inactiveClass);
            fwdBtn.classList.remove(...activeClass); fwdBtn.classList.add(...inactiveClass);
            document.getElementById('ret-rev-row').classList.remove('hidden');
            document.getElementById('ret-fwd-row').classList.add('hidden');
        }
        calcReturn();
    }

    function setReturnUnit(unit) {
        returnUnit = unit;
        document.getElementById('ret-entry-unit').textContent = unit;

        const activeClass   = ['bg-primary', 'text-white', 'dark:text-bgDark'];
        const inactiveClass = ['text-gray-500', 'dark:text-gray-400', 'hover:text-gray-800', 'dark:hover:text-white'];
        const twdBtn = document.getElementById('ret-unit-twd');
        const usdBtn = document.getElementById('ret-unit-usd');

        if (unit === 'TWD') {
            twdBtn.classList.add(...activeClass);    twdBtn.classList.remove(...inactiveClass);
            usdBtn.classList.remove(...activeClass); usdBtn.classList.add(...inactiveClass);
        } else {
            usdBtn.classList.add(...activeClass);    usdBtn.classList.remove(...inactiveClass);
            twdBtn.classList.remove(...activeClass); twdBtn.classList.add(...inactiveClass);
        }
        calcReturn();
    }

    async function calcReturn() {
        const entry     = parseFloat(document.getElementById('ret-entry').value);
        const shares    = parseFloat(document.getElementById('ret-shares').value) || 0;
        const resultEl  = document.getElementById('ret-result');
        const isUSD     = returnUnit === 'USD';

        if (!entry || entry <= 0) { resultEl.classList.add('hidden'); return; }

        let rate, profit, target;

        if (returnMode === 'forward') {
            rate = parseFloat(document.getElementById('ret-rate-input').value);
            if (isNaN(rate)) { resultEl.classList.add('hidden'); return; }
            target = entry * (1 + rate / 100);
            profit = target - entry;
        } else {
            target = parseFloat(document.getElementById('ret-target-input').value);
            if (isNaN(target) || target <= 0) { resultEl.classList.add('hidden'); return; }
            profit = target - entry;
            rate   = (profit / entry) * 100;
        }

        const totalProfit = shares > 0 ? profit * shares : null;

        const isPos    = profit >= 0;
        const colorCls = isPos ? 'text-success' : 'text-danger';
        const bgCls    = isPos ? 'bg-success/10 dark:bg-success/15' : 'bg-danger/10 dark:bg-danger/15';
        const sign     = isPos ? '+' : '';

        // 格式化數字
        const fmtPrice  = v => isUSD ? `$${v.toFixed(2)}` : v.toLocaleString('en-US', {maximumFractionDigits: 2});
        const fmtProfit = v => isUSD ? `$${Math.abs(v).toFixed(2)}` : Math.abs(v).toLocaleString('en-US', {maximumFractionDigits: 0});

        // 主要結果區
        document.getElementById('ret-top-bg').className = `px-4 py-4 text-center ${bgCls}`;

        if (returnMode === 'forward') {
            document.getElementById('ret-main-label').textContent = '目標賣出價';
            document.getElementById('ret-main-value').textContent = `${fmtPrice(target)} ${returnUnit}`;
        } else {
            document.getElementById('ret-main-label').textContent = '報酬率';
            document.getElementById('ret-main-value').textContent = `${sign}${rate.toFixed(2)}%`;
        }
        document.getElementById('ret-main-value').className = `text-2xl font-extrabold table-num ${colorCls}`;

        // 次要資訊（左：每股獲利/虧損；右：另一個值）
        const perShareLabel = isPos ? '每股獲利' : '每股虧損';
        const perShareText  = `${sign}${fmtProfit(profit)} ${returnUnit}`;

        document.getElementById('ret-sub-label-l').textContent = perShareLabel;
        document.getElementById('ret-sub-value-l').textContent = perShareText;
        document.getElementById('ret-sub-value-l').className   = `text-sm font-extrabold table-num ${colorCls}`;

        if (returnMode === 'forward') {
            document.getElementById('ret-sub-label-r').textContent = '報酬率';
            document.getElementById('ret-sub-value-r').textContent = `${sign}${rate.toFixed(2)}%`;
        } else {
            document.getElementById('ret-sub-label-r').textContent = '目標賣出價';
            document.getElementById('ret-sub-value-r').textContent = `${fmtPrice(target)} ${returnUnit}`;
        }
        document.getElementById('ret-sub-value-r').className = `text-sm font-extrabold table-num ${colorCls}`;

        // 總獲利列（有股數時才顯示）
        const totalRow = document.getElementById('ret-total-row');
        if (totalProfit !== null) {
            const totalLabel = isPos ? '總獲利' : '總虧損';
            document.getElementById('ret-total-label').textContent = totalLabel;
            document.getElementById('ret-total-value').textContent = `${sign}${fmtProfit(totalProfit)} ${returnUnit}`;
            document.getElementById('ret-total-value').className = `text-xl font-extrabold table-num ${colorCls}`;
            totalRow.classList.remove('hidden');
        } else {
            totalRow.classList.add('hidden');
        }

        // 首次顯示加入動畫
        const wasHidden = resultEl.classList.contains('hidden');
        resultEl.classList.remove('hidden');
        if (wasHidden) gsap.from(resultEl, { duration: 0.3, y: 8, opacity: 0, ease: 'power2.out' });

        // USD 模式：顯示台幣換算
        const twdBlock = document.getElementById('ret-twd-block');
        if (isUSD) {
            if (!exchangeRate) await loadExchangeRate();
            if (exchangeRate) {
                const isPos = profit >= 0;
                const colorCls = isPos ? 'text-success' : 'text-danger';
                const sign = isPos ? '+' : '';

                const targetTWD = target * exchangeRate;
                const profitTWD = profit * exchangeRate;

                document.getElementById('ret-twd-target-label').textContent = '目標賣出價約';
                document.getElementById('ret-twd-target-value').textContent =
                    `${targetTWD.toLocaleString('en-US', {maximumFractionDigits: 0})} TWD`;
                document.getElementById('ret-twd-target-value').className = 'text-sm font-extrabold table-num';

                const profitLbl = isPos ? '每股獲利約' : '每股虧損約';
                document.getElementById('ret-twd-profit-label').textContent = profitLbl;
                document.getElementById('ret-twd-profit-value').textContent =
                    `${sign}${Math.abs(profitTWD).toLocaleString('en-US', {maximumFractionDigits: 0})} TWD`;
                document.getElementById('ret-twd-profit-value').className = `text-sm font-extrabold table-num ${colorCls}`;

                // 總獲利 TWD
                const twdTotalRow = document.getElementById('ret-twd-total-row');
                if (totalProfit !== null) {
                    const totalProfitTWD = totalProfit * exchangeRate;
                    document.getElementById('ret-twd-total-value').textContent =
                        `${sign}${Math.abs(totalProfitTWD).toLocaleString('en-US', {maximumFractionDigits: 0})} TWD`;
                    document.getElementById('ret-twd-total-value').className = `text-sm font-extrabold table-num ${colorCls}`;
                    twdTotalRow.style.display = 'flex';
                } else {
                    twdTotalRow.style.display = 'none';
                }

                document.getElementById('ret-twd-rate-note').textContent =
                    `1 USD = ${exchangeRate.toFixed(2)} TWD`;

                if (twdBlock.classList.contains('hidden')) {
                    twdBlock.classList.remove('hidden');
                    gsap.from(twdBlock, { duration: 0.25, y: 6, opacity: 0, ease: 'power2.out' });
                }
            }
        } else {
            twdBlock.classList.add('hidden');
        }
    }

    // ==================== 全部刷新 ====================

    async function refreshAll() {
        const icon = document.getElementById('refresh-icon');
        gsap.to(icon, { rotation: 360, duration: 0.6, ease: 'power2.out', onComplete: () => gsap.set(icon, { rotation: 0 }) });

        // 刷新匯率
        await loadExchangeRate();

        // 若匯率換算框有值，重新換算
        const twdVal = document.getElementById('calc-twd').value;
        if (twdVal) convertCurrency('twd');

        // 若之前有試算過股票，重新試算
        if (lastStockSymbol) {
            document.getElementById('calc-symbol').value = lastStockSymbol;
            await calcShares();
        }

        // 重新觸發報酬試算（更新台幣換算區塊的匯率）
        calcReturn();
    }

    // ==================== 工具函式 ====================

    function updateSourceLabel(time) {
        document.getElementById('calc-source-label').textContent = `Yahoo Finance · 更新於 ${time}`;
    }

    function showError(msg) {
        const el = document.getElementById('calc-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function formatNum(n) {
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ==================== 公開介面 ====================
    return { togglePanel, convertCurrency, swapCurrency, setCalcUnit, calcShares, refreshAll,
             setReturnMode, setReturnUnit, calcReturn };
})();

// 防止滾輪意外改變 number 輸入框的數值
document.addEventListener('wheel', () => {
    if (document.activeElement?.type === 'number') {
        document.activeElement.blur();
    }
}, { passive: true });

// 全域函式供 HTML onclick 使用
function toggleCalculatorPanel() { Calculator.togglePanel(); }
function convertCurrency(source) { Calculator.convertCurrency(source); }
function swapCurrency() { Calculator.swapCurrency(); }
function setCalcUnit(unit) { Calculator.setCalcUnit(unit); }
function calcShares() { Calculator.calcShares(); }
function refreshAll() { Calculator.refreshAll(); }
function setReturnMode(mode) { Calculator.setReturnMode(mode); }
function setReturnUnit(unit) { Calculator.setReturnUnit(unit); }
function calcReturn() { Calculator.calcReturn(); }
