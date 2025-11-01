import * as mongoose from 'mongoose'

const CountriesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please enter the name"],
    trim: true,
  },
  flag: { type: String, default: "", trim: true },
  iso3: { type: String, default: "", trim: true },
  iso2: {
    type: String,
    default: "",
  },
  numeric_code: {
    type: String,
    default: "",
  },
  phone_code: {
    type: String,
    default: "",
  },

  capital: {
    type: String,
    default: "",
  },
  currency: {
    type: String,
    default: "",
  },
  currency_name: {
    type: String,
    default: "",
  }, currency_symbol: {
    type: String,
    default: "",
  }, tld: {
    type: String,
    default: "",
  }, native: {
    type: String,
    default: "",
  }, region: {
    type: String,
    default: "",
  },
  subregion: {
    type: String,
    default: "",
  },
  timezones: {
    type: Array,
    default: "",
  },
  translations: {
    type: Object,
    default: "",
  },
  latitude: {
    type: String,
    default: "",
  },
  longitude: {
    type: String,
    default: "",
  },
  emoji: {
    type: String,
    default: "",
  },
  emojiU: {
    type: String,
    default: "",
  },
  states: {
    type: Array,
    default: [],
  },
  stationCount: { type: Number, default: 0 },

  location: {
    type: {
      type: String
    },
    coordinates: []
  }
}, { timestamps: true });
CountriesSchema.index({ location: "2dsphere" });
CountriesSchema.index({ name: 1 }, { unique: true });

export default mongoose.model("Countries", CountriesSchema);
