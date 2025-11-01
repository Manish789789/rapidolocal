import mongoose from "mongoose";



const DriversVehicalInformationSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "Drivers" },
  // vehicalsInformation: {
    documents: [
      {
        docType: {
          type: String,
          required: true,
        },
        verifiedAI: { type: Boolean, default: false },
        verifiedAdmin: { type: Boolean, default: false },
        rejectedReason: { type: String, default: "" },
        data: {
          type: Object,
          default: {},
        },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  // },
});
export default mongoose.model(
  "DriversVehicalInformation",
  DriversVehicalInformationSchema
);
