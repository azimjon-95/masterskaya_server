import Order from "../models/Order.js";
import FinanceModel from "../models/FinanceModel.js";
import Balance from "../models/Balance.js";
import redis from "../config/redis.js";
import { io } from "../config/socket.js";
import { uploadToImgBB } from "../utils/imgbb.js";
import response from "../utils/response.js";
import mongoose from "mongoose";


class OrderController {
    // Yangi buyurtma qo'shish
    async create(req, res) {
        try {
            let phoneImageUrl = "";
            let clientImageUrl = "";

            // ImgBB upload
            if (req.files?.phoneImage?.[0]) {
                phoneImageUrl = await uploadToImgBB(req.files.phoneImage[0].path);
            }

            if (req.files?.clientImage?.[0]) {
                clientImageUrl = await uploadToImgBB(req.files.clientImage[0].path);
            }

            const orderData = {
                ...req.body,
                phoneImage: phoneImageUrl,
                clientImage: clientImageUrl,
            };

            const order = await Order.create(orderData);

            const populatedOrder = await Order.findById(order._id)
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber");

            // 🔥 Redis cache yangilash
            try {
                const keys = await redis.keys("orders:*");
                if (keys.length > 0) {
                    await redis.del(keys);
                }
            } catch (cacheErr) {
                console.warn("Redis cache tozalashda xato (muhim emas):", cacheErr);
                // Bu xato asosiy operatsiyani buzmasligi kerak
            }


            return res.status(201).json({
                message: "Buyurtma muvaffaqiyatli qo‘shildi ✅",
                data: populatedOrder,
            });
        } catch (err) {
            console.error("Order create error:", err);
            return res.status(500).json({
                message: "Buyurtma qo‘shishda xatolik ❌",
            });
        }
    }

    async getOrders(req, res) {
        try {
            const { month, filter = 'active' } = req.query; // filter: active | history | failed | all

            // Oy ni aniqlash
            const now = new Date();
            let year, m;
            if (month) {
                [year, m] = month.split('.').map(Number);
            } else {
                year = now.getFullYear();
                m = now.getMonth() + 1;
            }

            const startDate = new Date(year, m - 1, 1, 0, 0, 0);
            const endDate = new Date(year, m, 0, 23, 59, 59, 999); // oy oxiri

            const cacheKey = `orders:${year}.${String(m).padStart(2, '0')}:${filter}`;

            // Cache tekshirish
            const cached = await redis.get(cacheKey);
            if (cached) {
                return response.success(res, "Buyurtmalar (cache)", JSON.parse(cached));
            }


            // Status filter
            let statusFilter = {};
            if (filter === 'active' || filter === 'all') {
                statusFilter = { status: { $in: ['pending', 'inProgress', 'ready'] } };
            } else if (filter === 'history') {
                statusFilter = { status: 'collected' };
            } else if (filter === 'failed') {
                statusFilter = { status: 'failed' };
            }
            // agar filter='all' bo'lsa — hech qanday status filter qo'ymaymiz (barchasi)

            const matchQuery = {
                createdAt: { $gte: startDate, $lte: endDate },
                ...(filter !== 'all' ? statusFilter : {})
            };

            const orders = await Order.find(matchQuery)
                .sort({ createdAt: -1 })
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber");

            // Stats hisoblash (faqat shu oy uchun)
            const allOrdersInMonth = await Order.find({
                createdAt: { $gte: startDate, $lte: endDate }
            }).select('status');

            const stats = {
                pending: allOrdersInMonth.filter(o => o.status === 'pending').length,
                inProgress: allOrdersInMonth.filter(o => o.status === 'inProgress').length,
                ready: allOrdersInMonth.filter(o => o.status === 'ready').length,
                collected: allOrdersInMonth.filter(o => o.status === 'collected').length,
                failed: allOrdersInMonth.filter(o => o.status === 'failed').length,
            };

            const responseData = {
                orders,
                stats,
            };

            // Cache ga saqlash (1 soat)
            await redis.set(cacheKey, JSON.stringify(responseData), "EX", 3600);

            return response.success(res, `${year}.${String(m).padStart(2, '0')} oy buyurtmalari`, responseData);

        } catch (err) {
            console.error("Get orders error:", err);
            return response.serverError(res);
        }
    }

