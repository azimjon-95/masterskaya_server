import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";

import { connectDB } from "./config/db.js";
import { initSocket } from "./config/socket.js";
import "./config/redis.js";

// ROUTES
import routes from "./routes/routes.js";

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/v1", routes);

// DB
connectDB();

// Server + Socket
const server = http.createServer(app);
initSocket(server);

server.listen(process.env.PORT || 4070, () => {
    console.log("🚀 Server running on http://localhost:4070");
});
