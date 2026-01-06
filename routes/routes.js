import { Router } from "express";
import AuthController from "../controllers/auth.controller.js";
import OrderController from "../controllers/order.controller.js";
import { upload } from "../utils/multer.js";
import FinanceController from "../controllers/FinanceController.js";
import DeviceController from "../controllers/DeviceController.js";
import PartController from "../controllers/partController.js";
import DashboardController from "../controllers/DashboardController.js";
import NoteController from "../controllers/note.controller.js";
import protect from "../middlewares/protect.js";
import adminOnly from "../middlewares/adminOnly.js";
const router = Router();

// ================= AUTH =================

// LOGIN
router.post("/login", AuthController.login);
router.get("/users", protect, AuthController.getAll);
router.get("/users/:id", protect, AuthController.getById);
router.get("/users/:id/full-details", protect, AuthController.getFullDetails);
// CREATE user (admin)
router.post(
    "/users",
    // adminOnly,
    protect,
    upload.single("image"),
    AuthController.create
);

// DELETE user (admin)
router.delete(
    "/users/:id",
    protect,
    adminOnly,
    AuthController.delete
);
// UPDATE user (admin)
router.put(
    "/users/:id",
    protect,
    adminOnly,
    upload.single("image"),
    AuthController.update
);

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
router.post("/add-used-part", protect, OrderController.addUsedPart);
// ================= FINANCE =================
router.get("/finance", protect, FinanceController.getAll);           // tranzaksiyalar + balans
router.post("/finance", protect, FinanceController.create);          // yangi tranzaksiya
router.delete("/finance/:id", protect, FinanceController.delete);     // o'chirish
router.get("/balance", protect, FinanceController.getBalance); // faqat balans (tez yuklash uchun)
router.get("/finance/debtors", protect, FinanceController.getAllDebts);
router.post("/debt/pay", protect, FinanceController.payDebtByPhone);
// ================= Android endpoints =================
router.get("/android/full-info", protect, DeviceController.fullInfoAndroid);
router.get("/android/power", protect, DeviceController.powerAndroid);

// ================= iOS endpoints =================
router.get("/ios/device", protect, DeviceController.deviceInfoIOS);
router.get("/ios/battery", protect, DeviceController.batteryIOS);
router.get("/ios/logs", protect, DeviceController.logsIOS);
router.get("/device_info", protect, DeviceController.getFullDeviceInfo);

// ================= PARTS =================
router.post("/port", protect, PartController.addPart);
router.get("/port", protect, PartController.getParts);
router.put("/port/:id", protect, PartController.updatePart);
router.delete("/port/:id", protect, PartController.deletePart);
router.post("/port/sell/:id", protect, PartController.sellPart);
router.get("/port/sales", protect, PartController.getSales);
router.get("/port/extiyot-parts", protect, PartController.getExtiyotParts);
// ================= Dashboard =================
router.get("/dashboard", DashboardController.getDashboardData);


// ================= Note =================
router.post("/note", protect, upload.single("image"), NoteController.create);
router.get("/note", protect, NoteController.getMyNotes);
router.get("/note/:id", protect, NoteController.getOne);
router.put("/note/:id", protect, upload.single("image"), NoteController.update);
router.delete("/note/:id", protect, NoteController.delete);
router.delete("/note", protect, NoteController.deleteAllByMasterId);
router.patch("/note/:id/pin", NoteController.togglePin);
router.patch("/reorder", NoteController.reorderNotes);

export default router;
