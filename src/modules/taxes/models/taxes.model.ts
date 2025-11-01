import mongoose from "mongoose";

const TaxesSchema = new mongoose.Schema({
  country: { type: String, required: true },
  taxes: [{
    state: {
      label: { type: String, default: "" },
      value: { type: String, default: "" },
    },
    tax: [
      {
        name: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        taxType: { type: String, enum: ["Flat", "Percentage"], default: "Percentage" }
      }
    ],
  }],
  status: { type: Boolean, default: true },
},
  { timestamps: true }
);

export default mongoose.model("Taxes", TaxesSchema);
