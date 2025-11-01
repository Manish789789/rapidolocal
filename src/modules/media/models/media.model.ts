import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  size: { type: String, default: '', trim: true },
  fileName: { type: String, default: "", trim: true },
  type: { type: String, default: "", trim: true },
  thumbnailUrl: { type: String, default: "", trim: true },
  storageBucket: {
    bucketName: { type: String, default: "", trim: true },
    fileKey: { type: String, default: "", trim: true },
  }
}, { timestamps: true });

export default mongoose.model("Media", MediaSchema);