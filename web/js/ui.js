// web/js/ui.js
// 共用的 UI 工具函數

// ==================== 主題切換 ====================

let isDarkMode = localStorage.getItem('theme') !== 'light';

function applyTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if (isDarkMode) {
        html.classList.add('dark');
        document.getElementById('flatpickr-theme').href = "https://npmcdn.com/flatpickr/dist/themes/dark.css";
    } else {
        html.classList.remove('dark');
        document.getElementById('flatpickr-theme').href = "https://npmcdn.com/flatpickr/dist/themes/light.css";
    }
    if (icon) icon.setAttribute('icon', isDarkMode ? 'solar:moon-stars-bold-duotone' : 'solar:sun-bold-duotone');
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    const icon = document.getElementById('theme-icon');

    gsap.to(icon, {
        rotation: "+=360", scale: 0, duration: 0.25,
        onComplete: () => {
            applyTheme();
            gsap.to(icon, { scale: 1, duration: 0.4, ease: "back.out(1.5)" });
            // 若圖表頁在顯示中，重新繪製以套用新主題顏色
            if (!document.getElementById('page-charts').classList.contains('hidden')) {
                refreshCharts();
            }
        }
    });
}

// ==================== 數字動畫 ====================

function animateValue(id, endValue, currency) {
    let el = document.getElementById(id);
    if (!el) return;
    let obj = { val: parseFloat(el.innerText.replace(/[^0-9.-]+/g, "")) || 0 };

    let minDecimals = currency === 'TWD' ? 0 : 1;
    let maxDecimals = currency === 'TWD' ? 0 : 1;

    gsap.fromTo(el, { scale: 1.1 }, { scale: 1, duration: 0.6, ease: "back.out(2)" });
    gsap.to(obj, {
        val: endValue, duration: 1.5, ease: "power2.out",
        onUpdate: () => {
            let prefix = obj.val > 0 ? "+" : "";
            let formattedStr = `${prefix}${obj.val.toLocaleString('en-US', {
                minimumFractionDigits: minDecimals,
                maximumFractionDigits: maxDecimals
            })}`;
            el.innerText = formattedStr;

            let len = formattedStr.length;
            let fontSizeClass = "text-4xl lg:text-5xl";
            if (len >= 13) fontSizeClass = "text-2xl lg:text-3xl";
            else if (len >= 10) fontSizeClass = "text-3xl lg:text-4xl";

            el.className = `${fontSizeClass} font-bold mt-4 table-num stat-value transition-all duration-300 ${obj.val >= 0 ? 'text-success' : 'text-danger'}`;
        }
    });
}

// ==================== 下拉選單 ====================

function createDropdown(id, options, defaultVal) {
    let optsHtml = options.map(o => `
        <li onclick="selectOption('${id}', '${o}')" class="px-4 py-2 hover:bg-primary/20 cursor-pointer transition-colors flex items-center gap-2">
            <iconify-icon icon="${o === '買入' ? 'solar:cart-large-minimalistic-bold-duotone' : 'solar:tag-price-bold-duotone'}" class="text-primary"></iconify-icon>${o}
        </li>`).join('');

    return `<div class="relative custom-dropdown z-20 w-full" id="dropdown-wrap-${id}">
        <div class="sync-h w-full px-3 bg-inputBgLight dark:bg-inputBgDark text-gray-800 dark:text-white rounded-xl border border-transparent hover:border-primary transition-all shadow-sm cursor-pointer text-sm font-medium" onclick="toggleDropdown('${id}')">
            <span id="${id}-text" class="flex items-center gap-1.5">
                <iconify-icon icon="${defaultVal === '買入' ? 'solar:cart-large-minimalistic-bold-duotone' : 'solar:tag-price-bold-duotone'}" class="text-primary"></iconify-icon>${defaultVal}
            </span>
            <iconify-icon icon="solar:alt-arrow-down-bold" id="${id}-arrow" class="text-gray-400 transition-transform duration-300"></iconify-icon>
        </div>
        <ul id="${id}-list" class="absolute w-full mt-2 bg-white dark:bg-cardDark border border-gray-200 dark:border-gray-600 rounded-xl shadow-2xl overflow-hidden hidden opacity-0 transition-all text-sm font-medium z-30">${optsHtml}</ul>
        <input type="hidden" id="${id}" value="${defaultVal}">
    </div>`;
}

