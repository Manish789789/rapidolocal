import mongoose from "mongoose";

const DriverMediaSchema = new mongoose.Schema({
    name: { type: String, default: "", trim: true },
    size: { type: String, default: '', trim: true },
    fileName: { type: String, default: "", trim: true },
    type: { type: String, default: "", trim: true },
    thumbnailUrl: { type: String, default: "", trim: true },
    user: { type: mongoose.Schema?.Types.ObjectId, ref: "Drivers" },
}, { timestamps: true });

export default mongoose.model("DriverMedia", DriverMediaSchema);