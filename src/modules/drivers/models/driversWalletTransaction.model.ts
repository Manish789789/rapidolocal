import mongoose from "mongoose";

const DriversWalletTransactionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, "Please enter description"],
    trim: true,
  },
  amount: {
    type: Number,
    default: 0.00,
    trim: true,
  },
  trxType: {
    type: String,
    default: "Credit",
    trim: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RideBookings",
    defautl: null,
  },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "Drivers" },
}, { timestamps: true });

export default mongoose.model("DriversWalletTransaction", DriversWalletTransactionSchema);
