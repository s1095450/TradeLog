import eel
import sqlite3

DB_PATH = "tradelog.db"
eel.init('web')

# ==================== 資料庫初始化 ====================

def get_conn():
    """取得資料庫連線，並設定 row_factory 讓查詢結果可以用欄位名稱存取"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """首次啟動時建立資料表（若已存在則跳過）"""
    conn = get_conn()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS records (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT,
            market      TEXT,
            symbol      TEXT,
            name        TEXT,
            action      TEXT,
            qty         REAL    DEFAULT 0,
            price_twd   REAL    DEFAULT 0,
            price_usd   REAL    DEFAULT 0,
            actual_twd  REAL    DEFAULT 0,
            fee         REAL    DEFAULT 0,
            profit      REAL    DEFAULT 0,
            remark      TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS crypto_records (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            dt      TEXT,
            symbol  TEXT,
            action  TEXT,
            price   REAL    DEFAULT 0,
            profit  REAL    DEFAULT 0,
            remark  TEXT
        )
    ''')
    conn.commit()
    conn.close()

# ==================== 核心對帳邏輯 ====================

def calculate_stock_profit(data, exclude_id=None):
    """【核心對帳系統】根據移動平均法 (Moving Average) 計算成本與賣出盈虧"""
    # 買入不計算已實現盈虧，直接設定為 0
    if data.get('action') != '賣出':
        data['profit'] = 0.0
        return data

    symbol = data['symbol']
    date = data['date']

    # 抓取該日期（含）之前的所有該股票歷史紀錄
    conn = get_conn()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM records WHERE symbol = ? AND date <= ? ORDER BY date ASC, id ASC",
        (symbol, date)
    )
    history = [dict(row) for row in c.fetchall()]
    conn.close()

    current_holdings = 0.0
    total_cost_basis = 0.0
    avg_cost = 0.0

    # 依時間順序推算過往成本
    for r in history:
        # 編輯模式下，跳過自己本身這筆舊紀錄
        if exclude_id and str(r['id']) == str(exclude_id):
            continue

        r_qty = float(r.get('qty') or 0)
        r_fee = float(r.get('fee') or 0)
        r_price = float(r.get('price_twd') or 0) if r.get('market') == '台股' else float(r.get('price_usd') or 0)

        if r['action'] == '買入':
            total_cost_basis += (r_price * r_qty + r_fee)
            current_holdings += r_qty
            if current_holdings > 0:
                avg_cost = total_cost_basis / current_holdings
        elif r['action'] == '賣出':
            current_holdings -= r_qty
            if current_holdings < 0:
                current_holdings = 0.0
            total_cost_basis = current_holdings * avg_cost

    # 處理本次要寫入的賣出資料
    new_qty = float(data.get('qty') or 0)
    new_fee = float(data.get('fee') or 0)
    new_price = float(data.get('price_twd') or 0) if data.get('market') == '台股' else float(data.get('price_usd') or 0)

    # 防錯機制：比較到小數點第4位，防止浮點數運算誤差
    if round(new_qty, 4) > round(current_holdings, 4):
        raise ValueError(f"庫存不足！目前 {symbol} 剩餘庫存僅 {round(current_holdings, 2)} 股")

    # 本次賣出盈虧 = (賣出單價 - 當前 avg_cost) * 賣出數量 - 賣出手續費
    calculated_profit = (new_price - avg_cost) * new_qty - new_fee
    data['profit'] = round(calculated_profit, 2)

    return data

# ==================== Eel 暴露給前端的 API ====================
@eel.expose
def get_stock_profit():
    """取得所有個股的盈虧統計與交易明細"""
    try:
        conn = get_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM records ORDER BY date ASC, id ASC")
        all_records = [dict(row) for row in c.fetchall()]
        c.execute("SELECT * FROM crypto_records ORDER BY dt ASC, id ASC")
        crypto_records = [dict(row) for row in c.fetchall()]
        conn.close()

        # 用 dict 追蹤每支股票/幣種
        symbols = {}

        for r in all_records:
            key = r['symbol']
            if key not in symbols:
                symbols[key] = {
                    'symbol':       r['symbol'],
                    'name':         r.get('name') or '',
                    'market':       r['market'],
                    'buy_count':    0,
                    'sell_count':   0,
                    'total_profit': 0.0,
                    'last_date':    r['date'],
                    'records':      []
                }
            s = symbols[key]
            if r['action'] == '買入':
                s['buy_count'] += 1
            else:
                s['sell_count'] += 1
                s['total_profit'] += float(r.get('profit') or 0)
            s['last_date'] = r['date']
            s['records'].append(r)

        for r in crypto_records:
            key = r['symbol']
            if key not in symbols:
                symbols[key] = {
                    'symbol':       r['symbol'],
                    'name':         r['symbol'],
                    'market':       'Crypto',
                    'buy_count':    0,
                    'sell_count':   0,
                    'total_profit': 0.0,
                    'last_date':    r['dt'][:10].replace('-', ''),
                    'records':      []
                }
            s = symbols[key]
            if r['action'] == '買入':
                s['buy_count'] += 1
            else:
                s['sell_count'] += 1
                s['total_profit'] += float(r.get('profit') or 0)
            s['last_date'] = r['dt'][:10].replace('-', '')
            s['records'].append(r)

        # 計算三個市場的總盈虧
        twd_total    = sum(s['total_profit'] for s in symbols.values() if s['market'] == '台股')
        usd_total    = sum(s['total_profit'] for s in symbols.values() if s['market'] == '美股')
        crypto_total = sum(s['total_profit'] for s in symbols.values() if s['market'] == 'Crypto')

        return {
            "status": "success",
            "data": {
                "symbols": list(symbols.values()),
                "summary": {
                    "twd":    round(twd_total, 2),
                    "usd":    round(usd_total, 2),
                    "crypto": round(crypto_total, 2)
                }
            }
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def export_csv(mode):
    """匯出交易紀錄為 CSV 檔案，存到使用者桌面"""
    import csv
    import os
    from datetime import datetime

    try:
        conn = get_conn()
        c = conn.cursor()

        # 檔名加上時間戳記，避免覆蓋
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")

        if mode == 'Stock':
            c.execute("SELECT * FROM records ORDER BY date ASC, id ASC")
            rows = [dict(row) for row in c.fetchall()]
            filename = os.path.join(desktop, f"TradeLog_Stock_{timestamp}.csv")
            fieldnames = ['id', 'date', 'market', 'symbol', 'name', 'action',
                          'qty', 'price_twd', 'price_usd', 'actual_twd', 'fee', 'profit', 'remark']
            headers = ['ID', '日期', '市場', '代碼', '名稱', '動作',
                       '數量', '單價(TWD)', '單價(USD)', '實際扣款(TWD)', '手續費', '盈虧', '備註']
        else:
            c.execute("SELECT * FROM crypto_records ORDER BY dt ASC, id ASC")
            rows = [dict(row) for row in c.fetchall()]
            filename = os.path.join(desktop, f"TradeLog_Crypto_{timestamp}.csv")
            fieldnames = ['id', 'dt', 'symbol', 'action', 'price', 'profit', 'remark']
            headers = ['ID', '時間', '幣種', '動作', '成交金額(USDT)', '盈虧(USDT)', '備註']

        conn.close()

        with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            for row in rows:
                writer.writerow([row.get(k, '') for k in fieldnames])

        return {"status": "success", "filename": os.path.basename(filename)}

    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def get_chart_data():
    """取得圖表分析所需的所有資料"""
    try:
        conn = get_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM records ORDER BY date ASC, id ASC")
        stock_records = [dict(row) for row in c.fetchall()]
        c.execute("SELECT * FROM crypto_records ORDER BY dt ASC, id ASC")
        crypto_records = [dict(row) for row in c.fetchall()]
        conn.close()

        # ── 1. 每月盈虧（台股+美股+Crypto 分開）──
        monthly = {}
        for r in stock_records:
            if r['action'] != '賣出': continue
            ym = r['date'][:6]  # YYYYMM
            if ym not in monthly:
                monthly[ym] = {'twd': 0.0, 'usd': 0.0, 'crypto': 0.0}
            if r['market'] == '台股':
                monthly[ym]['twd'] += float(r.get('profit') or 0)
            else:
                monthly[ym]['usd'] += float(r.get('profit') or 0)

        for r in crypto_records:
            if r['action'] != '賣出': continue
            ym = r['dt'][:7].replace('-', '')  # YYYYMM
            if ym not in monthly:
                monthly[ym] = {'twd': 0.0, 'usd': 0.0, 'crypto': 0.0}
            monthly[ym]['crypto'] += float(r.get('profit') or 0)

        monthly_sorted = dict(sorted(monthly.items()))

        # ── 2. 各標的盈虧排行（只算賣出的已實現盈虧）──
        symbol_profit = {}
        for r in stock_records:
            if r['action'] != '賣出': continue
            key = f"{r['symbol']} ({r['market']})"
            symbol_profit[key] = symbol_profit.get(key, 0.0) + float(r.get('profit') or 0)

        for r in crypto_records:
            if r['action'] != '賣出': continue
            key = f"{r['symbol']} (Crypto)"
            symbol_profit[key] = symbol_profit.get(key, 0.0) + float(r.get('profit') or 0)

        symbol_sorted = dict(sorted(symbol_profit.items(), key=lambda x: x[1], reverse=True))

        # ── 3. 累積盈虧走勢 ──
        cumulative = []
        total = 0.0
        all_sells = []

        for r in stock_records:
            if r['action'] != '賣出': continue
            all_sells.append({'date': r['date'], 'profit': float(r.get('profit') or 0)})

        for r in crypto_records:
            if r['action'] != '賣出': continue
            all_sells.append({'date': r['dt'][:10].replace('-', ''), 'profit': float(r.get('profit') or 0)})

        all_sells.sort(key=lambda x: x['date'])
        for s in all_sells:
            total += s['profit']
            cumulative.append({'date': s['date'], 'total': round(total, 2)})

        # ── 4. 勝率統計 ──
        wins   = sum(1 for s in all_sells if s['profit'] > 0)
        losses = sum(1 for s in all_sells if s['profit'] < 0)
        total_trades = len(all_sells)
        win_rate = round((wins / total_trades * 100), 1) if total_trades > 0 else 0

        # ── 5. 最佳/最差標的 ──
        best  = max(symbol_profit.items(), key=lambda x: x[1]) if symbol_profit else ('--', 0)
        worst = min(symbol_profit.items(), key=lambda x: x[1]) if symbol_profit else ('--', 0)

        # ── 6. 市場佔比（已實現盈虧絕對值佔比）──
        twd_total    = abs(sum(float(r.get('profit') or 0) for r in stock_records if r['action'] == '賣出' and r['market'] == '台股'))
        usd_total    = abs(sum(float(r.get('profit') or 0) for r in stock_records if r['action'] == '賣出' and r['market'] == '美股'))
        crypto_total = abs(sum(float(r.get('profit') or 0) for r in crypto_records if r['action'] == '賣出'))

        return {
            "status": "success",
            "data": {
                "monthly":       monthly_sorted,
                "symbol_profit": symbol_sorted,
                "cumulative":    cumulative,
                "win_rate": {
                    "wins":         wins,
                    "losses":       losses,
                    "total":        total_trades,
                    "rate":         win_rate
                },
                "best":  {"symbol": best[0],  "profit": round(best[1], 2)},
                "worst": {"symbol": worst[0], "profit": round(worst[1], 2)},
                "market_share": {
                    "twd":    round(twd_total, 2),
                    "usd":    round(usd_total, 2),
                    "crypto": round(crypto_total, 2)
                }
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def get_holdings():
    """計算目前所有持倉的均價與成本"""
    try:
        conn = get_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM records ORDER BY date ASC, id ASC")
        all_records = [dict(row) for row in c.fetchall()]
        conn.close()

        # 用 dict 追蹤每支股票的持倉狀態
        holdings = {}

        for r in all_records:
            symbol = r['symbol']
            market = r['market']
            qty    = float(r.get('qty') or 0)
            fee    = float(r.get('fee') or 0)
            price  = float(r.get('price_twd') or 0) if market == '台股' else float(r.get('price_usd') or 0)

            if symbol not in holdings:
                holdings[symbol] = {
                    'symbol': symbol,
                    'name': r.get('name') or '',
                    'market': market,
                    'qty': 0.0,
                    'total_cost': 0.0,
                    'avg_cost': 0.0,
                }

            h = holdings[symbol]

            if r['action'] == '買入':
                h['total_cost'] += (price * qty + fee)
                h['qty'] += qty
            elif r['action'] == '賣出':
                h['qty'] -= qty
                if h['qty'] < 0:
                    h['qty'] = 0.0

            # 每次更新後重新計算均價
            if h['qty'] > 0:
                h['avg_cost'] = h['total_cost'] / h['qty']
                h['total_cost'] = h['avg_cost'] * h['qty']
            else:
                h['qty'] = 0.0
                h['avg_cost'] = 0.0
                h['total_cost'] = 0.0

        # 只回傳還有持倉的股票
        result = [h for h in holdings.values() if h['qty'] > 0]
        return {"status": "success", "data": result}

    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def get_dashboard_stats():
    """計算台股、美股、Crypto 的總盈虧"""
    try:
        conn = get_conn()
        c = conn.cursor()

        c.execute("SELECT market, profit FROM records")
        stock_rows = c.fetchall()

        c.execute("SELECT profit FROM crypto_records")
        crypto_rows = c.fetchall()

        conn.close()

        stats = {"twd": 0.0, "usd": 0.0, "crypto": 0.0}

        for row in stock_rows:
            if row['market'] == '台股':
                stats['twd'] += float(row['profit'] or 0)
            else:
                stats['usd'] += float(row['profit'] or 0)

        for row in crypto_rows:
            stats['crypto'] += float(row['profit'] or 0)

        return {"status": "success", "data": stats}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@eel.expose
def get_records(mode):
    try:
        table = "records" if mode == 'Stock' else "crypto_records"
        conn = get_conn()
        c = conn.cursor()
        c.execute(f"SELECT * FROM {table} ORDER BY id DESC")
        rows = [dict(row) for row in c.fetchall()]
        conn.close()
        return {"status": "success", "data": rows}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@eel.expose
def add_record(mode, data):
    try:
        table = "records" if mode == 'Stock' else "crypto_records"

        # 【觸發自動對帳】
        if mode == 'Stock':
            data = calculate_stock_profit(data)

        conn = get_conn()
        c = conn.cursor()

        columns = ', '.join(data.keys())
        placeholders = ', '.join(['?' for _ in data])
        values = list(data.values())

        c.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values)
        conn.commit()
        conn.close()
        return {"status": "success"}
    except ValueError as ve:
        return {"status": "error", "message": str(ve)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@eel.expose
def update_record(mode, record_id, data):
    try:
        table = "records" if mode == 'Stock' else "crypto_records"

        # 【觸發自動對帳】
        if mode == 'Stock':
            data = calculate_stock_profit(data, exclude_id=record_id)

        conn = get_conn()
        c = conn.cursor()

        set_clause = ', '.join([f"{k} = ?" for k in data.keys()])
        values = list(data.values()) + [record_id]

        c.execute(f"UPDATE {table} SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return {"status": "success"}
    except ValueError as ve:
        return {"status": "error", "message": str(ve)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@eel.expose
def delete_records(mode, record_ids):
    try:
        table = "records" if mode == 'Stock' else "crypto_records"
        conn = get_conn()
        c = conn.cursor()
        placeholders = ', '.join(['?' for _ in record_ids])
        c.execute(f"DELETE FROM {table} WHERE id IN ({placeholders})", record_ids)
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ==================== 啟動 ====================

if __name__ == '__main__':
    init_db()  # 確保資料表存在
    print("🚀 TradeLog Pro 啟動中...")
    eel.start('index.html', size=(1500, 950), mode='edge', port=0,
              cmdline_args=['--disable-http-cache', '--incognito'])