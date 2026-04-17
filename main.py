import eel
import sqlite3

DB_PATH = "tradelog.db"
eel.init('web')

# 允許寫入的欄位白名單，防止前端傳入非預期欄位名稱
_STOCK_FIELDS  = {'date', 'market', 'symbol', 'name', 'action', 'qty',
                  'price_twd', 'price_usd', 'actual_twd', 'fee', 'profit', 'remark'}
_CRYPTO_FIELDS = {'dt', 'symbol', 'action', 'price', 'profit', 'remark'}

def _filter_fields(data: dict, mode: str) -> dict:
    allowed = _STOCK_FIELDS if mode == 'Stock' else _CRYPTO_FIELDS
    return {k: v for k, v in data.items() if k in allowed}

# ==================== 資料庫初始化 ====================

def get_conn():
    """取得資料庫連線，並設定 row_factory 讓查詢結果可以用欄位名稱存取"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """首次啟動時建立資料表（若已存在則跳過），並執行 schema 版本升級"""
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
    _migrate_db(conn)
    _backfill_usdtwd_rates(conn)
    conn.close()

def _migrate_db(conn):
    """依版本號依序執行 schema 升級，未來新增欄位在此新增 migration"""
    c = conn.cursor()
    c.execute("PRAGMA user_version")
    version = c.fetchone()[0]

    if version < 1:
        c.execute("ALTER TABLE records ADD COLUMN usd_twd_rate REAL")
        c.execute("PRAGMA user_version = 1")

    conn.commit()


def _fetch_historical_usdtwd(date_str):
    """查詢指定日期（YYYYMMDD）的 USD/TWD 收盤匯率。
    若當天無資料（假日/週末），往前找最近一個有報價的交易日。"""
    try:
        import yfinance as yf
        from datetime import datetime, timedelta

        trade_dt = datetime.strptime(date_str, '%Y%m%d')
        # 往前抓 7 天的資料，確保能涵蓋週末與假日
        start = (trade_dt - timedelta(days=7)).strftime('%Y-%m-%d')
        end   = (trade_dt + timedelta(days=1)).strftime('%Y-%m-%d')

        hist = yf.Ticker('USDTWD=X').history(start=start, end=end)
        if hist.empty:
            return None
        return round(float(hist['Close'].iloc[-1]), 4)
    except Exception:
        return None


def _backfill_usdtwd_rates(conn):
    """啟動時補齊歷史美股記錄缺少的 usd_twd_rate（一次性，補完後不再觸發）"""
    try:
        import yfinance as yf
        from datetime import datetime, timedelta

        c = conn.cursor()
        c.execute("""
            SELECT DISTINCT date FROM records
            WHERE market = '美股' AND usd_twd_rate IS NULL
            ORDER BY date ASC
        """)
        dates = [row['date'] for row in c.fetchall()]
        if not dates:
            return

        # 批次下載整段期間的匯率，減少 API 呼叫次數
        min_dt = datetime.strptime(min(dates), '%Y%m%d')
        max_dt = datetime.strptime(max(dates), '%Y%m%d')
        start  = (min_dt - timedelta(days=7)).strftime('%Y-%m-%d')
        end    = (max_dt + timedelta(days=2)).strftime('%Y-%m-%d')

        hist = yf.Ticker('USDTWD=X').history(start=start, end=end)
        if hist.empty:
            return

        for date_str in dates:
            trade_dt = datetime.strptime(date_str, '%Y%m%d')
            # 取交易日當天（含）之前最近的收盤價
            cutoff = (trade_dt + timedelta(days=1)).strftime('%Y-%m-%d')
            subset = hist[hist.index < cutoff]
            if subset.empty:
                continue
            rate = round(float(subset['Close'].iloc[-1]), 4)
            c.execute("""
                UPDATE records SET usd_twd_rate = ?
                WHERE market = '美股' AND date = ? AND usd_twd_rate IS NULL
            """, (rate, date_str))

        conn.commit()
    except Exception:
        pass  # 補值失敗不影響啟動，日曆只是缺部分匯率

# ==================== 核心對帳邏輯 ====================

def calculate_stock_profit(data, exclude_id=None):
    """【庫存驗證】賣出時檢查庫存是否足夠（以移動平均法重播歷史推算）。
    盈虧實際值由 recalculate_symbol_profits 統一重算覆蓋，此函式不需設定 profit。"""
    # 買入不需驗證庫存
    if data.get('action') != '賣出':
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
            total_cost_basis += (r_price * r_qty)
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

    # 盈虧由 recalculate_symbol_profits 統一計算，此處不重複設定
    return data

def recalculate_symbol_profits(symbol, conn):
    """修改或刪除紀錄後，重新對帳該股票所有賣出的盈虧。commit 由呼叫端負責。"""
    c = conn.cursor()
    c.execute(
        "SELECT * FROM records WHERE symbol = ? ORDER BY date ASC, id ASC",
        (symbol,)
    )
    all_records = [dict(row) for row in c.fetchall()]

    current_holdings = 0.0
    total_cost_basis  = 0.0
    avg_cost          = 0.0

    for r in all_records:
        qty   = float(r.get('qty')       or 0)
        price = float(r.get('price_twd') or 0) if r.get('market') == '台股' \
                else float(r.get('price_usd') or 0)

        if r['action'] == '買入':
            total_cost_basis += price * qty
            current_holdings += qty
            if current_holdings > 0:
                avg_cost = total_cost_basis / current_holdings
        elif r['action'] == '賣出':
            new_profit = round((price - avg_cost) * qty, 2)
            c.execute("UPDATE records SET profit = ? WHERE id = ?", (new_profit, r['id']))
            current_holdings -= qty
            if current_holdings < 0:
                current_holdings = 0.0
            total_cost_basis = current_holdings * avg_cost


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
                    'symbol':           r['symbol'],
                    'name':             r.get('name') or '',
                    'market':           r['market'],
                    'buy_count':        0,
                    'sell_count':       0,
                    'total_profit':     0.0,
                    'total_profit_twd': 0.0,
                    'last_date':        r['date'],
                    'records':          []
                }
            s = symbols[key]
            if r['action'] == '買入':
                s['buy_count'] += 1
            else:
                s['sell_count'] += 1
                profit = float(r.get('profit') or 0)
                s['total_profit'] += profit
                if r['market'] == '美股':
                    rate = float(r.get('usd_twd_rate') or 0)
                    s['total_profit_twd'] += round(profit * rate, 2)
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
        twd_total     = sum(s['total_profit']     for s in symbols.values() if s['market'] == '台股')
        usd_total     = sum(s['total_profit']     for s in symbols.values() if s['market'] == '美股')
        usd_twd_total = sum(s['total_profit_twd'] for s in symbols.values() if s['market'] == '美股')
        crypto_total  = sum(s['total_profit']     for s in symbols.values() if s['market'] == 'Crypto')

        return {
            "status": "success",
            "data": {
                "symbols": list(symbols.values()),
                "summary": {
                    "twd":     round(twd_total, 2),
                    "usd":     round(usd_total, 2),
                    "usd_twd": round(usd_twd_total, 2),
                    "crypto":  round(crypto_total, 2)
                }
            }
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def export_csv(mode):
    """匯出交易紀錄為 CSV 檔案，由使用者選擇儲存位置"""
    import csv
    import os
    from datetime import datetime
    import tkinter as tk
    from tkinter import filedialog

    try:
        conn = get_conn()
        c = conn.cursor()

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if mode == 'Stock':
            c.execute("SELECT * FROM records ORDER BY date ASC, id ASC")
            rows = [dict(row) for row in c.fetchall()]
            default_name = f"TradeLog_Stock_{timestamp}.csv"
            fieldnames = ['id', 'date', 'market', 'symbol', 'name', 'action',
                          'qty', 'price_twd', 'price_usd', 'actual_twd', 'fee', 'profit', 'remark']
            headers = ['ID', '日期', '市場', '代碼', '名稱', '動作',
                       '數量', '單價(TWD)', '單價(USD)', '實際扣款(TWD)', '手續費', '盈虧', '備註']
        else:
            c.execute("SELECT * FROM crypto_records ORDER BY dt ASC, id ASC")
            rows = [dict(row) for row in c.fetchall()]
            default_name = f"TradeLog_Crypto_{timestamp}.csv"
            fieldnames = ['id', 'dt', 'symbol', 'action', 'price', 'profit', 'remark']
            headers = ['ID', '時間', '幣種', '動作', '成交金額(USDT)', '盈虧(USDT)', '備註']

        conn.close()

        # 開啟原生儲存對話框
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', True)
        filename = filedialog.asksaveasfilename(
            title='選擇儲存位置',
            defaultextension='.csv',
            filetypes=[('CSV 檔案', '*.csv'), ('所有檔案', '*.*')],
            initialfile=default_name
        )
        root.destroy()

        if not filename:
            return {"status": "cancelled"}

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

        # ── 3. 累積盈虧走勢（各市場分開）──
        def build_cumulative(sells):
            result = []
            total = 0.0
            for s in sorted(sells, key=lambda x: x['date']):
                total += s['profit']
                result.append({'date': s['date'], 'total': round(total, 2)})
            return result

        twd_sells    = [{'date': r['date'], 'profit': float(r.get('profit') or 0)} for r in stock_records if r['action'] == '賣出' and r['market'] == '台股']
        usd_sells    = [{'date': r['date'], 'profit': float(r.get('profit') or 0)} for r in stock_records if r['action'] == '賣出' and r['market'] == '美股']
        crypto_sells = [{'date': r['dt'][:10].replace('-', ''), 'profit': float(r.get('profit') or 0)} for r in crypto_records if r['action'] == '賣出']
        all_sells    = twd_sells + usd_sells + crypto_sells

        cumulative = {
            'twd':    build_cumulative(twd_sells),
            'usd':    build_cumulative(usd_sells),
            'crypto': build_cumulative(crypto_sells),
        }

        # ── 4. 勝率統計 ──
        wins   = sum(1 for s in all_sells if s['profit'] > 0)
        losses = sum(1 for s in all_sells if s['profit'] < 0)
        total_trades = len(all_sells)
        win_rate = round((wins / total_trades * 100), 1) if total_trades > 0 else 0

        # ── 5. 最佳/最差標的 ──
        best  = max(symbol_profit.items(), key=lambda x: x[1]) if symbol_profit else ('--', 0)
        worst = min(symbol_profit.items(), key=lambda x: x[1]) if symbol_profit else ('--', 0)

        # ── 6. 各市場交易次數佔比 ──
        twd_count    = sum(1 for r in stock_records if r['market'] == '台股')
        usd_count    = sum(1 for r in stock_records if r['market'] == '美股')
        crypto_count = len(crypto_records)

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
                    "twd":    twd_count,
                    "usd":    usd_count,
                    "crypto": crypto_count
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
                h['total_cost'] += (price * qty)
                h['qty'] += qty
            elif r['action'] == '賣出':
    # 先用當前均價計算賣出後的剩餘成本
                if h['qty'] > 0:
                    h['avg_cost'] = h['total_cost'] / h['qty']
                h['qty'] -= qty
                if h['qty'] < 0:
                    h['qty'] = 0.0
                h['total_cost'] = h['avg_cost'] * h['qty']
            # 每次更新後重新計算均價
            if h['qty'] > 0:
                h['avg_cost'] = h['total_cost'] / h['qty']
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

        c.execute("SELECT market, profit FROM records WHERE action = '賣出'")
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

        data = _filter_fields(data, mode)

        # 【觸發自動對帳】（含庫存不足驗證）
        if mode == 'Stock':
            data = calculate_stock_profit(data)

        conn = get_conn()
        try:
            c = conn.cursor()

            columns = ', '.join(data.keys())
            placeholders = ', '.join(['?' for _ in data])
            values = list(data.values())

            c.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values)
            new_id = c.lastrowid  # 在 recalculate 之前先存下 ID

            # 新增後重新對帳，確保補登舊日期的買入時後續賣出盈虧同步更新
            if mode == 'Stock':
                recalculate_symbol_profits(data['symbol'], conn)
                # 美股：抓取交易日匯率存入 DB，供日曆靜態顯示用
                if data.get('market') == '美股':
                    rate = _fetch_historical_usdtwd(data['date'])
                    if rate is not None:
                        c.execute("UPDATE records SET usd_twd_rate = ? WHERE id = ?", (rate, new_id))

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
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

        data = _filter_fields(data, mode)

        # 【觸發自動對帳】（含庫存不足驗證）
        if mode == 'Stock':
            data = calculate_stock_profit(data, exclude_id=record_id)

        conn = get_conn()
        try:
            c = conn.cursor()

            set_clause = ', '.join([f"{k} = ?" for k in data.keys()])
            values = list(data.values()) + [record_id]

            c.execute(f"UPDATE {table} SET {set_clause} WHERE id = ?", values)

            # 修改後重新對帳該股票所有賣出盈虧（確保後續賣出同步更新）
            if mode == 'Stock':
                recalculate_symbol_profits(data['symbol'], conn)
                # 美股：重新抓取交易日匯率（日期可能被修改，所以每次更新都重抓）
                if data.get('market') == '美股':
                    rate = _fetch_historical_usdtwd(data['date'])
                    c.execute("UPDATE records SET usd_twd_rate = ? WHERE id = ?", (rate, record_id))

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
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
        try:
            c = conn.cursor()
            placeholders = ', '.join(['?' for _ in record_ids])

            # 刪除前先記錄受影響的股票代碼（Stock 模式才需要重算）
            affected_symbols = set()
            if mode == 'Stock':
                c.execute(f"SELECT DISTINCT symbol FROM {table} WHERE id IN ({placeholders})", record_ids)
                affected_symbols = {row['symbol'] for row in c.fetchall()}

            c.execute(f"DELETE FROM {table} WHERE id IN ({placeholders})", record_ids)

            # 刪除後重新對帳受影響的股票
            for symbol in affected_symbols:
                recalculate_symbol_profits(symbol, conn)

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ==================== 即時股價 ====================

@eel.expose
def get_live_prices():
    """用 yfinance 平行批次抓持倉股票最新股價與 USD/TWD 匯率"""
    try:
        import yfinance as yf
        from concurrent.futures import ThreadPoolExecutor, as_completed

        holdings_res = get_holdings()
        if holdings_res['status'] != 'success':
            return {"status": "error", "message": "無法取得持倉資料"}

        holdings = holdings_res['data']
        if not holdings:
            return {"status": "success", "data": {"prices": {}, "usdtwd": None}}

        # 建立待抓清單：(user_symbol, yf_symbol, market)
        fetch_list = []
        for h in holdings:
            yf_sym = h['symbol'] + '.TW' if h['market'] == '台股' else h['symbol']
            fetch_list.append((h['symbol'], yf_sym, h['market']))
        fetch_list.append(('__USDTWD__', 'USDTWD=X', None))

        def fetch_one(args):
            user_sym, yf_sym, market = args
            price = None
            try:
                price = yf.Ticker(yf_sym).fast_info.last_price
            except Exception:
                pass
            # 台股上市(.TW)抓不到時（None、0 或例外），改試上櫃/興櫃(.TWO)
            if (price is None or price == 0) and market == '台股':
                try:
                    price = yf.Ticker(user_sym + '.TWO').fast_info.last_price
                except Exception:
                    pass
            return user_sym, round(float(price), 4) if price else None, market

        prices = {}
        usdtwd = None

        # 所有請求同時發出，總耗時 ≈ 單次最慢的那一支
        with ThreadPoolExecutor(max_workers=min(len(fetch_list), 10)) as executor:
            for user_sym, price, market in executor.map(fetch_one, fetch_list):
                if user_sym == '__USDTWD__':
                    usdtwd = price
                else:
                    prices[user_sym] = {"price": price, "market": market}

        return {"status": "success", "data": {"prices": prices, "usdtwd": usdtwd}}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ==================== 投資小工具 ====================

@eel.expose
def get_exchange_rate():
    """抓取目前 USD/TWD 匯率"""
    try:
        import yfinance as yf
        from datetime import datetime
        price = yf.Ticker('USDTWD=X').fast_info.last_price
        if price is None or price == 0:
            return {"status": "error", "message": "無法取得匯率"}
        now = datetime.now().strftime("%H:%M")
        return {"status": "success", "data": {"rate": round(float(price), 4), "updated_at": now, "source": "Yahoo Finance"}}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@eel.expose
def get_stock_price(symbol):
    """查詢任意美股即時股價"""
    try:
        import yfinance as yf
        from datetime import datetime
        symbol = symbol.strip().upper()
        if not symbol:
            return {"status": "error", "message": "請輸入股票代號"}
        price = yf.Ticker(symbol).fast_info.last_price
        if price is None or price == 0:
            return {"status": "error", "message": f"找不到股票代號：{symbol}"}
        now = datetime.now().strftime("%H:%M")
        return {"status": "success", "data": {"symbol": symbol, "price": round(float(price), 4), "updated_at": now, "source": "Yahoo Finance"}}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ==================== 日曆 ====================

@eel.expose
def get_calendar_data(year, month):
    """取得指定年月的每日已實現盈虧資料（供日曆頁靜態顯示）"""
    try:
        conn = get_conn()
        c = conn.cursor()

        ym = f"{int(year):04d}{int(month):02d}"
        c.execute("""
            SELECT id, date, market, symbol, name, qty,
                   price_twd, price_usd, profit, usd_twd_rate
            FROM records
            WHERE action = '賣出' AND date LIKE ?
            ORDER BY date ASC, id ASC
        """, (f"{ym}%",))
        rows = [dict(row) for row in c.fetchall()]
        conn.close()

        days = {}
        for r in rows:
            date   = r['date']
            profit = float(r.get('profit') or 0)
            rate   = r.get('usd_twd_rate')
            market = r['market']

            if market == '台股':
                profit_twd = profit
                profit_usd = None
            else:
                profit_usd = profit
                profit_twd = round(profit * rate, 2) if rate else 0.0

            if date not in days:
                days[date] = {'total_twd': 0.0, 'trades': []}

            days[date]['total_twd'] = round(days[date]['total_twd'] + profit_twd, 2)
            days[date]['trades'].append({
                'symbol':      r['symbol'],
                'name':        r.get('name') or r['symbol'],
                'market':      market,
                'qty':         float(r.get('qty') or 0),
                'price_twd':   float(r.get('price_twd') or 0) if market == '台股' else None,
                'price_usd':   float(r.get('price_usd') or 0) if market != '台股' else None,
                'profit':      round(profit, 2),
                'profit_twd':  round(profit_twd, 2),
                'profit_usd':  round(profit_usd, 2) if profit_usd is not None else None,
                'usd_twd_rate': rate,
            })

        monthly_total = round(sum(d['total_twd'] for d in days.values()), 2)

        return {
            'status': 'success',
            'data': {
                'monthly_total_twd': monthly_total,
                'days': days,
            }
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


@eel.expose
def get_calendar_years():
    """從 records 動態取得有交易記錄的年份範圍（供日曆年份選擇器使用）"""
    try:
        from datetime import datetime
        conn = get_conn()
        c = conn.cursor()
        c.execute("SELECT MIN(date) as min_d, MAX(date) as max_d FROM records")
        row = dict(c.fetchone())
        conn.close()

        current_year = datetime.now().year
        if not row['min_d']:
            return {'status': 'success', 'data': [current_year]}

        min_year = int(row['min_d'][:4])
        max_year = max(int(row['max_d'][:4]), current_year)
        return {'status': 'success', 'data': list(range(min_year, max_year + 1))}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


# ==================== 啟動 ====================

if __name__ == '__main__':
    init_db()  # 確保資料表存在
    print("TradeLog Pro starting...")
    eel.start('index.html', size=(1500, 950), mode='edge', port=0,
              cmdline_args=['--disable-http-cache', '--incognito'])