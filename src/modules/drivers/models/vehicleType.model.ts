import mongoose from "mongoose";

const VehicleTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please enter your name"],
    trim: true,
  },
  country: { type: mongoose.Schema.Types.ObjectId, ref: "Countries" },
  seats: { type: Number, default: 0 },
  priority: {
    type: Number,
    default: 0
  },
  icon: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });
export default mongoose.model("VehicleTypes", VehicleTypeSchema);
