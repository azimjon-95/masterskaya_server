import fs from "fs";
import axios from "axios";

export const uploadToImgBB = async (filePath) => {
    try {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString("base64");

        const res = await axios.post(
            "https://api.imgbb.com/1/upload",
            new URLSearchParams({
                key: process.env.IMGBB_API_KEY,
                image: base64,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        return res.data.data.url;

    } catch (err) {
        console.error("ImgBB upload error:", err?.response?.data || err.message);
        throw err;
    } finally {
        // 🔥 HAR DOIM uploads dan o‘chadi
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
};










// import fs from "fs";
// import axios from "axios";

// export const uploadToImgBB = async (filePath) => {
//     try {
//         const buffer = fs.readFileSync(filePath);
//         const base64 = buffer.toString("base64");

//         // const res = await axios.post(
//         //     "https://api.imgbb.com/1/upload",
//         //     new URLSearchParams({
//         //         key: process.env.IMGBB_API_KEY,
//         //         image: base64,
//         //     })
//         // );
//         const res = await axios.post(
//             "https://api.imgbb.com/1/upload",
//             new URLSearchParams({
//                 key: process.env.IMGBB_API_KEY,
//                 image: base64,
//             }),
//             {
//                 headers: {
//                     "Content-Type": "application/x-www-form-urlencoded",
//                 },
//             }
//         );

//         return res.data.data.url;
//     } finally {
//         // vaqtinchalik faylni o‘chiramiz
//         if (fs.existsSync(filePath)) {
//             fs.unlinkSync(filePath);
//         }
//     }
// };
