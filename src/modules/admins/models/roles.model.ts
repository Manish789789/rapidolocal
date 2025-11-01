import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    status: { type: Boolean, default: true },
    permissions: { type: Object, default: {} },
    madebysuperAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Roles", RoleSchema);
