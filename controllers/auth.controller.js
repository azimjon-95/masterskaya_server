// controllers/AuthController.js
import Order from "../models/Order.js";
import Master from "../models/Master.js";
import bcrypt from "bcryptjs";
import Finance from "../models/FinanceModel.js";
import redis from "../config/redis.js";
import jwt from "jsonwebtoken";
import response from "../utils/response.js";
import { uploadToImgBB } from "../utils/imgbb.js";

class AuthController {
    // ================= LOGIN =================
    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return response.error(res, "Username va parol talab qilinadi");
            }

            const user = await Master.findOne({ username });
            if (!user) {
                return response.unauthorized(res, "Noto'g'ri username yoki parol");
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return response.unauthorized(res, "Noto'g'ri username yoki parol");
            }

            const token = jwt.sign(
                { id: user._id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: "30d" }
            );

            const userData = {
                id: user._id,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                username: user.username,
                role: user.role,
                image: user.image,
            };

            const orders = await Order.find()
                .sort({ createdAt: -1 })
                .populate("receivedBy", "fullName username phoneNumber")
                .populate("repairedBy", "fullName username phoneNumber");

            await redis.set("orders", JSON.stringify(orders));

            return response.success(res, "Muvaffaqiyatli kirish", {
                token,
                user: userData,
            });
        } catch (err) {
            console.error("Login error:", err);
            return response.serverError(res);
        }
    }

    // ================= GET ALL =================
    async getAll(req, res) {
        try {
            const users = await Master.find().select("-password");
            return response.success(res, "Barcha ustalar", users);
        } catch (err) {
            console.error(err);
            return response.serverError(res);
        }
    }

    // ================= GET BY ID =================
    async getById(req, res) {
        try {
            const user = await Master.findById(req.params.id).select("-password");
            if (!user) {
                return response.notFound(res, "Usta topilmadi");
            }
            return response.success(res, "Usta ma'lumotlari", user);
        } catch (err) {
            console.error(err);
            return response.serverError(res);
        }
    }

    // ================= CREATE =================
    async create(req, res) {
        try {
            const { fullName, phoneNumber, username, password, role } = req.body;

            if (!fullName || !username || !password) {
                return response.error(res, "FullName, username va parol majburiy");
            }

            const exists = await Master.findOne({ username });
            if (exists) {
                return response.error(res, "Bu username allaqachon band");
            }

            let imageUrl = "";
            if (req.file?.path) {
                imageUrl = await uploadToImgBB(req.file.path);
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = await Master.create({
                fullName,
                phoneNumber,
                username,
                password: hashedPassword,
                role: role || "master",
                image: imageUrl,
            });

            return response.created(res, "Usta muvaffaqiyatli qo'shildi", {
                id: newUser._id,
                fullName: newUser.fullName,
                phoneNumber: newUser.phoneNumber,
                username: newUser.username,
                role: newUser.role,
                image: newUser.image,
            });
        } catch (err) {
            console.error("Create error:", err);
            return response.serverError(res);
        }
    }

    // ================= UPDATE =================
    async update(req, res) {
        try {
            const { fullName, phoneNumber, username, password, role } = req.body;

            const updateData = { fullName, phoneNumber, username, role };

            if (password) {
                updateData.password = await bcrypt.hash(password, 10);
            }

            if (req.file?.path) {
                updateData.image = await uploadToImgBB(req.file.path);
            }

            if (username) {
                const exists = await Master.findOne({
                    username,
                    _id: { $ne: req.params.id },
                });
                if (exists) {
                    return response.error(res, "Bu username band");
                }
            }

            const user = await Master.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: true }
            ).select("-password");

            if (!user) {
                return response.notFound(res, "Usta topilmadi");
            }

            return response.success(res, "Usta yangilandi", user);
        } catch (err) {
            console.error("Update error:", err);
            return response.serverError(res);
        }
    }

    // ================= DELETE =================
    async delete(req, res) {
        try {
            const user = await Master.findByIdAndDelete(req.params.id);
            if (!user) {
                return response.notFound(res, "Usta topilmadi");
            }
            return response.success(res, "Usta o‘chirildi");
        } catch (err) {
            console.error(err);
            return response.serverError(res);
        }
    }

    // ================= full details =================
    async getFullDetails(req, res) {
        try {
            const { id: masterId } = req.params;

            // 1️⃣ Shu master ma’lumotlari
            const master = await Master.findById(masterId).select(
                "fullName phoneNumber role image isActive"
            );

            if (!master) {
                return response.notFound(res, "Master topilmadi");
            }

            // 2️⃣ Shu master bilan bog‘liq orderlar
            const orders = await Order.find({
                $or: [{ receivedBy: masterId }, { repairedBy: masterId }],
            })
                .populate("receivedBy", "fullName phoneNumber role image")
                .populate("repairedBy", "fullName phoneNumber role image")
                .populate("usedParts.part", "name brand model sellPrice")
                .sort({ createdAt: -1 });

            // 3️⃣ Shu master bilan bog‘liq finance yozuvlari
            const finances = await Finance.find({ userId: masterId })
                .populate("userId", "fullName phoneNumber role image")
                .populate("orderId", "customerName status TotalCost")
                .populate("productId", "name brand model sellPrice")
                .sort({ date: -1 });

            // 4️⃣ Boshqa barcha masterlar (shu masterni chiqarib tashlaymiz)
            const otherMasters = await Master.find({ _id: { $ne: masterId } }).select(
                "fullName phoneNumber role image isActive"
            );

            // 5️⃣ JSON formatda optimallashtirilgan natija

            return response.success(res, "Master to'liq ma'lumotlari", {
                master,
                orders,
                finances,
                otherMasters,
            });
        } catch (error) {
            return response.serverError(res, "Server xatosi", error);
        }
    };
}

export default new AuthController();
