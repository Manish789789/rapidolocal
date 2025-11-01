import { resources } from "@/utils/resources";
import model from "../../models/roles.model";
export const { index, create, edit, update, deleteItem } = resources(model);
