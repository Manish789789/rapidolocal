import mongoose from "mongoose";

const WalletTransactionsSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: Boolean,
      default: false,
    },
    trxType: {
      type: String,
      enum: ["Credit", "Debit"],
      default: "Credit",
    },
    currency: {
      currencyCode: {
        type: String,
        required: [true, "Please enter currency code."],
        default: "cad",
        trim: true,
      },
      currencySymbol: {
        type: String,
        required: [true, "Please enter currency symbol."],
        default: '$',
        trim: true,
      },
    },
    trxId: {
      type: String,
      default: "",
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
  },
  { timestamps: true }
);
export default mongoose.model(
  "UserWalletTransactions",
  WalletTransactionsSchema
);
