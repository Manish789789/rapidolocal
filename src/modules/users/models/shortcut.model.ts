import * as mongoose from "mongoose";

const ShortcutsBookingsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Please enter shortcut title"],
        trim: true,
    },
    placeId: {
        type: String,
        default: "",
        trim: true,
    },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number],
        default: {
            coordinates: []
        }
    },
    address: {
        type: String,
        required: [true, "Please enter your address"],
        trim: true
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
}, { timestamps: true });

ShortcutsBookingsSchema.index({ location: '2dsphere' });
export default mongoose.model("shortcuts", ShortcutsBookingsSchema);