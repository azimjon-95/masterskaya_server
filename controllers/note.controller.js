import Note from "../models/note.model.js";
import redis from "../config/redis.js";
import { io } from "../config/socket.js";
import { uploadToImgBB } from "../utils/imgbb.js";
import response from "../utils/response.js";
import mongoose from "mongoose";

class NoteController {
    // ✅ CREATE (image bilan)
    static async create(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            let imageUrl = null;

            if (req.file) {
                imageUrl = await uploadToImgBB(req.file.path);
            }

            const note = await Note.create([{
                ...req.body,
                image: imageUrl,
                order: req.body.order ?? 0,
            }], { session });

            await redis.del(`notes:${note[0].master}`);

            await session.commitTransaction();
            session.endSession();

            io.emit("note:create", note[0]);

            return response.created(res, "Note yaratildi", note[0]);
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            return response.serverError(res, error.message);
        }
    }


    // ✅ GET ALL (faqat master)
    static async getMyNotes(req, res) {
        try {
            const { master } = req.query;
            const masterId = master;

            const cacheKey = `notes:${masterId}`;

            const cached = await redis.get(cacheKey);
            if (cached) {
                return response.success(res, "Notes", JSON.parse(cached));
            }

            const notes = await Note.find({ master: masterId })
                .sort({
                    isPinned: -1,   // 📌 pinned yuqorida
                    createdAt: -1, // yangi yuqorida
                    order: 1,      // eski tartib bo‘yicha
                });

            await redis.set(cacheKey, JSON.stringify(notes), "EX", 60);

            return response.success(res, "Notes", notes);
        } catch (error) {
            return response.serverError(res, error.message);
        }
    }

    // ✅ GET ONE
    static async getOne(req, res) {
        try {
            const { id } = req.params;
            const masterId = req.user.id;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return response.badRequest(res, "Noto‘g‘ri ID");
            }

            const note = await Note.findOne({ _id: id, master: masterId });

            if (!note) {
                return response.notFound(res, "Note topilmadi");
            }

            return response.success(res, "Note", note);
        } catch (error) {
            return response.serverError(res, error.message);
        }
    }

    // ✅ UPDATE (image yangilash mumkin)
    static async update(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { id } = req.params;
            const masterId = req.user.id;

            let updateData = { ...req.body };

            if (req.file) {
                updateData.image = await uploadToImgBB(req.file.path);
            }

            const note = await Note.findOneAndUpdate(
                { _id: id, master: masterId },
                updateData,
                { new: true, session }
            );

            if (!note) {
                throw new Error("Note topilmadi");
            }

            await redis.del(`notes:${masterId}`);

            await session.commitTransaction();
            session.endSession();

            io.emit("note:update", note);

            return response.success(res, "Note yangilandi", note);
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            return response.serverError(res, error.message);
        }
    }


    // ✅ DELETE ONE
    static async delete(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { id } = req.params;
            const masterId = req.user.id;

            const note = await Note.findOneAndDelete(
                { _id: id, master: masterId },
                { session }
            );

            if (!note) {
                throw new Error("Note topilmadi");
            }

            await redis.del(`notes:${masterId}`);

            await session.commitTransaction();
            session.endSession();

            io.emit("note:delete", id);

            return response.success(res, "Note o‘chirildi");
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            return response.serverError(res, error.message);
        }
    }


    // 🚨 DELETE ALL BY MASTER ID
    static async deleteAllByMasterId(req, res) {
        try {
            const masterId = req.user.id;

            const result = await Note.deleteMany({ master: masterId });

            await redis.del(`notes:${masterId}`);
            io.emit("note:deleteAll", masterId);

            return response.success(
                res,
                "Barcha notelar o‘chirildi",
                { deletedCount: result.deletedCount }
            );
        } catch (error) {
            return response.serverError(res, error.message);
        }
    }

    // ✅ TOGGLE PIN
    static async togglePin(req, res) {
        try {
            const { id } = req.params;
            const { master: masterId } = req.query;

            const note = await Note.findOne({
                _id: id,
                master: masterId,
            });

            if (!note) {
                return response.notFound(res, "Note topilmadi");
            }

            note.isPinned = !note.isPinned;
            await note.save();

            await redis.del(`notes:${masterId}`);
            io.emit("note:pin", note);

            return response.success(
                res,
                note.isPinned ? "Note zakrepit qilindi" : "Note zakrepiti olib tashlandi",
                note
            );
        } catch (error) {
            return response.serverError(res, error.message);
        }
    }

    // ✅ REORDER NOTES
    static async reorderNotes(req, res) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const masterId = req.user.id;
            const { orders } = req.body;

            if (!Array.isArray(orders)) {
                return response.badRequest(res, "Orders array bo‘lishi kerak");
            }

            const bulkOps = orders.map(item => ({
                updateOne: {
                    filter: { _id: item.id, master: masterId },
                    update: { $set: { order: item.order } },
                },
            }));

            await Note.bulkWrite(bulkOps, { session });

            await redis.del(`notes:${masterId}`);

            await session.commitTransaction();
            session.endSession();

            io.emit("note:reorder", orders);

            return response.success(res, "Tartib yangilandi");
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            return response.serverError(res, error.message);
        }
    }


}

export default NoteController;
