// web/js/charts.js
// 圖表分析頁邏輯

let chartInstances = {};  // 存放所有 Chart.js 實例，方便之後銷毀重建
let holdingsForChart = [];
let cryptoNetUsdt = 0;
let cashTwd = 0;
let pieChartCurrency = 'TWD';

// ==================== 初始化 ====================

async function initCharts() {
    gsap.from("#page-charts", { y: 30, opacity: 0, duration: 0.8, ease: "power3.out" });
    await refreshCharts();
}

// ==================== 資料刷新 ====================

async function refreshCharts() {
    const res = await API.getChartData();
    if (res.status !== 'success') return;

    const d = res.data;
    renderStatCards(d.win_rate, d.best, d.worst);
    renderBarChart(d.monthly);
    renderRankChart(d.symbol_profit);
    renderLineChart(d.cumulative);

    // 持倉市值 + Crypto + 現金
    const [holdingsRes, cryptoRes, cashRes] = await Promise.all([
        API.getHoldings(),
        API.getCryptoNetValue(),
        API.getCash(),
    ]);
    holdingsForChart = holdingsRes?.data || [];
    cryptoNetUsdt = cryptoRes?.data || 0;
    cashTwd = cashRes?.data || 0;
    const cashInput = document.getElementById('cash-input');
    if (cashInput) cashInput.value = cashTwd || '';

    renderPieChart(computePieValues(pieChartCurrency));
    initCashInput();
}

// ==================== 工具函數 ====================

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function isDark() {
    return document.documentElement.classList.contains('dark');
}

function gridColor() {
    return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
}

function tickColor() {
    return isDark() ? '#9CA3AF' : '#6B7280';
}

function formatMonth(ym) {
    // YYYYMM → YYYY/MM
    return `${ym.slice(0, 4)}/${ym.slice(4, 6)}`;
}

function formatDate(d) {
    // YYYYMMDD → YYYY/MM/DD
    return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
}

// ==================== 統計卡 ====================

function renderStatCards(winRate, best, worst) {
    // 勝率環形進度
    const rate = winRate.rate || 0;
    document.getElementById('c-win-rate').innerText  = `${rate}%`;
    document.getElementById('c-wins').innerText      = winRate.wins;
    document.getElementById('c-losses').innerText    = winRate.losses;
    document.getElementById('c-total').innerText     = winRate.total;

    // 勝率圓環
    destroyChart('winRateChart');
    const ctx = document.getElementById('winRateChart').getContext('2d');
    chartInstances['winRateChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [winRate.wins, winRate.losses, Math.max(0, winRate.total - winRate.wins - winRate.losses)],
                backgroundColor: ['#0ECB81', '#FF6B6B', isDark() ? '#3E4651' : '#E5E7EB'],
                borderWidth: 0,
                hoverOffset: 4,
            }]
        },
        options: {
            cutout: '75%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true, duration: 1200 }
        }
    });

    // 最佳標的
    const bestProfit = best.profit || 0;
    document.getElementById('c-best-symbol').innerText = best.symbol || '--';
    document.getElementById('c-best-profit').innerText = (bestProfit >= 0
        ? `+${formatNum(bestProfit)}` : formatNum(bestProfit)) + ' TWD';
    document.getElementById('c-best-profit').className = `text-2xl font-extrabold table-num mt-1 ${bestProfit >= 0 ? 'text-success' : 'text-danger'}`;

    // 最差標的
    const worstProfit = worst.profit || 0;
    document.getElementById('c-worst-symbol').innerText = worst.symbol || '--';
    document.getElementById('c-worst-profit').innerText = (worstProfit >= 0
        ? `+${formatNum(worstProfit)}` : formatNum(worstProfit)) + ' TWD';
    document.getElementById('c-worst-profit').className = `text-2xl font-extrabold table-num mt-1 ${worstProfit >= 0 ? 'text-success' : 'text-danger'}`;
}

// ==================== 圓餅圖（市場資產配置）====================

