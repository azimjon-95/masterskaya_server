import jwt from "jsonwebtoken";
import response from "../utils/response.js";
import Master from "../models/Master.js";

export default async function protect(req, res, next) {
    try {
        // 1️⃣ Headerdan token olish
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return response.unauthorized(res, "Token topilmadi");
        }

        const token = authHeader.split(" ")[1];

        // 2️⃣ Tokenni tekshirish
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3️⃣ Foydalanuvchini DB dan topish
        const user = await Master.findById(decoded.id).select("-password");
        if (!user) {
            return response.unauthorized(res, "Foydalanuvchi topilmadi");
        }

        // 4️⃣ req.user ga ma'lumot qo'yish
        req.user = {
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            image: user.image,
        };

        next(); // keyingi middleware yoki controller ga o‘tish
    } catch (err) {
        console.error("Protect middleware error:", err);
        return response.unauthorized(res, "Token noto‘g‘ri yoki muddati tugagan");
    }
}
