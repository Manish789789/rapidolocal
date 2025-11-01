import mongoose from "mongoose";
const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
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
    ],
    required: true,
  },
  options: [
    {
      label: String,
      value: String,
    },
  ],
  fileType: [{
    type: String,
    enum: [".jpg", ".pdf", ".png", ".webp"],
    default: "",
  }],
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
    required: true,
  },
  html: {
    type: String,
    required: true,
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
    provision: [{ type: String, required: true }],
  },
  forms: [dynamicFormSchema],
});
export default mongoose.model("DriverForm", FormSchema);