function computePieValues(currency) {
    const rate = usdTwdRate || 31;
    let tw = 0, us = 0;
    holdingsForChart.forEach(h => {
        const lp = livePricesData[h.symbol];
        const price = lp ? lp.price : h.avg_cost;
        const value = h.qty * price;
        if (h.market === '台股')      tw += value;
        else if (h.market === '美股') us += value * rate;
    });
    // Crypto：以買入淨投入 USDT 估算（無即時報價）
    let crypto = cryptoNetUsdt * rate;
    let cash   = cashTwd;
    if (currency === 'USD') {
        tw     /= rate;
        us     /= rate;
        crypto /= rate;
        cash   /= rate;
    }
    return { tw, us, crypto, cash };
}

function fmtCompact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return Math.round(n).toString();
}

function updatePieCenter(total, sym) {
    const elVal = document.getElementById('pie-center-total');
    const elLbl = document.getElementById('pie-center-label');
    if (!elVal) return;
    if (total <= 0) { elVal.textContent = ''; elLbl.textContent = ''; return; }
    elVal.textContent = fmtCompact(total);
    elLbl.textContent = sym;
}

function renderPieLegend(filtered, total) {
    const el = document.getElementById('pie-legend');
    if (!el) return;
    const sym = pieChartCurrency === 'TWD' ? 'TWD' : 'USD';
    updatePieCenter(total, sym);
    if (filtered.length === 0) { el.innerHTML = ''; return; }
    const labelColor = isDark() ? '#D1D5DB' : '#374151';
    el.innerHTML = filtered.map(x => {
        const pct = total > 0 ? ((x.v / total) * 100).toFixed(1) : '0.0';
        return `<div class="flex items-center gap-2 whitespace-nowrap">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${x.c}"></span>
            <span class="text-xs font-bold w-12 flex-shrink-0" style="color:${labelColor}">${x.l}</span>
            <span class="text-xs table-num flex-shrink-0" style="color:${labelColor}">${formatNum(x.v, 0)}</span>
            <span class="text-xs text-gray-400 flex-shrink-0">${sym}</span>
            <span class="text-xs font-bold table-num w-10 text-right flex-shrink-0" style="color:${labelColor}">${pct}%</span>
        </div>`;
    }).join('');
}

function renderPieChart(values) {
    const allLabels = ['台股', '美股', 'Crypto', '現金'];
    const allColors = ['#26C0DB', '#A78BFA', '#4ECDC4', '#F59E0B'];
    const allData   = [values.tw, values.us, values.crypto, values.cash];
    const filtered  = allLabels.map((l, i) => ({ l, v: allData[i], c: allColors[i] })).filter(x => x.v > 0);
    const total     = filtered.reduce((s, x) => s + x.v, 0);

    if (total === 0) {
        document.getElementById('pie-empty').classList.remove('hidden');
        renderPieLegend([], 0);
        if (chartInstances['pieChart']) destroyChart('pieChart');
        return;
    }
    document.getElementById('pie-empty').classList.add('hidden');
    renderPieLegend(filtered, total);

    const sym = pieChartCurrency === 'TWD' ? 'TWD' : 'USD';
    const existing = chartInstances['pieChart'];
    if (existing) {
        existing.data.labels = filtered.map(x => x.l);
        existing.data.datasets[0].data = filtered.map(x => x.v);
        existing.data.datasets[0].backgroundColor = filtered.map(x => x.c);
        existing.data.datasets[0].borderColor = isDark() ? '#2B3139' : '#FFFFFF';
        existing.update();
        return;
    }

    const ctx = document.getElementById('pieChart').getContext('2d');
    chartInstances['pieChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: filtered.map(x => x.l),
            datasets: [{
                data: filtered.map(x => x.v),
                backgroundColor: filtered.map(x => x.c),
                borderColor: isDark() ? '#2B3139' : '#FFFFFF',
                borderWidth: 3,
                hoverOffset: 8,
            }]
        },
        options: {
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed;
                            const tot = ctx.chart.data.datasets[0].data.reduce((s, v) => s + v, 0);
                            const pct = ((val / tot) * 100).toFixed(1);
                            return ` ${ctx.label}：${formatNum(val, 0)} ${sym} (${pct}%)`;
                        }
                    }
                }
            },
            animation: { animateRotate: true, duration: 800, easing: 'easeInOutQuart' }
        }
    });
}

