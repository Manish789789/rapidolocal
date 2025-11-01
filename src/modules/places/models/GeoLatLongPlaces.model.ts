import * as mongoose from "mongoose";

const GeoLatLongPlacesSchema = new mongoose.Schema({
    place_id: { type: String, default: "", trim: true, unique: true },
    formatted_address: { type: String, default: "", trim: true },
    type: { type: String, default: "MAPBOX", trim: true },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], default: [] }
    },
}, { timestamps: true });

GeoLatLongPlacesSchema.index({ location: '2dsphere' });

export default mongoose.model("GeoLatLongPlaces", GeoLatLongPlacesSchema);