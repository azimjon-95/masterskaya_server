// controllers/AuthController.js
import Order from "../models/Order.js";
import Master from "../models/Master.js";
import bcrypt from "bcryptjs";
import redis from "../config/redis.js";
import jwt from "jsonwebtoken";
import response from "../utils/response.js";

class AuthController {
    // LOGIN
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

            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
                expiresIn: "1d",
            });

            const userData = {
                id: user._id,
                username: user.username,
                FullName: user.FullName,
                PhoneNumber: user.PhoneNumber,
            };
            const orders = await Order.find()
                .sort({ createdAt: -1 })
                .populate("receivedBy", "FullName username PhoneNumber")
                .populate("repairedBy", "FullName username PhoneNumber")

            await redis.set("orders", JSON.stringify(orders));


            return response.success(res, "Muvaffaqiyatli kirish", { token, user: userData });
        } catch (err) {
            console.error("Login error:", err);
            return response.serverError(res);
        }
    }

    // GET ALL USERS
    async getAll(req, res) {
        try {
            const users = await Master.find().select("-password");
            return response.success(res, "Barcha ustalar", users);
        } catch (err) {
            console.error("GetAll error:", err);
            return response.serverError(res);
        }
    }

    // GET USER BY ID
    async getById(req, res) {
        try {
            const user = await Master.findById(req.params.id).select("-password");
            if (!user) {
                return response.notFound(res, "Usta topilmadi");
            }
            return response.success(res, "Usta ma'lumotlari", user);
        } catch (err) {
            console.error("GetById error:", err);
            return response.serverError(res);
        }
    }

    // CREATE NEW USER
    async create(req, res) {
        try {
            const { FullName, PhoneNumber, username, password } = req.body;

            if (!FullName || !username || !password) {
                return response.error(res, "To'liq ism, username va parol majburiy");
            }

            const exists = await Master.findOne({ username });
            if (exists) {
                return response.error(res, "Bu username allaqachon band");
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new Master({
                FullName,
                PhoneNumber,
                username,
                password: hashedPassword,
            });

            await newUser.save();

            const userData = {
                id: newUser._id,
                FullName: newUser.FullName,
                PhoneNumber: newUser.PhoneNumber,
                username: newUser.username,
            };

            return response.created(res, "Yangi usta muvaffaqiyatli qo'shildi", userData);
        } catch (err) {
            console.error("Create user error:", err);
            return response.serverError(res);
        }
    }

    // UPDATE USER (YANGI QO'SHILGAN – foydali bo'ladi)
    async update(req, res) {
        try {
            const { FullName, PhoneNumber, username, password } = req.body;

            const updateData = { FullName, PhoneNumber, username };

            if (password) {
                updateData.password = await bcrypt.hash(password, 10);
            }

            // Username o'zgarganda tekshirish
            if (username) {
                const exists = await Master.findOne({ username, _id: { $ne: req.params.id } });
                if (exists) {
                    return response.error(res, "Bu username allaqachon band");
                }
            }

            const user = await Master.findByIdAndUpdate(req.params.id, updateData, {
                new: true,
                runValidators: true,
            }).select("-password");

            if (!user) {
                return response.notFound(res, "Usta topilmadi");
            }

            return response.success(res, "Usta ma'lumotlari yangilandi", user);
        } catch (err) {
            console.error("Update user error:", err);
            return response.serverError(res);
        }
    }

    // DELETE USER
    async delete(req, res) {
        try {
            const user = await Master.findByIdAndDelete(req.params.id);
            if (!user) {
                return response.notFound(res, "Usta topilmadi");
            }
            return response.success(res, "Usta muvaffaqiyatli o'chirildi");
        } catch (err) {
            console.error("Delete user error:", err);
            return response.serverError(res);
        }
    }
}

export default new AuthController();