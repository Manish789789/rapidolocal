import * as mongoose from "mongoose";

const pricingModelSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    vehicleType: { type: {}, default: null },
}, { timestamps: true });

export default mongoose.model("pricingforusers", pricingModelSchema);