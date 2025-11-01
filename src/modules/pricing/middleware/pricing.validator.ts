import { t } from "elysia";

export const servicesSearchValidator = t.Object({
  country: t.String({
    pattern: "^[a-fA-F0-9]{24}$",
    error: "Invalid country"
  })
});
// Reusable parts
const pricingDetails = t.Object({
  vehicle: t.String({ error: "Vehicle is required." }),
  name: t.String({ error: "Vehicle name is required." }),
});

const perKmPricing = t.Object({
  kmFrom: t.Number({ error: "From KM is required." }),
  kmTo: t.Number({ error: "To KM is required." }),
  price: t.Number({ error: "Price is required." }),
});

const cancellationCharges = t.Object({
  beforeArrival: t.Number({ minimum: 0, error: "Before arrival is required." }),
  afterArrival: t.Number({ minimum: 0, error: "After arrival is required." }),
});

const vehiclePricing = t.Object({
  vehicleType: pricingDetails,
  perMinPricing: t.Number({ minimum: 0, error: "Per min pricing is required." }),
  basePrice: t.Number({ minimum: 0, error: "Base price is required." }),
  minimumFare: t.Number({ minimum: 0, error: "Minimum fare is required." }),
  waitingTime: t.Number({ minimum: 0, error: "Waiting time is required." }),
  waitingRate: t.Number({ minimum: 0, error: "Waiting rate is required." }),
  freeMinutes: t.Number({ minimum: 0, error: "Free minutes are required." }),

  withBoosterSeat: t.Number({ minimum: 0, error: "With booster seat is required." }),
  withPet: t.Number({ minimum: 0, error: "With pet is required." }),

  perKmPricing: t.Array(perKmPricing, { error: "Per KM pricing is required." }),
  cancellationCharges: cancellationCharges
});

// Dynamic vehicleId -> pricing map (vehicleId as 24-char hex)
const dynamicPricingMap = t.Record(
  t.String({ pattern: "^[a-fA-F0-9]{24}$" }),
  vehiclePricing
);

const dynamicPricing = t.Object({
  user: dynamicPricingMap,
  driver: dynamicPricingMap,
});

// Final schema (converted from Yup)
export const createPricing = t.Object({
  states: t.Optional(t.Array(t.String({ pattern: "^[a-fA-F0-9]{24}$" }))),
  geo: t.Optional(t.Array(t.String({ pattern: "^[a-fA-F0-9]{24}$" }))),
  country: t.String({
    pattern: "^[a-fA-F0-9]{24}$",
    error: "Country is required",
  }),
  pricingType: t.String({
    enum: ["state", "geo"],
    error: "Pricing type is required",
  }),
  status: t.String({ enum: ["true", "false"], error: "Status is required" }),
  pricing: t.Object({
    withoutPool: dynamicPricing,
    withPool: dynamicPricing,
  }, {
    error: "Pricing details are required"
  }),
});
