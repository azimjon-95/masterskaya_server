import mongoose from "mongoose";

const financeSchema = new mongoose.Schema(
    {
        // Tranzaksiya turi: kirim yoki chiqim
        type: {
            type: String,
            enum: ["income", "expense"],
            required: [true, "Tranzaksiya turi majburiy"],
        },

        // Izoh (masalan: "Buyurtma to'lovi")
        description: {
            type: String,
            required: [true, "Izoh kiritish majburiy"],
            trim: true,
            minlength: [3, "Izoh kamida 3 belgidan iborat bo'lishi kerak"],
            maxlength: [200, "Izoh 200 belgidan oshmasligi kerak"],
        },

        // Kategoriya (masalan: "Buyurtmalar", "Xaridlar", "Xodimlar")
        category: {
            type: String,
            required: [true, "Kategoriya majburiy"],
            trim: true,
            minlength: [2, "Kategoriya kamida 2 belgidan iborat"],
        },

        // Summa (faqat musbat son)
        amount: {
            type: Number,
            required: [true, "Summa kiritish majburiy"],
            min: [1, "Summa 1 so'mdan kam bo'lmasligi kerak"],
        },

        // Sana (default: bugun)
        date: {
            type: Date,
            required: true,
            default: Date.now,
            // MongoDB da saqlash uchun Date turi, frontendda stringga o'tkazamiz
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Master", // sizning user modelingiz bo'lsa
        },
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Part", // sizning user modelingiz bo'lsa
        },
    },
    {
        timestamps: true, // createdAt va updatedAt avto qo'shiladi
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Sana ni frontend uchun YYYY-MM-DD formatida qaytarish uchun virtual field
financeSchema.virtual("formattedDate").get(function () {
    return this.date.toISOString().split("T")[0];
});

// Indexlar – tez qidiruv uchun (description va category bo'yicha text search)
financeSchema.index({ description: "text", category: "text" });

// Sana bo'yicha tez sortlash uchun
financeSchema.index({ date: -1 });

// Turi va sana bo'yicha statistika uchun
financeSchema.index({ type: 1, date: 1 });

const Finance = mongoose.model("Finance", financeSchema);

export default Finance;