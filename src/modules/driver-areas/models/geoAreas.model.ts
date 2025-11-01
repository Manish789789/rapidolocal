import mongoose from "mongoose";

const DriverGeoAreasSchema = new mongoose.Schema(
  {
    country: { type: String, required: true },
    city: { type: String, default: "" },
    location: {
      type: {
        type: String,
        enum: ["Polygon"],
        required: true,
        default: "Polygon",
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
      },
    },
    staticSurge: { type: Number, default: 0 },
    status: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

DriverGeoAreasSchema.index({ location: "2dsphere" });

export default mongoose.model("DriverGeoAreas", DriverGeoAreasSchema);
