import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
    {
        date: String,
        time: String,
    },
    { _id: false }
);

const noteSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            required: true,
            enum: [
                "text",
                "list",
                "amount",
                "image",
                "deadline",
                "goal",
                "shopping",
                "link",
                "idea",
                "location",
            ],
        },

        content: String,
        list: [String],
        amount: String,
        image: String,
        link: String,

        deadlineDate: String,
        deadlineTime: String,

        description: String,

        reminder: {
            type: reminderSchema,
            default: null,
        },

        date: {
            type: String,
        },

        // 🔑 MASTER / OWNER
        master: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // 📌 PIN (zakrepit)
        isPinned: {
            type: Boolean,
            default: false,
            index: true,
        },
        // 🔢 ORDER (drag & drop uchun)
        order: {
            type: Number,
            default: 0,
            index: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("Note", noteSchema);
