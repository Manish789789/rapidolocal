import * as mongoose from 'mongoose'

const CitiesSchema = new mongoose.Schema({
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
  slug: {
    type: String,
    default: "",
    index: true,
  },
  country: { type: mongoose.Schema.Types.ObjectId, ref: "Countries" },
}, { timestamps: true });

CitiesSchema.pre("save", async function (next) {
  const slug = this.name;
  this.slug = slug
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
  next();
});
export default mongoose.model("Cities", CitiesSchema);
