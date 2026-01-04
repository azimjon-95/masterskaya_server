// utils/clearFinanceCache.js
import redis from "../config/redis.js";

export async function clearFinanceCache() {
    try {
        const keys = await redis.keys("finance:*");
        if (keys.length) {
            await redis.del(keys);
        }
    } catch (err) {
        console.warn("Redis clear error:", err);
    }
}
