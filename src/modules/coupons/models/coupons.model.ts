import mongoose from "mongoose";

const CouponsSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  country: { type: mongoose.Schema.Types.ObjectId, ref: "Countries" },
  discountType: { type: String, enum: ['percentage', 'flat'], required: true },
  discountAmount: { type: Number, required: true, default: 0 },
  uptoAmount: { type: Number, default: 0 }, // maximum discount
  usageLimit: {
    type: Number,
    default: 0 // 0 means unlimited
  }, //maximum number of times a coupon can be used.
  usedCount: {
    type: Number,
    default: 0 // 0 means unlimited
  }, // particular customer .. number of times the coupon has been used.
  selectedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null }],
  geoAreas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GeoAreas', default: null }],
  autoApply: { type: Boolean, default: false },
  validFor: { type: String, enum: ['newUsers', 'allUsers', 'selectedUsers'], default: 'allUsers' },
  genratedBy: { type: String, enum: ['auto', 'systemUser'], default: "systemUser" },
  status: { type: Boolean, default: true },
  startedAt: { type: Date, default: Date },
  expiredAt: { type: Date, default: null },
},
  { timestamps: true }
);

export default mongoose.model("Coupons", CouponsSchema);
