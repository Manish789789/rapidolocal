import mongoose from "mongoose";

// Sub-schemas aligned with validator

const VehicleTypeSchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleTypes", required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const PerKmPricingSchema = new mongoose.Schema(
  {
    // Validator allows strings for these fields
    kmFrom: { type: Number, required: true },
    kmTo: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const CancellationChargesSchema = new mongoose.Schema(
  {
    beforeArrival: { type: Number, min: 0, required: true, default: 0 },
    afterArrival: { type: Number, min: 0, required: true, default: 0 },
  },
  { _id: false }
);

const VehiclePricingSchema = new mongoose.Schema(
  {
    vehicleType: { type: VehicleTypeSchema, required: true },
    perMinPricing: { type: Number, min: 0, required: true, default: 0 },
    basePrice: { type: Number, min: 0, required: true, default: 0 },
    minimumFare: { type: Number, min: 0, required: true, default: 0 },
    waitingTime: { type: Number, min: 0, required: true, default: 0 },
    waitingRate: { type: Number, min: 0, required: true, default: 0 },
    freeMinutes: { type: Number, min: 0, required: true, default: 0 },

    withWomenDriver: { type: Number, min: 0, required: true, default: 0 },
    withBoosterSeat: { type: Number, min: 0, required: true, default: 0 },
    withPet: { type: Number, min: 0, required: true, default: 0 },

    perKmPricing: { type: [PerKmPricingSchema], default: [] },
    cancellationCharges: { type: CancellationChargesSchema, required: true },
  },
  { _id: false }
);

// Main schema aligned with Elysia validator (dynamic maps for user/driver)
const PricingSchema = new mongoose.Schema(
  {

    // Validator accepts a 24-char hex string; store as ObjectId reference
    country: { type: mongoose.Schema.Types.ObjectId, ref: "Countries", required: true },

    pricingType: { type: String, enum: ["state", "geo"], required: true },
    // Optional arrays for state/geo areas
    states: [{ type: mongoose.Schema.Types.ObjectId, ref: "States", default: null }],
    geo: [{ type: mongoose.Schema.Types.ObjectId, ref: "GeoAreas", default: null }],

    // pricing.user and pricing.driver are maps keyed by vehicleId -> VehiclePricing
    pricing: {
      withoutPool: {
        user: { type: Map, of: VehiclePricingSchema, default: {} },
        driver: { type: Map, of: VehiclePricingSchema, default: {} },
      },
      withPool: {
        user: { type: Map, of: VehiclePricingSchema, default: {} },
        driver: { type: Map, of: VehiclePricingSchema, default: {} },
      }
    },

    status: { type: Boolean, default: true, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Pricing", PricingSchema); 