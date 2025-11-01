import mongoose from "mongoose";

const DriversWithdrawalSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "Drivers" },
  amount: {
    type: Number,
    default: 0,
  },
  totalRides: {
    type: Number,
    default: 0,
  },
  status: {
    type: Number,
    default: 0 //0 for just created, 1 for payout started, 2 for success, 3 for failed
  },
  txnId: {
    type: String,
    default: '',
    index: true
  },
  confirmation_number: {
    type: String,
    default: '',
  },
  txnTime: {
    type: Date,
    default: null,
  },
  txnFailReason: {
    type: String,
    default: null,
  },
}, { timestamps: true });

export default mongoose.model("DriversWithdrawal", DriversWithdrawalSchema);

