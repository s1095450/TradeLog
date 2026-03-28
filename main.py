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