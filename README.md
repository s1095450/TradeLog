# TradeLog

> 個人投資交易記帳工具，支援台股、美股、加密貨幣三大市場

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![Eel](https://img.shields.io/badge/Eel-Desktop_App-26C0DB?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=flat-square&logo=sqlite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-UI-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

---

## 功能特色

- 📊 **Dashboard** — 台股、美股、Crypto 已實現盈虧即時統計
- 💼 **持倉總覽** — 移動平均法自動計算持倉均價與總成本
- 📈 **圖表分析** — 勝率統計、每月盈虧長條圖、累積盈虧走勢、各標的排行
- 🔍 **搜尋/篩選** — 依代碼、名稱、備註即時搜尋，支援日期範圍篩選
- 📤 **匯出 CSV** — 一鍵匯出交易紀錄至桌面，Excel 可直接開啟
- 🌙 **深色/淺色模式** — 一鍵切換主題

---

## 核心技術

### 移動平均法對帳系統
每次賣出時，系統自動依歷史買入紀錄計算當前持倉均價，精確計算已實現盈虧，並具備庫存不足防錯機制。

### 架構設計
```
web/
├── index.html       # 主框架
├── js/
│   ├── api.js       # 後端 API 統一管理
│   ├── ui.js        # 共用 UI 工具函數
│   ├── dashboard.js # 主頁邏輯
│   ├── holdings.js  # 持倉總覽邏輯
│   └── charts.js    # 圖表分析邏輯
```

---

## 技術棧

| 類別 | 技術 |
|------|------|
| 後端 | Python 3.10+、Eel、SQLite |
| 前端 | HTML、TailwindCSS、JavaScript |
| 圖表 | Chart.js |
| 動畫 | GSAP |
| 日期選擇 | Flatpickr |

---

## 快速開始

### 方式一：直接下載（推薦）
前往 [Releases](https://github.com/s1095450/TradeLog/releases) 下載最新版 `TradeLog.exe`，雙擊執行即可。

> 需要安裝 Microsoft Edge 瀏覽器

### 方式二：從原始碼執行
**1. 安裝依賴**
```bash
pip install eel
```

**2. 啟動程式**
```bash
python main.py
```

> 需要安裝 Microsoft Edge 瀏覽器

---

## 截圖

![Dashboard](assets/dashboard.png)
![持倉總覽](assets/holdings.png)
![圖表分析](assets/charts.png)SSSS

---

## License

MIT