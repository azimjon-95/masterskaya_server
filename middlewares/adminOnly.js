// middleware/adminOnly.js
import response from "../utils/response.js";

export default function adminOnly(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return response.forbidden(res, "Faqat admin ruxsatiga ega");
    }
    next();
}