    // Bitta buyurtma olish
    async getById(req, res) {
        try {
            const order = await Order.findById(req.params.id)
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber")
                .populate("deliveredBy", "FullName username PhoneNumber");

            if (!order) {
                return response.notFound(res, "Buyurtma topilmadi");
            }

            return response.success(res, "Buyurtma ma'lumotlari", order);
        } catch (err) {
            console.error("Get order by ID error:", err);
            return response.serverError(res);
        }
    }

    // Buyurtmani yangilash
    async update(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            if (!data || typeof data !== "object") {
                return response.notFound(res, "Yuborilgan ma'lumot noto‘g‘ri");
            }

            let order = await Order.findById(id);
            if (!order) return response.notFound(res, "Buyurtma topilmadi");

            // faqat yuborilgan fieldlar yangilanadi
            Object.assign(order, data);
            await order.save();

            const updatedOrder = await Order.findById(id)
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber");

            /* ==============================
               🧹 REDIS CACHE AUTO UPDATE
            ===============================*/

            // tegishli oy va yilni aniqlash
            const createdDate = new Date(order.createdAt);
            const year = createdDate.getFullYear();
            const month = String(createdDate.getMonth() + 1).padStart(2, '0');

            // barcha ehtimoliy keylarni tozalaymiz
            const keys = [
                `orders:${year}.${month}:active`,
                `orders:${year}.${month}:history`,
                `orders:${year}.${month}:failed`,
                `orders:${year}.${month}:all`
            ];

            for (const key of keys) {
                await redis.del(key);  // ❗ faqat shu oydagi buyurtmalar cache tozalanadi
            }

            return response.success(res, "Buyurtma yangilandi (cache yangilandi)", updatedOrder);

        } catch (err) {
            console.error("Order update error:", err);
            return response.serverError(res, "Buyurtma yangilashda xatolik");
        }
    }


    // Buyurtmani o'chirish
    async delete(req, res) {
        try {
            const { id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return response.notFound(res, "ID noto‘g‘ri formatda");
            }

            const order = await Order.findByIdAndDelete(id);

            if (!order) {
                return response.notFound(res, "Buyurtma topilmadi");
            }

            // 🔥 Redis cache’ni yangilash
            // Agar siz oy bo‘yicha cache ishlatayotgan bo‘lsangiz, uni ham yangilash kerak
            const keys = await redis.keys("orders*"); // barcha orders cache’larini olish
            for (const key of keys) {
                await redis.del(key);
            }

            return response.success(res, "Buyurtma muvaffaqiyatli o'chirildi");
        } catch (err) {
            console.error("Order delete error:", err);
            return response.serverError(res);
        }
    }

    // Cache va Socket ni yangilash uchun yordamchi metod
    async updateCacheAndEmit() {
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .populate("receivedBy", "FullName username PhoneNumber")
            .populate("repairedBy", "FullName username PhoneNumber")
            .populate("deliveredBy", "FullName username PhoneNumber");

        await redis.set("orders", JSON.stringify(orders));
        io.emit("orders:update", orders);
    }

    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, repairCost, repairDetails, failReason } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return response.notFound(res, "ID noto‘g‘ri formatda");
            }

            const order = await Order.findById(id);
            if (!order) {
                return response.notFound(res, "Buyurtma topilmadi");
            }

            let newStatus = order.status;

            // Status o'tishlarini boshqarish
            if (order.status === "pending") {
                // Pending → inProgress (odatiy keyingi qadam)
                newStatus = "inProgress";
            }

            else if (order.status === "inProgress") {
                if (status === "ready") {
                    // Validatsiya: repairCost va repairDetails majburiy
                    if (!repairCost || repairCost < 0) {
                        return response.notFound(res, "Ta'mir narxi (repairCost) majburiy va musbat bo'lishi kerak");
                    }
                    if (!repairDetails || repairDetails.trim() === "") {
                        return response.notFound(res, "Ta'mir tafsilotlari (repairDetails) majburiy");
                    }

                    // Maydonlarni to'ldirish
                    order.TotalCost = Number(repairCost);
                    order.completedWorks = repairDetails.trim();

                    // FinanceModel ga saqlash
                    const finance = new FinanceModel({
                        type: "income",
                        userId: order.userId || null,
                        description: "Buyurtma ta'mirini amalga oshirish",
                        category: "Ta'mir",
                        amount: order.TotalCost,
                        orderId: order._id,
                        date: new Date(),
                    });
                    await finance.save();
                    await Balance.adjustBalance(order.TotalCost, "income");;

                    newStatus = "ready";
                }
                else if (status === "failed") {
                    if (!failReason || failReason.trim() === "") {
                        return response.notFound(res, "Tuzalmadi sababi (failReason) majburiy");
                    }

                    order.failReason = failReason.trim();
                    newStatus = "failed";
                }
                else {
                    return response.notFound(res, "inProgress holatidan faqat 'ready' yoki 'failed' ga o'tkazish mumkin");
                }
            }

            else if (order.status === "ready" || order.status === "failed") {
                if (status === "collected") {
                    newStatus = "collected";
                    order.deliveredAt = new Date(); // topshirilgan vaqt
                } else {
                    return response.notFound(res, "Bu holatdan faqat 'collected' ga o'tkazish mumkin");
                }
            }

            else if (order.status === "collected") {
                return response.forbidden(res, "Buyurtma allaqachon mijozga topshirilgan");
            }

            // Yangi statusni qo'llash
            order.status = newStatus;

            await order.save();

            // Populate qilish
            const updatedOrder = await Order.findById(order._id)
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber");

            // Redis cache yangilash (oldingi kodingiz saqlanadi)
            // Barcha order cache'larini tozalash
            try {
                const keys = await redis.keys("orders:*");
                if (keys.length > 0) {
                    await redis.del(keys);
                }
            } catch (cacheErr) {
                console.warn("Redis cache tozalashda xato (muhim emas):", cacheErr);
                // Bu xato asosiy operatsiyani buzmasligi kerak
            }

            // Real-time yangilash
            io.emit("orders:update", updatedOrder);

            return response.success(res, "Buyurtma muvaffaqiyatli yangilandi", updatedOrder);

        } catch (err) {
            console.error("Update status error:", err);
            return response.serverError(res, "Server xatosi");
        }
    }

    // Buyurtmaning waiting holatini yangilash
    async updateWaiting(req, res) {
        try {
            const { id } = req.params;
            const { isWaiting, reason } = req.body;


            if (!mongoose.Types.ObjectId.isValid(id)) {
                return response.notFound(res, "ID noto‘g‘ri formatda");
            }

            const order = await Order.findById(id);
            if (!order) {
                return response.notFound(res, "Buyurtma topilmadi");
            }

            // Agar hozir kutmoqda bo'lsa, false qilamiz
            if (order.waiting.isWaiting) {
                order.waiting.isWaiting = isWaiting;
                order.waiting.waitingSince = null;
            } else {
                // Agar xohlasa, yana kutmoqda qilish uchun true qilsa bo'ladi
                order.waiting.isWaiting = isWaiting;
                order.waiting.reason = reason;
                order.waiting.waitingSince = new Date();
            }

            await order.save();

            const updatedOrder = await Order.findById(id)
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber");

            // Redis cache yangilash
            try {
                const keys = await redis.keys("orders:*");
                if (keys.length > 0) {
                    await redis.del(keys);
                }
            } catch (cacheErr) {
                console.warn("Redis cache tozalashda xato:", cacheErr);
            }

            io.emit("orders:update", updatedOrder);

            return response.success(res, "Buyurtma waiting holati yangilandi", updatedOrder);

        } catch (err) {
            console.error("updateWaiting error:", err);
            return response.serverError(res, "Server xatosi");
        }
    }

    // Zapchast kutayotgan barcha buyurtmalarni olish
    async getWaitingOrders(req, res) {
        try {
            const cacheKey = "orders:waiting";

            const cached = await redis.get(cacheKey);
            if (cached) {
                return response.success(res, "Zapchast kutayotganlar (cache)", JSON.parse(cached));
            }

            const orders = await Order.find({ "waiting.isWaiting": true })
                .select("customerName brand phoneModel waiting.isWaiting waiting.reason waiting.waitingSince status createdAt")
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber")
                .sort({ "waiting.waitingSince": -1 });

            await redis.set(cacheKey, JSON.stringify(orders), "EX", 600);

            io.emit("orders:waiting", orders);

            return response.success(res, "Zapchast kutayotgan buyurtmalar", orders);

        } catch (err) {
            console.log("getWaitingOrders error:", err);
            return response.serverError(res, "Server xatosi");
        }
    }

}

export default new OrderController();


