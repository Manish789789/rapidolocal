import * as mongoose from "mongoose";

const GeoPlacesSchema = new mongoose.Schema({
    place_id: { type: String, default: "", trim: true, unique: true },
    address: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true, },
    country: { type: String, default: "", trim: true, },
    type: { type: String, default: "MAPBOX", trim: true },
    location: { type: { type: String, default: 'Point' }, coordinates: { type: [Number], default: [] } },
}, { timestamps: true });

export default mongoose.model("GeoPlaces", GeoPlacesSchema);