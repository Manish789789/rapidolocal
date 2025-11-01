import { resources } from "@/utils/resources";
import adminsModel from "../../models/admins.model";
import bcrypt from "bcryptjs";
export const { index, create, edit, deleteItem, update } =
  resources(adminsModel);
