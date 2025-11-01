import mongoose from "mongoose";

const GeoZonesSchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: { type: String, required: true },
  location: {
    type: { type: String, default: 'Polygon' }, // Specify the type as 'Point' for GeoJSON
    coordinates: { type: [[[Number]]], default: [] }, // Array of [longitude, latitude] for GeoJSON
  },
  geoPoint: {
    type: { type: String, default: 'Point' }, // Specify the type as 'Point' for GeoJSON
    coordinates: { type: [Number], default: [] }, // Array of [longitude, latitude] for GeoJSON
  },
  status: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

GeoZonesSchema.index({ location: '2dsphere' });

export default mongoose.model("GeoZones", GeoZonesSchema);
