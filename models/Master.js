import mongoose from "mongoose";

const masterSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        phoneNumber: {
            type: String,
            required: true,
            trim: true,
        },

        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
        },

        // 🖼 Master rasmi (URL yoki fayl nomi)
        image: {
            type: String,
            default: "", // masalan: "/uploads/masters/default.png"
        },

        // 👤 Master turi
        role: {
            type: String,
            enum: [
                "seller",        // sotuvchi
                "junior_master", // junior master
                "senior_master", // senior master
                "master",        // oddiy master
                "admin"          // admin (ixtiyoriy)
            ],
            default: "master",
        },

        // 🟢 Faol / nofaol
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true, // createdAt, updatedAt
    }
);

export default mongoose.model("Master", masterSchema);
