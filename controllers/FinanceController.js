import redis from "../config/redis.js";
import FinanceModel from "../models/FinanceModel.js";
import Balance from "../models/Balance.js";
import response from "../utils/response.js";
import { io } from "../config/socket.js";

const CACHE_TTL = 60 * 5; // 5 daqiqa cache umri (kerak bo'lsa o'zgartiring)
const CACHE_KEYS = {
    ALL_TRANSACTIONS: "finance:transactions:all",
    CURRENT_BALANCE: "finance:balance:current",
};

class FinanceController {
    // Barcha tranzaksiyalar + statistika + joriy balans (Redis cache bilan)
    async getAll(req, res) {
        try {
            const { month } = req.query; // masalan: "2025.12"

            // Cache key ni month ga qarab belgilaymiz
            const cacheKey = month?.trim()
                ? `finance:transactions:month:${month.trim()}`
                : CACHE_KEYS.ALL_TRANSACTIONS;

            let transactions = null;
            let fromCache = false;

            // 1. Redis cache dan o'qish
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    transactions = JSON.parse(cached);
                    fromCache = true;
                }
            } catch (redisErr) {
                console.warn("Redis o'qish xatosi (fallback DB):", redisErr);
            }

            // 2. Agar cache da yo'q bo'lsa — DB dan olish
            if (!transactions) {
                if (month?.trim()) {
                    // YYYY.MM formatini ajratib olamiz
                    const [yearStr, monthStr] = month.trim().split('.');
                    const year = parseInt(yearStr, 10);
                    const monthNum = parseInt(monthStr, 10);

                    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                        return response.error(res, "Noto'g'ri oy formati. YYYY.MM ko'rinishida bo'lishi kerak.");
                    }

                    // Oyning boshlanishi va oxiri
                    const startDate = new Date(year, monthNum - 1, 1); // 1-kun, 00:00
                    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999); // oxirgi kun, 23:59:59

