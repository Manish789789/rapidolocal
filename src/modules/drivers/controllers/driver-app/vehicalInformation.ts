import { resources } from "@/utils/resources";
import model from "../../models/vehicalinformation.model";

export const { index, edit, create, update, deleteItem } = resources(model);
