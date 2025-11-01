import mongoose from "mongoose";

const GeoAreasSchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: { type: String, required: true },
  countryDetail: { type: mongoose.Schema.Types.ObjectId, ref: "Countries" },
  location: {
    type: {
      type: String,
      enum: ['Polygon'],
      required: true,
      default: 'Polygon'
    },
    coordinates: {
      type: [[[Number]]],
      required: true
    }
  },
  demand: { type: Number, default: 0 }, // Active ride requests
  supply: { type: Number, default: 0 }, // Active available drivers
  surgeMultiplier: { type: Number, default: 1.0 }, // net Surge
  surgeDemandSupply: { type: Number, default: 1.0 }, // Surge price multiplier based on demand and supply
  staticSurge: { type: Number, default: 0 },// Surge managed by admin
  weatherSurge: { type: Number, default: 0 }, // Used due to weather
  status: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

export default mongoose.model("GeoAreas", GeoAreasSchema);
