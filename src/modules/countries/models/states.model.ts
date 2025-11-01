import * as mongoose from 'mongoose'

const StatesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please enter the name"],
    trim: true,
  },
  countryCode: {
    type: String,
    default: "",
    index: true,
    trim: true,
  },
  slug: { type: String,  default: "", index: true  },
  stateCode: { type: String,  default: "" },
  stateType: { type: String,  default: "" },
  country: { type: mongoose.Schema.Types.ObjectId, ref: "Countries" },
  location: {
    type: {
      type: String
    },
    coordinates: []
  }
}, { timestamps: true });

StatesSchema.pre("save", async function (next) {
  const slug = this.name;
  this.slug = slug
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
  next();
});
StatesSchema.index({ location: "2dsphere" });

export default mongoose.model("States", StatesSchema);
