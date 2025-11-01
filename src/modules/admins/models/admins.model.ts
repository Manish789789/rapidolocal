import mongoose from "mongoose";
import { generateRandomNumbers } from "@/utils";

const AdminSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    userID: { type: String, default: "", trim: true },
    password: { type: String, trim: true, required: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, trim: true, default: "" },
    address: {
      type: {
        address: { type: String, default: "", trim: true },
        city: { type: String, default: "", trim: true },
        state: { type: String, default: "", trim: true },
        postalCode: { type: String, default: "", trim: true },
        country: { type: String, default: "", trim: true },
      },
    },
    role: { type: mongoose.Schema.Types.ObjectId, ref: "Roles" },
    avatar: { type: String, default: "" },
    otp: { type: String, default: "" },
    otpExpireAt: { type: Date, default: new Date(Date.now() + 5 * 60 * 1000) },
    extraFields: { type: Object, default: {} },
    superAdmin: { type: Boolean, default: false },
    fcmToken: {
      type: String,
      default: "",
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
      default: null,
    },
  },
  { timestamps: true }
);

AdminSchema.pre("save", async function (this: any, next) {
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
  if (typeof this.avatar == "undefined" || this.avatar == "") {
    this.avatar = `https://ui-avatars.com/api/?background=1E1E1E&color=${item}&name=${this.fullName}`;
  }

  if (this?.password && this.password.length > 0) {
    this.password = await Bun.password.hash(this.password, {
      algorithm: "bcrypt",
      cost: 4,
    });
  }
  this.userID = `STF${generateRandomNumbers(6)}`;

  next();
});

AdminSchema.methods.checkPassword = async function (
  this: any,
  password: string
) {
  return await Bun.password.verify(password, this.password);
};

export default mongoose.model("Admins", AdminSchema);
