import mongoose from "mongoose";

const masterSchema = new mongoose.Schema({
    FullName: String,
    PhoneNumber: String,
    username: { type: String, unique: true },
    password: String
});

export default mongoose.model("Master", masterSchema);
