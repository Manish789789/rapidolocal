import { resources } from "@/utils/resources";
import formmodel from "../../models/form.model.ts";

export const { index, create, edit, update, deleteItem } = resources(formmodel);
