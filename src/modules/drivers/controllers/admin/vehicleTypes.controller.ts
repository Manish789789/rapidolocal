import { resources } from "@/utils/resources";
import vehicleTypeModel from "../../models/vehicleType.model";
export const { index, create, edit, update, deleteItem, multiDeleteItem } =
  resources(vehicleTypeModel);
