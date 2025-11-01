import { resources } from "@/utils/resources";
import couponsModel from "../../models/coupons.model";
export const { index, create, edit, update, deleteItem, multiDeleteItem } =
  resources(couponsModel);
