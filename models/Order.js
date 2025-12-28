import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        customerName: {
            type: String,
            required: [true, "Mijoz ismi majburiy"],
            trim: true,
        },
        phoneNumber: {
            type: String,
            required: [true, "Telefon raqami majburiy"],
            trim: true,
            index: true, // Tez qidiruv uchun
        },

        brand: {
            type: String,
            required: [true, "Brand majburiy"],
            trim: true,
        },
        phoneModel: {
            type: String,
            required: [true, "Model majburiy"],
            trim: true,
        },
        color: {
            type: String,
            trim: true,
        },

        condition: {
            type: String,
            required: true,
        },
        conditionDetail: {
            type: String,
            trim: true,
        },
        problem: {
            type: String,
            required: true,
            trim: true,
        },
        initialDiagnosis: {
            type: String,
            trim: true,
        },

        repairDays: {
            type: Number,
            min: [1, "Ta'mirlash kunlari kamida 1 bo'lishi kerak"],
        },
        pickupDate: {
            type: Date, // String emas, Date yaxshiroq
        },

        // Status qo'shdim – buyurtma jarayonini kuzatish uchun juda muhim
        status: {
            type: String,
            enum: ["pending", "inProgress", "ready", "collected", "failed"],
            default: "pending",
            index: true,
        },
        completedWorks: {
            type: String,
            trim: true,
        },
        failReason: {  // 🔥 Yangi maydon
            type: String,
            trim: true,
        },
        // Topshirish jarayoni uchun maydonlar
        deliveredAt: {
            type: Date, // Haqiqiy topshirilgan sana
        },

        district: {
            type: String,
            trim: true,
            // enum: ["Toshkent", "Samarqand", ...] // Kerak bo'lsa qo'shing
        },
        village: {
            type: String,
            trim: true,
        },
        street: {
            type: String,
            trim: true,
        },

        phoneImage: {
            type: String, // URL (masalan, Cloudinary dan)
            trim: true,
        },
        clientImage: {
            type: String, // URL
            trim: true,
        },
        receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Master", // yoki "Employee" modeli nomi
        },
        repairedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Master", // yoki "Employee"
            // required emas, chunki ba'zida hali tayinlanmagan bo'lishi mumkin
        },
        TotalCost: {
            type: Number,
            min: 0,
        },

        // 🔥 Zapchast kutmoqda maydoni
        waiting: {
            isWaiting: {
                type: Boolean,
                default: false,
            },
            reason: {
                type: String,
                trim: true,
            },
            waitingSince: {
                type: Date,
                default: null
            },
        }
    },
    {
        timestamps: true, // createdAt va updatedAt avto qo'shiladi
    }
);

// Tez-tez qidiruvlar uchun compound index (masalan, status va sana bo'yicha)
orderSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Order", orderSchema);



