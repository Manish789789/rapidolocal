import * as mongoose from "mongoose";

const cabBookingSurgeGeoAreaSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    geometry: {
        type: {
            type: String, // Must be "Polygon" for defining areas
            enum: ['Polygon'], // Only Polygon is allowed
            required: true
        },
        coordinates: {
            type: [[[Number]]], // Array of arrays of [longitude, latitude] pairs
            required: true
        }
    },
    demand: { type: Number, default: 0 }, // Active ride requests
    supply: { type: Number, default: 0 }, // Active available drivers
    surgeMultiplier: { type: Number, default: 1 }, // Surge price multiplier
    status: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

cabBookingSurgeGeoAreaSchema.index({ geometry: '2dsphere' });

export default mongoose.models?.cabbooking_surge_geoareas ||
    mongoose.model("cabbooking_surge_geoareas", cabBookingSurgeGeoAreaSchema);

