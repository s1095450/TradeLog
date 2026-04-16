// web/js/api.js
// 所有與 Python 後端(eel) 溝通的函數集中在這裡

const API = {

    // 取得 Dashboard 統計（台股/美股/Crypto 總盈虧）
    getDashboardStats: () => eel.get_dashboard_stats()(),

    // 取得記錄列表，mode = 'Stock' | 'Crypto'
    getRecords: (mode) => eel.get_records(mode)(),

    // 新增記錄
    addRecord: (mode, data) => eel.add_record(mode, data)(),

    // 更新記錄
    updateRecord: (mode, id, data) => eel.update_record(mode, id, data)(),

    // 刪除記錄（支援批次）
    deleteRecords: (mode, ids) => eel.delete_records(mode, ids)(),

    getHoldings: () => eel.get_holdings()(),//持倉

    getChartData: () => eel.get_chart_data()(),//chart

    exportCsv: (mode) => eel.export_csv(mode)(),//csv

    getStockProfit: () => eel.get_stock_profit()(),//個股盈虧

    getLivePrices: () => eel.get_live_prices()(),//即時股價

    getExchangeRate: () => eel.get_exchange_rate()(),//匯率換算
    getStockPrice: (symbol) => eel.get_stock_price(symbol)(),//查詢任意美股股價

    getCalendarData: (year, month) => eel.get_calendar_data(year, month)(),//日曆盈虧
    getCalendarYears: () => eel.get_calendar_years()(),//日曆年份選單
};