                    transactions = await FinanceModel.find({
                        date: { $gte: startDate, $lte: endDate }
                    }).sort({ date: -1 }); // yangidan eskiga qarab
                } else {
                    // Barcha tranzaksiyalar
                    transactions = await FinanceModel.find({}).sort({ date: -1 });
                }

                // Cache ga saqlash (har doim saqlaymiz, chunki oy bo'yicha ham foydali)
                try {
                    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(transactions));
                } catch (redisErr) {
                    console.warn("Redis yozish xatosi:", redisErr);
                }
            }

            // Agar tranzaksiyalar topilmasa — bo'sh array qaytaramiz
            if (!Array.isArray(transactions)) {
                transactions = [];
            }

            // Joriy balans (alohida cache)
            let currentBalance;
            try {
                const cachedBalance = await redis.get(CACHE_KEYS.CURRENT_BALANCE);
                if (cachedBalance) {
                    currentBalance = { totalMoney: parseFloat(cachedBalance) };
                }
            } catch (redisErr) {
                console.warn("Redis balans o'qish xatosi:", redisErr);
            }

            if (!currentBalance) {
                currentBalance = await Balance.getCurrentBalance();
                try {
                    await redis.setex(CACHE_KEYS.CURRENT_BALANCE, CACHE_TTL, currentBalance.totalMoney);
                } catch (redisErr) {
                    console.warn("Redis balans saqlash xatosi:", redisErr);
                }
            }

            // Statistika faqat joriy ko'rsatilayotgan tranzaksiyalar bo'yicha hisoblanadi
            const totalIncome = transactions
                .filter((t) => t.type === "income")
                .reduce((sum, t) => sum + t.amount, 0);

            const totalExpense = transactions
                .filter((t) => t.type === "expense")
                .reduce((sum, t) => sum + t.amount, 0);

            return response.success(res, "Ma'lumotlar muvaffaqiyatli yuklandi", {
                transactions,
                stats: {
                    totalIncome,
                    totalExpense,
                    balance: currentBalance.totalMoney,
                },
                currentBalance: currentBalance.totalMoney,
                filteredByMonth: !!month, // debug uchun foydali
                _debug: { fromCache },
            });
        } catch (error) {
            console.error("getAll xatosi:", error);
            return response.serverError(res);
        }
    }

    // Yangi tranzaksiya qo'shish
    async create(req, res) {
        try {
            const { type, subtype, description, category, amount, date, personName, userId } = req.body;

            if (!type || !["income", "expense"].includes(type)) {
                return response.error(res, "Tranzaksiya turi noto'g'ri");
            }
            if (!description?.trim() || !category?.trim() || !amount || amount <= 0) {
                return response.error(res, "Barcha majburiy maydonlar to'ldirilishi kerak");
            }

            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount)) {
                return response.error(res, "Summa noto'g'ri formatda");
            }

            const newTrans = await FinanceModel.create({
                type,
                subtype: subtype || null,
                description: description.trim(),
                category: category.trim(),
                amount: parsedAmount,
                date: date || new Date(),
                personName: personName?.trim() || null,
                userId: userId || null,
            });

            // Balansni yangilash (income → + , expense → -)
            try {
                await Balance.adjustBalance(parsedAmount, type);
            } catch (balanceError) {
                // Agar balans yetmasa — tranzaksiyani o'chirib tashlaymiz
                await FinanceModel.deleteOne({ _id: newTrans._id });
                return response.error(res, balanceError.message || "Kassada yetarli mablag' yo'q");
            }


            // Yangi balansni cache'ga saqlash
            const updatedBalance = await Balance.getCurrentBalance();
            try {
                await redis.del(
                    CACHE_KEYS.ALL_TRANSACTIONS,
                );
            } catch (redisErr) {
                console.warn("Redis balans saqlash xatosi:", redisErr);
            }

            // Real-time yangilanishlar
            io.emit("finance:updated", {
                action: "create",
                transaction: newTrans.toObject ? newTrans.toObject() : newTrans,
            });
            io.emit("balance:updated", { totalMoney: updatedBalance.totalMoney });

            return response.created(res, "Tranzaksiya qo'shildi va balans yangilandi", {
                transaction: newTrans.toObject ? newTrans.toObject() : newTrans,
                currentBalance: updatedBalance.totalMoney,
            });
        } catch (error) {
            console.error("create xatosi:", error);
            return response.serverError(res);
        }
    }
    // Tranzaksiyani o'chirish
    async delete(req, res) {
        try {
            const { id } = req.params;

            const deleted = await FinanceModel.findByIdAndDelete(id);

            if (!deleted) {
                return response.notFound(res, "Tranzaksiya topilmadi");
            }

            const reverseType = deleted.type === "income" ? "expense" : "income";

            try {
                await Balance.adjustBalance(deleted.amount, reverseType);
            } catch (balanceError) {
                console.error("Balans rollback xatosi:", balanceError);
                // Agar balansni tuzatish muvaffaqiyatsiz bo'lsa, tranzaksiyani qaytarish mumkin (ixtiyoriy)
            }

            // Redis cache'ni tozalash
            try {
                await redis.del(CACHE_KEYS.ALL_TRANSACTIONS);

            } catch (cacheError) {
                console.error("Redis cache tozalashda xato:", cacheError);
                // Cache xatosi asosiy operatsiyani buzmasligi kerak, shuning uchun bu yerda faqat log qilamiz
            }

            return response.success(res, "Tranzaksiya o'chirildi va balans tuzatildi");
        } catch (error) {
            console.error("delete xatosi:", error);
            return response.serverError(res);
        }
    }

    // Joriy balans (faqat Redis + fallback)
    async getBalance(req, res) {
        try {
            let totalMoney;
            try {
                const cached = await redis.get(CACHE_KEYS.CURRENT_BALANCE);
                if (cached) {
                    totalMoney = parseFloat(cached);
                }
            } catch (redisErr) {
                console.warn("Redis balans o'qish xatosi:", redisErr);
            }

            if (totalMoney === undefined || totalMoney === null) {
                const balance = await Balance.getCurrentBalance();
                totalMoney = balance.totalMoney;

                try {
                    await redis.setex(CACHE_KEYS.CURRENT_BALANCE, CACHE_TTL, totalMoney);
                } catch (redisErr) {
                    console.warn("Redis balans saqlash xatosi:", redisErr);
                }
            }

            return response.success(res, "Joriy balans", { totalMoney });
        } catch (error) {
            console.error("getBalance xatosi:", error);
            return response.serverError(res);
        }
    }

    // Yordamchi metod: barcha finance cache ni tozalash
    async invalidateFinanceCache() {
        try {
            const keys = await redis.keys("finance:transactions:*");
            const balanceKey = CACHE_KEYS.CURRENT_BALANCE;
            keys.push(balanceKey);
            if (keys.length > 0) {
                await redis.del(keys);
            }
        } catch (err) {
            console.warn("Redis cache tozalash xatosi:", err);
        }
    }
}

export default new FinanceController();