function setPieCurrency(currency) {
    pieChartCurrency = currency;
    const btnTwd    = document.getElementById('pie-btn-twd');
    const btnUsd    = document.getElementById('pie-btn-usd');
    const cashLabel = document.getElementById('cash-currency-label');
    const activeClass   = 'px-2 py-0.5 text-xs font-bold rounded-lg bg-primary text-white transition';
    const inactiveClass = 'px-2 py-0.5 text-xs font-bold rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition';
    if (currency === 'TWD') {
        btnTwd.className = activeClass;
        btnUsd.className = inactiveClass;
        if (cashLabel) cashLabel.textContent = 'TWD';
    } else {
        btnUsd.className = activeClass;
        btnTwd.className = inactiveClass;
        if (cashLabel) cashLabel.textContent = 'USD';
    }
    renderPieChart(computePieValues(currency));
}

async function confirmCash() {
    const input = document.getElementById('cash-input');
    cashTwd = parseFloat(input.value) || 0;
    await API.setCash(cashTwd);
    renderPieChart(computePieValues(pieChartCurrency));
}

function initCashInput() {
    const input = document.getElementById('cash-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmCash();
    });
}

// ==================== 長條圖（每月盈虧）====================

function renderBarChart(monthly) {
    destroyChart('barChart');
    const labels  = Object.keys(monthly).map(formatMonth);
    const twdData = Object.values(monthly).map(m => m.twd);
    const usdData = Object.values(monthly).map(m => m.usd);
    const cryData = Object.values(monthly).map(m => m.crypto);

    if (labels.length === 0) {
        document.getElementById('bar-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('bar-empty').classList.add('hidden');

    const ctx = document.getElementById('barChart').getContext('2d');
    chartInstances['barChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '台股 (TWD)',
                    data: twdData,
                    backgroundColor: (ctx) => ctx.raw >= 0 ? 'rgba(38,192,219,0.8)' : 'rgba(255,107,107,0.8)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
                {
                    label: '美股 (TWD換算)',
                    data: usdData,
                    backgroundColor: (ctx) => ctx.raw >= 0 ? 'rgba(167,139,250,0.8)' : 'rgba(255,107,107,0.6)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
                {
                    label: 'Crypto (TWD換算)',
                    data: cryData,
                    backgroundColor: (ctx) => ctx.raw >= 0 ? 'rgba(78,205,196,0.8)' : 'rgba(255,107,107,0.5)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: tickColor(),
                        font: { size: 12, weight: '600' },
                        usePointStyle: true,
                        pointStyleWidth: 8,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            const prefix = val >= 0 ? '+' : '';
                            return ` ${ctx.dataset.label}: ${prefix}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor() },
                    ticks: { color: tickColor(), font: { size: 11 } }
                },
                y: {
                    grid: { color: gridColor() },
                    ticks: {
                        color: tickColor(),
                        font: { size: 11 },
                        callback: (val) => val.toLocaleString('en-US')
                    }
                }
            }
        }
    });
}

// ==================== 橫向長條圖（標的排行）====================

function renderRankChart(symbolProfit) {
    destroyChart('rankChart');
    const entries = Object.entries(symbolProfit);

    if (entries.length === 0) {
        document.getElementById('rank-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('rank-empty').classList.add('hidden');

    // 取前10名（正負各排）
    const sorted  = entries.sort((a, b) => b[1] - a[1]);
    const top     = sorted.slice(0, 10);
    const labels  = top.map(e => e[0]);
    const values  = top.map(e => e[1]);
    const colors  = values.map(v => v >= 0 ? 'rgba(14,203,129,0.85)' : 'rgba(255,107,107,0.85)');

    const ctx = document.getElementById('rankChart').getContext('2d');
    chartInstances['rankChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.x;
                            const prefix = val >= 0 ? '+' : '';
                            return ` 盈虧: ${prefix}${val.toLocaleString('en-US', {minimumFractionDigits: 2})} TWD`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor() },
                    ticks: {
                        color: tickColor(),
                        font: { size: 11 },
                        callback: (val) => val.toLocaleString('en-US')
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: tickColor(), font: { size: 11, weight: '600' } }
                }
            }
        }
    });
}

// ==================== 折線圖（累積盈虧走勢，市場輪播）====================

const LINE_MARKETS = [
    { key: 'twd',    label: '台股',   unit: 'TWD',  color: '#26C0DB' },
    { key: 'usd',    label: '美股',   unit: 'USD',  color: '#A78BFA' },
    { key: 'crypto', label: 'Crypto', unit: 'USDT', color: '#4ECDC4' },
];
let lineChartIndex = 0;
let lineCumulativeData = {};

function renderLineChart(cumulative) {
    lineCumulativeData = cumulative;

    LINE_MARKETS.forEach(m => {
        destroyChart(`lineChart-${m.key}`);
        const data = cumulative[m.key] || [];
        const emptyEl = document.getElementById(`line-empty-${m.key}`);

        if (data.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }
        emptyEl.classList.add('hidden');

        const ctx = document.getElementById(`lineChart-${m.key}`).getContext('2d');
        const values = data.map(c => c.total);
        const lastVal = values[values.length - 1] || 0;
        const lineColor = lastVal >= 0 ? m.color : '#FF6B6B';

        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, lastVal >= 0 ? hexToRgba(m.color, 0.3) : 'rgba(255,107,107,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        chartInstances[`lineChart-${m.key}`] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(c => formatDate(c.date)),
                datasets: [{
                    label: `累積盈虧 (${m.unit})`,
                    data: values,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    pointRadius: data.length > 30 ? 0 : 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: lineColor,
                    fill: true,
                    tension: 0.4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed.y;
                                const prefix = val >= 0 ? '+' : '';
                                return ` 累積盈虧: ${prefix}${val.toLocaleString('en-US', {minimumFractionDigits: 2})} ${m.unit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor() },
                        ticks: { color: tickColor(), font: { size: 10 }, maxTicksLimit: 12 }
                    },
                    y: {
                        grid: { color: gridColor() },
                        ticks: {
                            color: tickColor(),
                            font: { size: 11 },
                            callback: (val) => val.toLocaleString('en-US')
                        }
                    }
                },
                animation: { duration: 1200, easing: 'easeInOutQuart' }
            }
        });
    });

    updateLineCarousel(false);
}

function updateLineCarousel(animate = true) {
    const track = document.getElementById('line-slide-track');
    const pct = lineChartIndex * -100;
    if (animate) {
        gsap.to(track, { x: `${pct}%`, duration: 0.4, ease: 'power2.inOut' });
    } else {
        gsap.set(track, { x: `${pct}%` });
    }

    document.getElementById('line-market-label').innerText = LINE_MARKETS[lineChartIndex].label;

    for (let i = 0; i < LINE_MARKETS.length; i++) {
        const dot = document.getElementById(`line-dot-${i}`);
        if (i === lineChartIndex) {
            dot.classList.add('bg-primary');
            dot.classList.remove('bg-gray-300', 'dark:bg-gray-600');
            dot.style.width = '16px';
        } else {
            dot.classList.remove('bg-primary');
            dot.classList.add('bg-gray-300');
            dot.style.width = '8px';
        }
    }
}

function lineChartNext() {
    lineChartIndex = (lineChartIndex + 1) % LINE_MARKETS.length;
    updateLineCarousel();
}

function lineChartPrev() {
    lineChartIndex = (lineChartIndex - 1 + LINE_MARKETS.length) % LINE_MARKETS.length;
    updateLineCarousel();
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}