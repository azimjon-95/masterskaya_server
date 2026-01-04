import redis from "../config/redis.js";
import { clearFinanceCache } from "../config/clearFinanceCache.js";
import FinanceModel from "../models/FinanceModel.js";
import mongoose from "mongoose";
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

    // Yangi tranzaksiya + qarz

    async create(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { type, description, category, amount, date, userId, debt } = req.body;

            if (!type || !["income", "expense"].includes(type)) {
                await session.abortTransaction();
                return response.error(res, "Tranzaksiya turi noto'g'ri");
            }

            const newTrans = await FinanceModel.create([{
                type,
                description: description.trim(),
                category: category.trim(),
                amount,
                date: date || new Date(),
                userId: userId || null,
                debt: debt ? {
                    debtType: debt.debtType,
                    amount: debt.amount,
                    fullName: debt.fullName,
                    phone: debt.phone,
                    dueDate: debt.dueDate || null,
                    isReturned: false,
                } : null,
            }], { session });
            await Balance.adjustBalance(amount, type, session);


            await session.commitTransaction();
            session.endSession();

            await clearFinanceCache(); // ✅
            io.emit("finance:updated", { action: "create" });

            return response.created(res, "Tranzaksiya qo‘shildi", newTrans[0]);

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            console.error(err);
            return response.serverError(res);
        }
    }


    // Tranzaksiyani o'chirish
    async delete(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { id } = req.params;

            const deleted = await FinanceModel.findById(id).session(session);
            if (!deleted) {
                await session.abortTransaction();
                return response.notFound(res, "Tranzaksiya topilmadi");
            }

            await FinanceModel.deleteOne({ _id: id }, { session });

            const reverseType = deleted.type === "income" ? "expense" : "income";
            await Balance.adjustBalance(deleted.amount, reverseType, session);

            await session.commitTransaction();
            session.endSession();

            await clearFinanceCache(); // ✅
            io.emit("finance:updated", { action: "delete", id });

            return response.success(res, "Tranzaksiya o'chirildi");

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            console.error(err);
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


    // Qarzni to‘lash (telefon bo‘yicha)
    async payDebtByPhone(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { phone, amount, type } = req.body;

            if (!phone || !amount || amount <= 0) {
                await session.abortTransaction();
                session.endSession();
                return response.error(res, "Telefon va summa majburiy");
            }

            const debtType = type === "income" ? "given" : "taken";

            // Telefon bo‘yicha barcha ochiq qarzlar (oldingi birinchi yopiladi)
            const debts = await FinanceModel.find({
                "debt.phone": phone,
                "debt.debtType": debtType,
                "debt.isReturned": false,
            })
                .sort({ date: 1 }) // eng eski qarzdan boshlab
                .session(session);

            if (!debts.length) {
                await session.abortTransaction();
                session.endSession();
                return response.notFound(res, "Faol qarz topilmadi");
            }

            let remainingAmount = amount;
            let totalPaid = 0;
            let closedCount = 0;

            for (const doc of debts) {
                if (remainingAmount <= 0) break;

                const currentDebt = doc.debt.amount;

                if (remainingAmount >= currentDebt) {
                    // 🔒 To‘liq yopildi
                    remainingAmount -= currentDebt;
                    totalPaid += currentDebt;

                    doc.debt.amount = 0;
                    doc.debt.isReturned = true;
                    closedCount++;
                } else {
                    // 🟡 Qisman yopildi
                    doc.debt.amount = currentDebt - remainingAmount;
                    totalPaid += remainingAmount;
                    remainingAmount = 0;
                }

                // 🔥 MUHIM: createdAt ni ham yangilaymiz
                doc.createdAt = new Date();

                await doc.save({ session });
            }


            // Balance faqat real to‘langan summa bo‘yicha
            await Balance.adjustBalance(totalPaid, type, session);

            await session.commitTransaction();
            session.endSession();

            await clearFinanceCache();
            io.emit("finance:updated", { phone });

            return response.success(res, "Qarz muvaffaqiyatli yangilandi", {
                phone,
                type,
                debtType,
                totalPaid,
                closedCount,
                remainingAmount,
            });

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            console.error(err);
            return response.serverError(res);
        }
    }


    // Bizga qarzdorlar (given)
    async getAllDebts(req, res) {
        try {
            const debts = await FinanceModel.aggregate([
                // 1️⃣ Faqat debt bor va qaytarilmaganlari
                {
                    $match: {
                        debt: { $ne: null },
                        "debt.debtType": { $in: ["given", "taken"] },
                        "debt.isReturned": false,
                    },
                },

                // 2️⃣ Group: phone + debtType bo‘yicha
                {
                    $group: {
                        _id: {
                            phone: "$debt.phone",
                            debtType: "$debt.debtType",
                        },
                        fullName: { $first: "$debt.fullName" },
                        phone: { $first: "$debt.phone" },
                        debtType: { $first: "$debt.debtType" },
                        amount: { $sum: "$debt.amount" }, // 🔥 amount qo‘shiladi
                    },
                },

                // 3️⃣ Chiroyli output
                {
                    $project: {
                        _id: 0,
                        fullName: 1,
                        phone: 1,
                        debtType: 1,
                        amount: 1,
                    },
                },

                // 4️⃣ Ixtiyoriy: katta summalar oldinda
                {
                    $sort: { amount: -1 },
                },
            ]);

            return response.success(res, "Barcha qarzlar", debts);
        } catch (err) {
            console.error(err);
            return response.serverError(res);
        }
    }

}

export default new FinanceController();