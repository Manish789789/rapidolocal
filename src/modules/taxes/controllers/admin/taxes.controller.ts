import { resources } from "@/utils/resources";
import model from "../../models/taxes.model";
export const { index, create, edit, update, deleteItem } = resources(model)
