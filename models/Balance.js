// src/models/Balance.js

import mongoose from "mongoose";

const balanceSchema = new mongoose.Schema(
    {
        // Joriy kassa balansi — faqat shu maydon saqlanadi
        totalMoney: {
            type: Number,
            required: [true, "Balans miqdori majburiy"],
            min: [0, "Balans manfiy bo'lmasligi kerak"],
            default: 0,
        },
    },
    {
        timestamps: true, // faqat createdAt va updatedAt qoladi (agar kerak bo'lmasa, bu qatorni ham o'chirsa bo'ladi)
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Joriy balansni olish (agar hujjat yo'q bo'lsa — avtomatik 0 bilan yaratiladi)
balanceSchema.statics.getCurrentBalance = async function () {
    let balance = await this.findOne();
    if (!balance) {
        balance = await this.create({ totalMoney: 0 });
    }
    return balance;
};

// UNIVERSAL FUNKSIYA: adjustBalance
// Istalgan joydan chaqiriladi:
// await Balance.adjustBalance(1500000, "income")
// await Balance.adjustBalance(500000, "expense")
balanceSchema.statics.adjustBalance = async function (amount, type) {
    if (!["income", "expense"].includes(type)) {
        throw new Error('Type faqat "income" yoki "expense" bo\'lishi kerak');
    }

    if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Amount musbat son bo'lishi kerak");
    }

    const increment = type === "income" ? +amount : -amount;

    const updatedBalance = await this.findOneAndUpdate(
        {}, // bitta hujjat bor
        { $inc: { totalMoney: increment } },
        {
            new: true,              // yangi qiymatni qaytarish
            upsert: true,           // yo'q bo'lsa yaratish
            setDefaultsOnInsert: true,
        }
    );

    // Chiqimda pul yetmasa — operatsiyani bekor qilish
    if (type === "expense" && updatedBalance.totalMoney < 0) {
        // Ayirilgan pulni qaytarib qo'yamiz (rollback)
        await this.findOneAndUpdate(
            {},
            { $inc: { totalMoney: +amount } }
        );
        throw new Error("Kassada yetarli mablag' yo'q!");
    }

    return updatedBalance;
};

const Balance = mongoose.model("Balance", balanceSchema);

export default Balance;