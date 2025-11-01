import { generateRandomNumbers } from "@/utils";
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  fullName: { type: String, trim: true, default: "" },
  userID: { type: String, default: "", trim: true },
  password: { type: String, trim: true, default: "" },
  phone: { type: String, default: "", trim: true, unique: true },
  email: { type: String, trim: true, default: "" },
  gender: { type: String, trim: true, default: "" },
  rating: { type: Number, default: 5 },
  address: {
    type: {
      address: { type: String, default: "", trim: true },
      city: { type: String, default: "", trim: true },
      state: { type: String, default: "", trim: true },
      postalCode: { type: String, default: "", trim: true },
      country: { type: String, default: "", trim: true },
    }
  },
  dob: {
    type: Date,
    default: "",
  },
  socket_id: {
    type: String,
    default: "",
  },
  inviteBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
  inviteCode: { type: String, default: "", index: true },
  avatar: { type: String, default: "" },
  wallet: { type: Number, default: 0.0 },
  isVerified: { type: Boolean, default: false },
  otp: { type: String, default: "" },
  otpExpireAt: { type: Date, default: new Date(Date.now() + 5 * 60 * 1000), },
  extraFields: { type: Object, default: {} },
  rideCount: { type: Number, default: 0 },
  fcmToken: {
    type: String,
    default: "",
  },
  shareLocWithDriver: { type: Boolean, default: false },
  theme: {
    type: String,
    default: "default",
  },
  otpCheckCount: {
    type: Number,
    default: 0,
  },
  isBlocked: {
    type: Date,
    default: Date.now,
  },
  deletedAt: {
    type: Date,
    default: null
  },
  country: {
    name: { type: String, required: [true, "Please enter country."], trim: true },
    countryCode: { type: String, required: [true, "Please enter country code."], trim: true },
    currencySymbol: { type: String, required: [true, "Please enter currency symbol."], trim: true },
    currencyCode: { type: String, required: [true, "Please enter currency code."], trim: true }
  },
  paymentGatewayCustomerId: {
    testStripeCustomerId: { type: String, trim: true, default: "" },
    stripeCustomerId: { type: String, trim: true, default: "" },
    testSquareCustomerId: { type: String, trim: true, default: "" },
    SquareCustomerId: { type: String, trim: true, default: "" },
  },
  socialAccount: {
    type: Object,
    default: {
      google: null,
      facebook: null,
      apple: null,
      instagram: null,
      linkdin: null,
    },
  },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
    default: {
      coordinates: []
    }
  },
  heading: {
    type: Number,
    default: 0,
  },
  deviceInfo: {
    type: Object,
    default: {}
  },
  favDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
  blockDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
  defaultOtpCode: {
    type: String,
    default: "random", // auto , NO CODE
    enum: ["random", "custom", "fixed", "no_code"],

  },
  defaultOtpCodeValue: {
    type: String,
    default: "",
  },
}, { timestamps: true });

UserSchema.pre("save", async function (this: any, next) {
  let color = [
    "AFCFFD",
    "FCC5B7",
    "ABCFE0",
    "9FDEDA",
    "C7D9A8",
    "BFC5EE",
    "E8BBC1",
    "E1C8CE",
  ];

  var item = color[Math.floor(Math.random() * color.length)];
  if (typeof this.avatar == 'undefined' || this.avatar == '') {
    this.avatar = `https://ui-avatars.com/api/?background=1E1E1E&color=${item}&name=${this.fullName}`;
  }
  if (this?.password && this.password.length > 0) {
    this.password = await Bun.password.hash(this.password, {
      algorithm: "bcrypt",
      cost: 4,
    });
  }
  this.userID = `UID${generateRandomNumbers(6)}`;
  next();
});

UserSchema.methods.checkPassword = async function (this: any, password: any) {
  return await Bun.password.verify(password, this.password);
};

export default mongoose.model("Users", UserSchema);