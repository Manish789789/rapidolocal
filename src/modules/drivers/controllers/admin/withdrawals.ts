import { resources } from "@/utils/resources";
import model from "@/modules/drivers/models/driversWithdrawal.model";
export const { index, create, edit, update, deleteItem } = resources(model);
