// models/BookingMap.ts
import mongoose, { Schema, Document } from "mongoose";

export interface BookingMap extends Document {
  bookingId: string;
  partyA: string;
  partyB: string;
}

const BookingMapSchema = new Schema<BookingMap>({
  bookingId: { type: String, required: true, unique: true },
  partyA: { type: String, required: true },
  partyB: { type: String, required: true }
});

export default mongoose.model<BookingMap>("BookingMap", BookingMapSchema);
