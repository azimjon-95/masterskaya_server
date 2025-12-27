import Part from "../models/Part.js";
import FinanceModel from "../models/FinanceModel.js";
import Balance from "../models/Balance.js";
import redis from "../config/redis.js";
import response from "../utils/response.js";
import Sale from "../models/Sale.js";
import { io } from "../config/socket.js";


class PartController {

    // 📌 Zapchast qo'shish
    async addPart(req, res) {
        try {
            const { name, brand, model, buyPrice, sellPrice, currency, quantity,
                type,
                color,
                size } = req.body;

            const part = new Part({
                name,
                brand,
                model,
                buyPrice,
                sellPrice,
                currency,
                quantity,
                type,
                color,
                size
            });

            await part.save();
            redis.set("parts", JSON.stringify(await Part.find({})));
            io.emit("partAdded", part);

            return response.success(res, part, "Part added successfully");
        } catch (error) {
            return response.error(res, error.message);
        }
    }

    // 📌 Barcha zapchastlarni olish
    async getParts(req, res) {
        try {
            const cached = await redis.get("parts");

            if (cached) {
                return response.success(res, JSON.parse(cached), "Parts from cache");
            }

            const parts = await Part.find({});
            redis.setex("parts", 60, JSON.stringify(parts)); // 60s cache

            return response.success(res, parts, "Parts from DB");
        } catch (error) {
            return response.error(res, error.message);
        }
    }

    // 📌 Zapchastni yangilash
    async updatePart(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const part = await Part.findByIdAndUpdate(id, updateData, { new: true });
            if (!part) return response.error(res, "Part not found");

            redis.set("parts", JSON.stringify(await Part.find({})));
            io.emit("partUpdated", part);

            return response.success(res, part, "Part updated successfully");
        } catch (error) {
            return response.error(res, error.message);
        }
    }

    // 📌 Zapchastni o'chirish
    async deletePart(req, res) {
        try {
            const { id } = req.params;

            const part = await Part.findByIdAndDelete(id);
            if (!part) return response.error(res, "Part not found");

            redis.set("parts", JSON.stringify(await Part.find({})));
            io.emit("partDeleted", part);

            return response.success(res, part, "Part deleted");
        } catch (error) {
            return response.error(res, error.message);
        }
    }

    // 📌 Zapchastni sotish
    async sellPart(req, res) {
        try {
            const { id } = req.params;
            const { quantity, salePrice } = req.body;

            const part = await Part.findById(id);

            if (!part) return response.error(res, "Part topilmadi");
            if (quantity > part.quantity) return response.error(res, "Miqdor yetarli emas");

            // miqdorni kamaytirish
            part.quantity -= quantity;
            await part.save();

            const totalPrice = salePrice;
            const profit = (part.sellPrice - part.buyPrice) * quantity;

            // 1️⃣ Sotuv yozuvi
            const sale = await Sale.create({
                part: part._id,
                name: part.name,
                brand: part.brand,
                model: part.model,
                color: part.color,
                size: part.size,
                sellPrice: part.sellPrice,
                buyPrice: part.buyPrice,
                currency: part.currency,
                quantity,
                totalPrice,
                profit,
                soldAt: new Date(),
            });

            // 2️⃣ Finance yozuvi
            const financeEntry = await FinanceModel.create({
                type: "income",
                description: `Mahsulot sotildi: ${part.name} (${quantity} dona)`,
                category: part.type || "Extiyot qismlar",
                amount: totalPrice,
                date: new Date(),        // optional, foydalanuvchi yoki mijoz
                productId: part?._id || null // agar login tizimi bo'lsa
            });

            // 3️⃣ Balansni yangilash
            await Balance.adjustBalance(totalPrice, "income");

            // 4️⃣ Redis & Socket
            redis.set("parts", JSON.stringify(await Part.find({})));
            await redis.del("finance:transactions:all");
            await redis.del("finance:balance:current");
            io.emit("partSold", sale);

            return response.success(res, { sale, financeEntry }, "Sotuv va moliyaviy yozuv yaratildi");

        } catch (error) {
            return response.error(res, error.message);
        }
    }

    async getSales(req, res) {
        try {
            const { month } = req.query; // YYYY.MM format

            let filter = {};

            if (month) {
                const [year, mon] = month.split(".");
                if (!year || !mon) return response.error(res, "Month format: YYYY.MM bo'lishi kerak");

                const startDate = new Date(Number(year), Number(mon) - 1, 1);
                const endDate = new Date(Number(year), Number(mon), 1);

                filter.soldAt = { $gte: startDate, $lt: endDate };
            }

            const sales = await Sale.find(filter).sort({ soldAt: -1 });

            return response.success(res, "Sales fetched", sales);
        } catch (error) {
            return response.error(res, error.message);
        }
    }


}

export default new PartController();
