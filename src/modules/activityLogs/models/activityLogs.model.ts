import mongoose from "mongoose";

const ActivityLogsSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", default: null },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drivers",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ActivityLogs", ActivityLogsSchema);
