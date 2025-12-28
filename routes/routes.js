import { Router } from "express";
import AuthController from "../controllers/auth.controller.js";
import OrderController from "../controllers/order.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { upload } from "../utils/multer.js";
import FinanceController from "../controllers/FinanceController.js";
import DeviceController from "../controllers/DeviceController.js";
import PartController from "../controllers/partController.js";
const router = Router();

// ================= AUTH =================

// LOGIN
router.post("/login", AuthController.login);
router.get("/users", protect, AuthController.getAll);
router.get("/users/:id", protect, AuthController.getById);
router.post("/users", AuthController.create);
router.delete("/users/:id", protect, AuthController.delete);

// ================= ORDERS =================

// CREATE ORDER
router.post(
    "/orders",
    upload.fields([
        { name: "phoneImage", maxCount: 1 },
        { name: "clientImage", maxCount: 1 }
    ]),
    OrderController.create
);
router.get("/orders", protect, OrderController.getOrders);
router.get("/orders/:id", protect, OrderController.getById);
router.put("/status/:id", protect, OrderController.updateStatus);
router.put("/waiting/:id", protect, OrderController.updateWaiting);
router.get("/waiting-orders", protect, OrderController.getWaitingOrders);
router.put(
    "/orders/:id",
    protect,
    upload.fields([
        { name: "phoneImage", maxCount: 1 },
        { name: "clientImage", maxCount: 1 }
    ]),
    OrderController.update
);
router.delete("/orders/:id", protect, OrderController.delete);

// ================= FINANCE =================
router.get("/finance", protect, FinanceController.getAll);           // tranzaksiyalar + balans
router.post("/finance", protect, FinanceController.create);          // yangi tranzaksiya
router.delete("/finance/:id", protect, FinanceController.delete);     // o'chirish
router.get("/balance", protect, FinanceController.getBalance); // faqat balans (tez yuklash uchun)


// ================= Android endpoints =================
router.get("/android/full-info", protect, DeviceController.fullInfoAndroid);
router.get("/android/power", protect, DeviceController.powerAndroid);

// ================= iOS endpoints =================
router.get("/ios/device", protect, DeviceController.deviceInfoIOS);
router.get("/ios/battery", protect, DeviceController.batteryIOS);
router.get("/ios/logs", protect, DeviceController.logsIOS);

// ================= PARTS =================
router.post("/port", protect, PartController.addPart);
router.get("/port", protect, PartController.getParts);
router.put("/port/:id", protect, PartController.updatePart);
router.delete("/port/:id", protect, PartController.deletePart);
router.post("/port/sell/:id", protect, PartController.sellPart);
router.get("/port/sales", protect, PartController.getSales);
export default router;
