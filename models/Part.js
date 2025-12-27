import mongoose from "mongoose";

const partSchema = new mongoose.Schema({
    name: { type: String, required: true },
    brand: { type: String, required: true },
    model: { type: String, required: true },

    buyPrice: { type: Number, required: true },
    sellPrice: { type: Number, required: true },

    currency: {
        type: String,
        enum: ["UZS", "USD"],
        default: "UZS"
    },

    quantity: { type: Number, default: 0 },
    color: { type: String, default: "Muhim emas" },
    size: { type: String, default: "Standard" },
    type: { type: String, default: "Extiyot qismlar" },

    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Part", partSchema);
