// controllers/DashboardController.js
import Finance from "../models/FinanceModel.js";
import Balance from "../models/Balance.js";
import Part from "../models/Part.js";
import redis from "../config/redis.js";
import response from "../utils/response.js";
import { io } from "../config/socket.js";

const CACHE_TTL = 300; // 5 min

class DashboardController {

    static async getDashboardData(req, res) {
        try {
            const { month } = req.query;
            const now = month ? new Date(month) : new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

            const cacheKey = `dashboard:${start.toISOString().slice(0, 7)}`;
            const cached = await redis.get(cacheKey);
            if (cached) return response.success(res, "dashboard cached", JSON.parse(cached));

            // 📊 30 kunlik kirim/chiqim grafigi
            const dailyStats = await Finance.aggregate([
                { $match: { date: { $gte: start, $lte: end } } },
                {
                    $group: {
                        _id: { day: { $dayOfMonth: "$date" }, type: "$type" },
                        total: { $sum: "$amount" }
                    }
                }
            ]);

            let days = Array.from({ length: end.getDate() }, (_, i) => ({
                day: i + 1,
                income: 0,
                expense: 0
            }));

            dailyStats.forEach(d => {
                let index = days.find(x => x.day === d._id.day);
                index[d._id.type] = d.total;
            });

            // 🔥 Top 5 Income
            const topIncome = await Finance.aggregate([
                { $match: { type: "income", date: { $gte: start, $lte: end } } },
                { $group: { _id: "$category", total: { $sum: "$amount" } } },
                { $sort: { total: -1 } }, { $limit: 5 }
            ]);

            // 🔥 Top 5 Expense
            const topExpense = await Finance.aggregate([
                { $match: { type: "expense", date: { $gte: start, $lte: end } } },
                { $group: { _id: "$category", total: { $sum: "$amount" } } },
                { $sort: { total: -1 } }, { $limit: 5 }
            ]);

            // 💰 Balans va Oy bo‘yicha foyda/zarar
            const monthFinance = await Finance.aggregate([
                { $match: { date: { $gte: start, $lte: end } } },
                { $group: { _id: "$type", total: { $sum: "$amount" } } }
            ]);

            // 💳 Qarzlar statistikasi (olingan / berilgan)
            const debtStats = await Finance.aggregate([
                {
                    $match: {
                        category: { $in: ["Qarz olish", "Qarz berish"] },
                        "debt.amount": { $gt: 0 },
                        date: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: "$category",
                        total: { $sum: "$debt.amount" }
                    }
                }
            ]);

            const takenDebt =
                debtStats.find(d => d._id === "Qarz olish")?.total || 0;

            const givenDebt =
                debtStats.find(d => d._id === "Qarz berish")?.total || 0;

            const income = monthFinance.find(x => x._id === "income")?.total || 0;
            const expense = monthFinance.find(x => x._id === "expense")?.total || 0;

            const balance = await Balance.getCurrentBalance();
            const profit = income - expense;

            // 📦 Ombordagi mahsulotlar statistikasi
            const parts = await Part.find({});

            const totalCount = parts.reduce((a, b) => a + b.quantity, 0);

            const extiyot = parts.filter(p => p.type === "Extiyot qismlar");
            const aksessuar = parts.filter(p => p.type === "Aksessuarlar");

            const totalExtiyotSum = extiyot.reduce((a, b) => a + b.buyPrice * b.quantity, 0);
            const totalAksessuarSum = aksessuar.reduce((a, b) => a + b.buyPrice * b.quantity, 0);

            const result = {
                chart: days,
                topIncome,
                topExpense,
                income,
                expense,
                profit,
                balance: balance.totalMoney,
                debts: {
                    taken: takenDebt,   // 🟡 Olingan qarz
                    given: givenDebt    // 🔵 Berilgan qarz
                },
                store: {
                    count: totalCount,
                    extiyot: { count: extiyot.length, sum: totalExtiyotSum },
                    aksessuar: { count: aksessuar.length, sum: totalAksessuarSum }
                }
            };

            await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
            io.emit("dashboard:update", result);

            return response.success(res, "dashboard data", result);

        } catch (err) {
            return response.error(res, err.message);
        }
    }
}

export default DashboardController;
