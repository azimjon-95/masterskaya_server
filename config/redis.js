import Redis from "ioredis";

const redis = new Redis({
    host: "127.0.0.1",
    port: 6379
});

redis.on("connect", () => {
    console.log("⚡ Redis connected");
});

export default redis;


// // config/redis.js
// import { Redis } from '@upstash/redis';

// const redis = new Redis({
//     url: process.env.UPSTASH_REDIS_URL,
//     token: process.env.UPSTASH_REDIS_TOKEN,
// });

// redis.on && redis.on("connect", () => {
//     console.log("⚡ Upstash Redis connected");
// });

// export default redis;
