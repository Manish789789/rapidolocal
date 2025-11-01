import { resources } from "@/utils/resources";
import model from "../../models/userWalletTransactions.model";

export const { index, create, edit, update, deleteItem } = resources(model)