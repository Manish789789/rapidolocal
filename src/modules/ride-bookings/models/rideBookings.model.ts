import mongoose from "mongoose";

export const bookingStatus = {
  finding_driver: "finding_driver",
  ontheway: "ontheway",
  arrived: "arrived",
  picked: "picked",
  completed: "completed",
  canceled: "canceled",
};

export const generatePoolId = () => {
  const timestamp = Math.floor(Date.now() / (1000 * 60));
  const randomNumberEnd = Math.floor(1000 + Math.random() * 9000);
  return `${timestamp}${randomNumberEnd}`;
};

const driverEarning = new mongoose.Schema({
  fare: { type: Number, default: 0 },
  waitingPrice: { type: Number, default: 0 },
  cancellationPrice: { type: Number, default: 0 },
  forReservationPrice: { type: Number, default: null },
  serviceFee: { type: Number, default: 0 },
  otherEarning: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  driverTax: { type: Number, default: 0 },
  tips: { type: Number, default: 0 },
  subTotal: { type: Number, default: 0 },
  expenses: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
});

const driverRating = new mongoose.Schema({
  stars: { type: Number, default: 0 },
  description: { type: String, default: "" },
});

const userRating = new mongoose.Schema({
  stars: { type: Number, default: 0 },
  description: { type: String, default: "" },
});

const userBilling = new mongoose.Schema({
  routeFare: { type: Number, default: 0 },
  tax: {
    percentage: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
  },
  tip: { type: Number, default: 0 },
  cancellationCharges: { type: Number, default: 0 },
  extraCharges: [
    {
      description: { type: String, default: "" },
      charges: { type: Number, default: 0 },
    },
  ],
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
});

const bookingPoolDetails = new mongoose.Schema(
  {
    poolId: { type: String, required: true, default: generatePoolId },
    bookingIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "CabBookings" }],
    stopPool: { type: Boolean, default: false },
    maxCapacity: { type: Number, required: true, default: 4 },
    currentPassengers: { type: Number, default: 0 },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
  },
  { timestamps: true }
);

const RideBookingsSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: [true, "Please enter the order no"],
      trim: true,
    },
    serviceType: {
      type: String,
      default: "rideBooking", // rideBooking, carRental, FoodDelievery, ParcelDelievery
      trim: true,
    },
    estimatedDirection: {
      type: String,
      default: "",
      trim: true,
    },
    actualDirection: {
      type: String,
      default: "",
      trim: true,
    },
    driverRouteString: {
      type: String,
      default: "",
      trim: true,
    },
    country: {
      name: {
        type: String,
        required: [true, "Please enter country."],
        trim: true,
      },
      countryCode: {
        type: String,
        required: [true, "Please enter country code."],
        trim: true,
      },
      currencyCode: {
        type: String,
        required: [true, "Please enter currency code."],
        trim: true,
      },
      currencySymbol: {
        type: String,
        required: [true, "Please enter currency symbol."],
        trim: true,
      },
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: "Coupons",
    },
    tripAddress: {
      type: Array,
      default: [],
    },
    firstTripAddressGeoLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // Array of numbers: [longitude, latitude]
        default: [0.01, 0.02],
      },
    },
    notesType: {
      type: [
        {
          noteFor: { type: String, default: "pickup" }, // pickup or drop or stop
          details: { type: String, default: "" },
        },
      ],
      default: [],
    },
    lost: {
      itemType: { type: Array, default: [] },
      seatType: { type: String, default: "" },
      contact: { type: String, default: "" },
    },
    vehicleType: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleTypes" },
    vehicleTypeDetails: { type: Object, default: {} },
    selectedVehicle: { type: {}, default: null },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drivers",
      index: true,
    },
    missedJobRequestDrivers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Drivers" },
    ],
    rejectedDriver: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
    askDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
    askBusyDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
    askDriver: {
      driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Drivers",
        default: null,
      },
      expTime: { type: Date, default: null },
    },
    otherVehicleInfo: { type: Array, default: [] },
    matchJobDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
    priorityDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
    onlineStatus: {
      driver: String,
      user: String,
    },
    tip: { type: Number, default: 0 },
    tipStatus: { type: String, default: "Failed" },
    carPoolDetails: {
      isBookingUnderPool: { type: Boolean, default: false },
      bookingPoolDetails: { type: bookingPoolDetails, default: null },
    },
    lastMsg: {
      type: {
        msg: { type: String, default: "" },
        from: {
          type: String,
          enum: ["customer", "driver"],
          default: "driver",
        },
      },
      trim: true,
    },
    tax: {
      type: Object,
      default: {
        percentage: 0,
        taxTotal: 0,
      },
      trim: true,
    },
    grandTotal: {
      type: Number,
      default: 0,
      trim: true,
    },
    tripStatus: {
      type: String,
      default: "",
      enum: [
        bookingStatus.arrived,
        bookingStatus.picked,
        bookingStatus.completed,
        bookingStatus.finding_driver,
        bookingStatus.canceled,
        bookingStatus.ontheway,
      ],
      index: true,
    },
    wayPointsTripStatus: {
      type: [
        {
          tripStatus: { type: String, default: bookingStatus.arrived },
          arrivedAt: { type: Date, default: null },
          pickedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
    canceledBy: {
      type: String,
      default: "",
    },
    canceledReason: {
      type: String,
      default: "",
    },
    cancelledByDriver: [
      {
        canceledByDriver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Drivers",
          default: null,
        },
        driverCanceledReason: { type: String, default: "" },
        acceptedAt: { type: Date, default: null },
        arrivedAt: { type: Date, default: null },
        canceledAt: { type: Date, default: null },
      },
    ],
    paymentId: {
      type: String,
      default: "",
    },
    paymentMethodId: {
      type: String,
      default: "",
    },
    paymentIntentId: {
      type: String,
      default: "",
    },
    waitingChargesIntent: {
      type: String,
      default: "",
    },
    otp: { type: Number, default: null },
    expectedBilling: {
      km: { type: Number, default: 0 },
      kmText: { type: String, default: "" },
      duration: { type: Number, default: 0 },
      durationText: { type: String, default: "" },
      pricing: { type: Array, default: [] },
      driverEarning,
      userBilling,
    },
    finalBilling: {
      km: { type: Number, default: 0 },
      kmText: { type: String, default: "" },
      duration: { type: Number, default: 0 },
      durationText: { type: String, default: "" },
      pricing: { type: Array, default: [] },
      driverEarning,
      userBilling,
    },
    driverRating,
    userRating,
    pickedAt: { type: Date, default: null },
    dropedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    maxReachingSeconds: { type: Number, default: 0 },
    matchJobDistance: { type: Number, default: 0 },
    pickUpKm: { type: Number, default: 0 },
    pickUpTime: { type: Number, default: 0 },
    switchRider: {
      bookRide: { type: String, default: "SELF" },
      passenger: { type: Number, default: 1 },
    },
    shareLocWithDriver: { type: Boolean, default: false },
    time: {
      type: String,
      default: "",
    },
    waitingTime: {
      type: Array,
      default: [],
    },
    isForce: { type: Boolean, default: false },
    isThanks: { type: Boolean, default: false },
    paymentStatus: {
      type: Boolean,
      default: false,
    },
    paymentStep: {
      type: String,
      enum: ["created", "succeeded", "failed"],
      default: "created",
    },
    nearByNotification: {
      type: Boolean,
      default: false,
    },
    sosCall: {
      type: {
        isSosCalled: { type: Boolean, default: false },
        sosCalledAt: { type: Date, default: null },
      },
    },
    noShowSmsCall: {
      type: Boolean,
      default: false,
    },
    scheduled: {

      isScheduled: { type: Boolean, default: false },
      scheduledAt: { type: Date, default: null },
      OneHourBeforeNotification: { type: Boolean, default: false },
      fourtyFiveBeforeNotification: { type: Boolean, default: false },
      fifteenBeforeNotification: { type: Boolean, default: false },
      fiveBeforeNotification: { type: Boolean, default: false },
      startRide: { type: Boolean, default: false },

    },
    searchingCompleted: {
      type: Boolean,
      default: false,
    },
    searchingCount: {
      type: Number,
      default: 0,
    },
    autoReplacedJob: {
      type: Number,
      default: 0,
    },
    sharedRide: {
      type: Boolean,
      default: false,
    },
    lastMatchedAt: {
      type: Date,
      default: null,
    },
    priorityMatchedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

RideBookingsSchema.index({ firstTripAddressGeoLocation: "2dsphere" });

export default mongoose.model("RideBookings", RideBookingsSchema);