function toggleDropdown(id) {
    closeAllDropdowns(id);
    const list = document.getElementById(`${id}-list`);
    const arrow = document.getElementById(`${id}-arrow`);
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        gsap.to(list, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(1.5)" });
        arrow.style.transform = 'rotate(180deg)';
    } else {
        gsap.to(list, { opacity: 0, y: -10, duration: 0.2, onComplete: () => list.classList.add('hidden') });
        arrow.style.transform = 'rotate(0deg)';
    }
}

function selectOption(id, val) {
    document.getElementById(id).value = val;
    document.getElementById(`${id}-text`).innerHTML = `
        <iconify-icon icon="${val === '買入' ? 'solar:cart-large-minimalistic-bold-duotone' : 'solar:tag-price-bold-duotone'}" class="text-primary"></iconify-icon>${val}`;
    toggleDropdown(id);
    if (id === 'f_action') calculateFee();
}

function closeAllDropdowns(exceptId = null) {
    document.querySelectorAll('.custom-dropdown ul').forEach(list => {
        if (exceptId && list.id === `${exceptId}-list`) return;
        gsap.to(list, { opacity: 0, y: -10, duration: 0.2, onComplete: () => list.classList.add('hidden') });
    });
    document.querySelectorAll('.custom-dropdown iconify-icon[id$="-arrow"]').forEach(arrow => {
        if (exceptId && arrow.id === `${exceptId}-arrow`) return;
        arrow.style.transform = 'rotate(0deg)';
    });
}

// ==================== Toast 提示 ====================

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const colors = {
        success: 'bg-success/90 text-white',
        error:   'bg-danger/90 text-white',
        info:    'bg-cardDark text-white',
    };
    toast.className = `fixed bottom-6 right-6 z-50 text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl border border-white/10 transition-all duration-300 pointer-events-none ${colors[type] || colors.info}`;
    toast.innerText = msg;
    toast.classList.remove('opacity-0', 'translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-2');
    }, 3500);
}

// ==================== 成功動畫 ====================

function flashSuccess() {
    gsap.fromTo("body",
        { backgroundColor: "#0ECB81" },
        { backgroundColor: isDarkMode ? "#1E2329" : "#F3F4F6", duration: 0.8, ease: "power2.out", clearProps: "backgroundColor" }
    );
}

// ==================== 數字格式化 ====================

function formatNum(val, maxDec = 2) {
    return parseFloat(parseFloat(val).toFixed(maxDec)).toLocaleString('en-US');
}

// ==================== 即時股價共用狀態 ====================

let livePricesData = {};   // { symbol: { price, market } }
let usdTwdRate = null;     // number
let livePricesLoading = false;
let livePricesUpdatedAt = null;  // Date

async function refreshLivePrices() {
    if (livePricesLoading) return;
    livePricesLoading = true;

    // 讓所有刷新按鈕顯示 loading
    document.querySelectorAll('.btn-refresh-price').forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = `<iconify-icon icon="solar:refresh-bold-duotone" class="animate-spin"></iconify-icon> 抓取中...`;
    });

    try {
        const res = await API.getLivePrices();
        if (res.status === 'success') {
            livePricesData = res.data.prices || {};
            usdTwdRate = res.data.usdtwd != null ? res.data.usdtwd : null;
            livePricesUpdatedAt = new Date();
            updatePriceSourceLabels();
            const fetched = Object.values(livePricesData).filter(p => p.price != null).length;
            const total   = Object.keys(livePricesData).length;
            if (total > 0 && fetched === 0) {
                showToast('股價抓取失敗，請確認網路連線', 'error');
            } else if (fetched < total) {
                showToast(`部分股價無法取得 (${fetched}/${total})`, 'info');
            }
        } else {
            showToast(`股價抓取失敗：${res.message || '未知錯誤'}`, 'error');
        }
    } catch (e) {
        showToast('股價抓取失敗，請確認網路連線', 'error');
    } finally {
        livePricesLoading = false;
        document.querySelectorAll('.btn-refresh-price').forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = `<iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> 刷新股價`;
        });
    }
}

function updatePriceSourceLabels() {
    if (!livePricesUpdatedAt) return;
    const timeStr = livePricesUpdatedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const html = `<iconify-icon icon="solar:database-bold-duotone" class="text-xs"></iconify-icon>
        Yahoo Finance &nbsp;·&nbsp;
        <iconify-icon icon="solar:clock-circle-bold-duotone" class="text-xs"></iconify-icon>
        ${timeStr}`;
    document.querySelectorAll('.price-source-label').forEach(el => el.innerHTML = html);
}