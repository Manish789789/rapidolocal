import { resources } from "@/utils/resources";
import citiesModel from "../models/cities.model";

export const { index, create, edit, editBySlug, update, multiDeleteItem } =
  resources(citiesModel);

export const editId = async ({ params, error }: any) => {
  try {
    const { id } = params;

    const cities = await citiesModel.find({ country: id });

    if (!cities) {
      return error(404, {
        status: 404,
        message: "City not found",
      });
    }

    return {
      success: true,
      data: cities,
      message: "City fetched successfully",
    };
  } catch (e: any) {
    return error(500, {
      status: 500,
      message: e.message || "Internal Server Error",
    });
  }
};
