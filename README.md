# TradeLog 
個人投資交易記帳工具，支援台股、美股、加密貨幣三類資產管理。

## 功能
- 台股、美股、加密貨幣買賣紀錄管理
- 移動平均法自動成本對帳與盈虧計算
- Dashboard 即時顯示各類資產總盈虧
- 支援新增、編輯、刪除、批量刪除紀錄
- 深色 / 淺色主題切換

## 技術架構
- **後端**：Python + Eel
- **前端**：HTML / Tailwind CSS / JavaScript / GSAP
- **資料庫**：SQLite（本機儲存）

## 使用方式
1. 安裝依賴
```
   pip install eel
```
2. 執行程式
```
   python main.py
```
3. 資料會自動儲存在本機的 `tradelog.db`
