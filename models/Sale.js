import mongoose from "mongoose";

const SaleSchema = new mongoose.Schema({
    part: { type: mongoose.Schema.Types.ObjectId, ref: "Part", required: true },
    name: { type: String },
    brand: { type: String },
    model: { type: String },
    color: { type: String },
    size: { type: String },

    sellPrice: { type: Number },
    buyPrice: { type: Number },
    currency: { type: String, enum: ["UZS", "USD"], default: "UZS" },

    quantity: { type: Number, required: true },
    totalPrice: { type: Number },
    profit: { type: Number },

    soldAt: { type: Date, default: Date.now }, // aniq vaqt
});

export default mongoose.model("Sale", SaleSchema);
