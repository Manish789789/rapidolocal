import mongoose from "mongoose";

const DriverAuthActivitySchema = new mongoose.Schema({
  browserName: { type: String, default: "", trim: true },
  osName: { type: String, default: "", trim: true },
  ip: { type: String, default: "", trim: true },
  location: { type: String, default: "", trim: true },
  loginAt: { type: Date, default: new Date },
  expiredAt: { type: Date, default: new Date }, // 5 is min
  logoutAt: { type: Date, default: null },
  lastActive: { type: Date, default: null },
  isMobile: { type: Boolean, default: false },
  token: { type: String, default: "", trim: true, index: true },
  fcmToken: { type: String, default: "", trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
  userLocation: { type: Object, default: {} },
}, { timestamps: true });
export default mongoose.models?.UserAuthActivity || mongoose.model("UserAuthActivity", DriverAuthActivitySchema);