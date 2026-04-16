// web/js/calendar.js
// 盈虧日曆頁 — Cell Expand 互動 + GSAP 動畫

const Calendar = (() => {

    // ==================== 狀態 ====================

    let calYear  = null;
    let calMonth = null;
    let calData  = null;   // get_calendar_data 回傳的資料
    let calYears = [];     // 可選年份清單
    let _calOpenedCell = null;
    let _calOriginX = 0;
    let _calOriginY = 0;
    let _calLoading = false;

    // ==================== 初始化 ====================

    async function initCalendar() {
        // 已初始化過就只重新渲染 header（避免切換頁面重複載入）
        if (calYear !== null) {
            _renderCalHeader();
            return;
        }

        const now = new Date();
        calYear  = now.getFullYear();
        calMonth = now.getMonth() + 1;

        // ★ 把 dropdown 搬到 body 最頂層，徹底脫離 glass 的 backdrop-filter 造成的 stacking context
        document.body.appendChild(document.getElementById('cal-year-dropdown'));
        document.body.appendChild(document.getElementById('cal-month-dropdown'));

        // 取得年份清單
        const yearsRes = await API.getCalendarYears();
        calYears = (yearsRes.status === 'success') ? yearsRes.data : [calYear];
        // 確保當前年在清單裡
        if (!calYears.includes(calYear)) calYears.push(calYear);
        calYears.sort((a, b) => a - b);

        await _loadAndRender(null);
    }

    // ==================== 資料載入 + 渲染 ====================

    async function _loadAndRender(direction) {
        if (_calLoading) return;
        _calLoading = true;

        const grid = document.getElementById('cal-grid');

        try {
            // 舊格子滑出
            if (direction && grid.children.length > 0) {
                await gsap.to(grid, {
                    x: direction === 'next' ? -24 : 24,
                    opacity: 0,
                    duration: 0.18,
                    ease: 'power2.in'
                });
            } else {
                gsap.set(grid, { x: 0, opacity: 1 });
            }

            const res = await API.getCalendarData(calYear, calMonth);
            if (res.status !== 'success') {
                showToast('日曆資料載入失敗', 'error');
                return;
            }
            calData = res.data;

            _renderCalHeader();
            _renderCalGrid(calData);

            // 新格子滑入
            gsap.fromTo(grid,
                { x: direction === 'next' ? 24 : (direction === 'prev' ? -24 : 0), opacity: 0 },
                { x: 0, opacity: 1, duration: 0.22, ease: 'power2.out' }
            );
        } finally {
            _calLoading = false;
        }
    }

    // ==================== Header ====================

    function _renderCalHeader() {
        document.getElementById('cal-year-display').textContent  = `${calYear} 年`;
        document.getElementById('cal-month-display').textContent = `${calMonth} 月`;

        const total = calData ? calData.monthly_total_twd : null;
        const el = document.getElementById('cal-monthly-total');
        if (total === null || total === undefined) {
            el.textContent = '--';
            el.className = 'text-2xl font-extrabold table-num text-gray-400 mt-0.5';
        } else {
            const sign = total >= 0 ? '+' : '';
            el.textContent = `${sign}${Math.round(total).toLocaleString()} TWD`;
            el.className = `text-2xl font-extrabold table-num mt-0.5 ${total >= 0 ? 'text-success' : 'text-danger'}`;
        }
    }

    // ==================== 日曆格子 ====================

    function _renderCalGrid(data) {
        const grid = document.getElementById('cal-grid');
        grid.innerHTML = '';

        const today = new Date();
        const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

        const firstWeekday = new Date(calYear, calMonth - 1, 1).getDay(); // 0=日
        const daysInMonth  = new Date(calYear, calMonth, 0).getDate();
        const numRows      = Math.ceil((firstWeekday + daysInMonth) / 7);
        const totalCells   = numRows * 7;

        // 讓每列等高填滿可用空間
        grid.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;

        for (let i = 0; i < totalCells; i++) {
            const dayNum = i - firstWeekday + 1;
            const inMonth = dayNum >= 1 && dayNum <= daysInMonth;

            const cell = document.createElement('div');
            cell.className = 'cal-cell relative rounded-xl flex flex-col p-2 transition-colors duration-200 overflow-hidden';

            if (!inMonth) {
                // 超出當月範圍：透明佔位
                cell.classList.add('pointer-events-none', 'opacity-0');
                grid.appendChild(cell);
                continue;
            }

            const dateStr  = `${calYear}${String(calMonth).padStart(2,'0')}${String(dayNum).padStart(2,'0')}`;
            const dayData  = data.days[dateStr];
            const isToday  = dateStr === todayStr;

            // 今天的框線
            if (isToday) {
                cell.classList.add('ring-2', 'ring-primary', 'ring-inset');
            }

            if (dayData) {
                // ── 有交易的格子 ──
                const profit   = dayData.total_twd;
                const isProfit = profit >= 0;
                const sign     = profit >= 0 ? '+' : '';
                const colorCls = isProfit ? 'text-success' : 'text-danger';

                cell.classList.add(
                    isProfit ? 'bg-success/10' : 'bg-danger/10',
                    'dark:' + (isProfit ? 'bg-success/15' : 'bg-danger/15'),
                    'cursor-pointer'
                );

                cell.innerHTML = `
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 leading-tight">${dayNum}</span>
                    <div class="flex-1 flex flex-col items-center justify-center gap-0.5">
                        <span class="text-xl font-extrabold table-num ${colorCls} leading-tight text-center">
                            ${sign}${Math.round(profit).toLocaleString()}
                        </span>
                        <span class="text-[11px] font-bold text-gray-400 dark:text-gray-500 tracking-wide">TWD</span>
                    </div>`;

                // Hover：微微上浮
                cell.addEventListener('mouseenter', () =>
                    gsap.to(cell, { y: -3, scale: 1.04, duration: 0.2, ease: 'power2.out' })
                );
                cell.addEventListener('mouseleave', () =>
                    gsap.to(cell, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' })
                );
                cell.addEventListener('click', () => _openDetail(dateStr, cell));

            } else {
                // ── 無交易的格子 ──
                cell.classList.add('bg-inputBgLight/40', 'dark:bg-inputBgDark/30');
                cell.innerHTML = `
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 leading-tight">${dayNum}</span>
                    <div class="flex-1 flex items-center justify-center">
                        <span class="text-base text-gray-200 dark:text-gray-700">—</span>
                    </div>`;
            }

            // 今天小圓點（右上角）
            if (isToday) {
                const dot = document.createElement('span');
                dot.className = 'absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary';
                cell.appendChild(dot);
            }

            grid.appendChild(cell);
        }

        // 格子依序 fade-in stagger
        gsap.fromTo('.cal-cell',
            { opacity: 0, scale: 0.94, y: 6 },
            { opacity: 1, scale: 1, y: 0, duration: 0.3, stagger: { each: 0.008, from: 'start' }, ease: 'power2.out' }
        );
    }

    // ==================== Cell Expand 詳細卡片 ====================

    function _openDetail(dateStr, cellEl) {
        if (document.getElementById('cal-overlay')) return;

        const dayData = calData && calData.days[dateStr];
        if (!dayData) return;

        _calOpenedCell = cellEl;

        // 計算動畫起點（格子中心 相對於 視窗中心的偏移）
        const rect = cellEl.getBoundingClientRect();
        _calOriginX = (rect.left + rect.width  / 2) - window.innerWidth  / 2;
        _calOriginY = (rect.top  + rect.height / 2) - window.innerHeight / 2;

        const month = parseInt(dateStr.slice(4, 6));
        const day   = parseInt(dateStr.slice(6, 8));
        const total = dayData.total_twd;
        const sign  = total >= 0 ? '+' : '';
        const colorCls = total >= 0 ? 'text-success' : 'text-danger';

        // 組合每筆交易的 HTML
        const tradesHtml = dayData.trades.map(t => {
            const tSign = t.profit_twd >= 0 ? '+' : '';
            const tColor = t.profit_twd >= 0 ? 'text-success' : 'text-danger';

            let priceHtml = '';
            let profitHtml = '';

            if (t.market === '台股') {
                priceHtml  = `@ ${(t.price_twd || 0).toLocaleString()} TWD`;
                profitHtml = `<div class="font-extrabold table-num text-sm ${tColor}">${tSign}${Math.round(t.profit_twd).toLocaleString()} <span class="text-xs font-bold opacity-60">TWD</span></div>`;
            } else {
                const uSign  = (t.profit_usd || 0) >= 0 ? '+' : '';
                const uColor = (t.profit_usd || 0) >= 0 ? 'text-success' : 'text-danger';
                priceHtml  = `@ $${(t.price_usd || 0).toFixed(2)}`;
                profitHtml = `
                    <div>
                        <div class="text-xs ${uColor} table-num text-right">${uSign}$${Math.abs(t.profit_usd || 0).toFixed(2)} <span class="opacity-60">USD</span></div>
                        <div class="font-extrabold table-num text-sm ${tColor} text-right">${tSign}${Math.round(t.profit_twd).toLocaleString()} <span class="text-xs font-bold opacity-60">TWD</span></div>
                    </div>`;
            }

            return `
                <div class="flex items-center justify-between py-2.5 border-b border-gray-200/60 dark:border-gray-600/40 last:border-0 gap-3">
                    <div class="min-w-0">
                        <div class="font-bold text-sm leading-tight">${escapeHtml(t.symbol)}</div>
                        <div class="text-xs text-gray-400 leading-tight mt-0.5">${escapeHtml(t.name)} · ${t.market}</div>
                        <div class="text-xs text-gray-400 leading-tight">${t.qty} 股 · ${priceHtml}</div>
                    </div>
                    <div class="flex-shrink-0 text-right">
                        ${profitHtml}
                    </div>
                </div>`;
        }).join('');

        // ── 建立 overlay（全用 inline style，不依賴 Tailwind class）──
        const overlay = document.createElement('div');
        overlay.id = 'cal-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0);
        `;
        overlay.addEventListener('click', e => { if (e.target === overlay) closeCalendarDetail(); });

        // ── 建立 card（全 inline style，不依賴 glass）──
        const card = document.createElement('div');
        card.id = 'cal-detail-card';
        const isDark = document.documentElement.classList.contains('dark');
        card.style.cssText = `
            background: ${isDark ? '#2B3139' : '#ffffff'};
            border: 1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'};
            border-radius: 16px;
            width: 360px;
            max-height: 78vh;
            overflow-y: auto;
            box-shadow: 0 25px 60px rgba(0,0,0,0.4);
        `;
        card.innerHTML = `
            <div class="p-5">
                <!-- 標題列 -->
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <div class="text-lg font-extrabold">${month} 月 ${day} 日</div>
                        <div class="text-xs text-gray-400 mt-0.5">${dayData.trades.length} 筆賣出</div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <div class="text-[10px] text-gray-400 uppercase tracking-wide">當日合計</div>
                            <div class="text-xl font-extrabold table-num ${colorCls}">${sign}${Math.round(total).toLocaleString()} <span class="text-xs font-bold opacity-60">TWD</span></div>
                        </div>
                        <button onclick="closeCalendarDetail()"
                            class="w-8 h-8 flex-shrink-0 rounded-full bg-inputBgLight dark:bg-inputBgDark flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors text-base font-bold leading-none">
                            ✕
                        </button>
                    </div>
                </div>
                <!-- 交易明細 -->
                <div>${tradesHtml}</div>
            </div>`;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // ── 動畫：背景漸入 + card 從格子位置展開 ──
        gsap.fromTo(overlay,
            { backgroundColor: 'rgba(0,0,0,0)' },
            { backgroundColor: 'rgba(0,0,0,0.6)', duration: 0.3, ease: 'power2.out' }
        );

        gsap.fromTo(card,
            { x: _calOriginX, y: _calOriginY, scale: 0.15, opacity: 0 },
            { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.35)' }
        );
    }

    function closeCalendarDetail() {
        const overlay = document.getElementById('cal-overlay');
        const card    = document.getElementById('cal-detail-card');
        if (!overlay || !card) return;

        gsap.to(overlay, { backgroundColor: 'rgba(0,0,0,0)', duration: 0.25, ease: 'power2.in' });
        gsap.to(card, {
            x: _calOriginX, y: _calOriginY, scale: 0.15, opacity: 0,
            duration: 0.3, ease: 'power2.in',
            onComplete: () => { overlay.remove(); _calOpenedCell = null; }
        });
    }

    // ==================== 月份導航 ====================

    function calPrevMonth() {
        calMonth--;
        if (calMonth < 1) { calMonth = 12; calYear--; }
        _loadAndRender('prev');
    }

    function calNextMonth() {
        calMonth++;
        if (calMonth > 12) { calMonth = 1; calYear++; }
        _loadAndRender('next');
    }

    // ==================== 年份 / 月份選擇器 ====================

    function toggleCalYearDropdown() {
        const dd  = document.getElementById('cal-year-dropdown');
        const btn = document.querySelector('[onclick="toggleCalYearDropdown()"]');
        const isHidden = dd.classList.contains('hidden');

        _closeCalMonthDropdown();

        if (isHidden) {
            dd.innerHTML = calYears.map(y => `
                <div onclick="calSelectYear(${y})"
                    class="px-4 py-2 text-sm font-bold cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors
                           ${y === calYear ? 'text-primary' : ''}">
                    ${y} 年
                </div>`).join('');

            // fixed 定位：對齊按鈕左下角
            const rect = btn.getBoundingClientRect();
            dd.style.top  = (rect.bottom + 4) + 'px';
            dd.style.left = rect.left + 'px';

            dd.classList.remove('hidden');
            gsap.fromTo(dd, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.2, ease: 'back.out(1.5)' });
        } else {
            _closeCalYearDropdown();
        }
    }

    function toggleCalMonthDropdown() {
        const dd  = document.getElementById('cal-month-dropdown');
        const btn = document.querySelector('[onclick="toggleCalMonthDropdown()"]');
        const isHidden = dd.classList.contains('hidden');

        _closeCalYearDropdown();

        if (isHidden) {
            // 月份固定 12 項，只在第一次建立
            if (!dd.dataset.built) {
                dd.innerHTML = Array.from({length: 12}, (_, i) => i + 1).map(m => `
                    <div onclick="calSelectMonth(${m})"
                        class="px-4 py-2 text-sm font-bold cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors">
                        ${m} 月
                    </div>`).join('');
                dd.dataset.built = '1';
            }

            // 每次開啟時更新當月 active 樣式
            dd.querySelectorAll('[onclick^="calSelectMonth"]').forEach((el, i) => {
                el.classList.toggle('text-primary', i + 1 === calMonth);
            });

            // fixed 定位：對齊按鈕左下角
            const rect = btn.getBoundingClientRect();
            dd.style.top  = (rect.bottom + 4) + 'px';
            dd.style.left = rect.left + 'px';

            dd.classList.remove('hidden');
            gsap.fromTo(dd, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.2, ease: 'back.out(1.5)' });
        } else {
            _closeCalMonthDropdown();
        }
    }

    function _closeCalYearDropdown() {
        const dd = document.getElementById('cal-year-dropdown');
        if (!dd || dd.classList.contains('hidden')) return;
        gsap.to(dd, { opacity: 0, y: -8, duration: 0.15, onComplete: () => dd.classList.add('hidden') });
    }

    function _closeCalMonthDropdown() {
        const dd = document.getElementById('cal-month-dropdown');
        if (!dd || dd.classList.contains('hidden')) return;
        gsap.to(dd, { opacity: 0, y: -8, duration: 0.15, onComplete: () => dd.classList.add('hidden') });
    }

    function calSelectYear(year) {
        calYear = parseInt(year);
        _closeCalYearDropdown();
        _loadAndRender(null);
    }

    function calSelectMonth(month) {
        calMonth = parseInt(month);
        _closeCalMonthDropdown();
        _loadAndRender(null);
    }

    // 點擊其他地方關閉選擇器
    document.addEventListener('click', e => {
        if (!e.target.closest('#cal-year-dropdown') && !e.target.closest('[onclick="toggleCalYearDropdown()"]')) {
            _closeCalYearDropdown();
        }
        if (!e.target.closest('#cal-month-dropdown') && !e.target.closest('[onclick="toggleCalMonthDropdown()"]')) {
            _closeCalMonthDropdown();
        }
    });

    // ==================== 公開介面 ====================
    return { initCalendar, closeCalendarDetail, calPrevMonth, calNextMonth,
             toggleCalYearDropdown, toggleCalMonthDropdown, calSelectYear, calSelectMonth };

})();

// 全域函式供 HTML onclick 使用
function initCalendar()              { Calendar.initCalendar(); }
function closeCalendarDetail()       { Calendar.closeCalendarDetail(); }
function calPrevMonth()              { Calendar.calPrevMonth(); }
function calNextMonth()              { Calendar.calNextMonth(); }
function toggleCalYearDropdown()     { Calendar.toggleCalYearDropdown(); }
function toggleCalMonthDropdown()    { Calendar.toggleCalMonthDropdown(); }
function calSelectYear(y)            { Calendar.calSelectYear(y); }
function calSelectMonth(m)           { Calendar.calSelectMonth(m); }
