import { file } from "bun";
import mongoose from "mongoose";
const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  placeholder: { type: String, default: "" },
  type: {
    type: String,
    enum: [
      "Text",
      "Textarea",
      "Number",
      "Email",
      "Password",
      "Select",
      "Radio",
      "Date",
      "Time",
      "Checkbox",
      "File",
      "URL",
      "Tel",
      "Color",
      "Range",
      "Signature"
    ],
    default: "Text",
  },
  options: [
    {
      label: String,
      value: String,
    },
  ],
  fileType: [
    {
      type: String,
      enum: [".jpg", ".pdf", ".png", ".webp"],
      default: "",
    },
  ],
  image: { type: String, default: false },
  required: {
    type: Boolean,
    default: false,
  },
});
const dynamicFormSchema = new mongoose.Schema({
  header: {
    type: String,
    required: true,
    unique: true,
  },
  subheader: {
    type: String,
    default: "",
  },
  instructions_html: {
    type: String,
    default: "",
  },
  status: {
    type: Boolean,
    default: true,
  },
  fields: [fieldSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});
const FormSchema = new mongoose.Schema({
  country: {
    name: { type: String, required: true },
    driverGeoArea: [
      { type: mongoose.Schema.Types.ObjectId, ref: "DriverGeoAreas" },
    ],
  },
  sessions: [
    {
      sessionName: { type: String, required: true },
      forms: { type: [dynamicFormSchema], required: true },
    },
  ],
});
export default mongoose.model("DriverForm", FormSchema);
