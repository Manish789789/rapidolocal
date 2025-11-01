import { pagination, resources } from "@/utils/resources";
import model from "../../models/pricing.model";
import vehicleTypeModel from "@/modules/drivers/models/vehicleType.model";

export const { create, edit, update, deleteItem } = resources(model);

export const index = async ({ body, error }: any) => {
  try {
    body.populate = [
      {
        path: "states",
        select: "name",
      },
      {
        path: "geo",
        select: "name",
      },
      {
        path: "country",
        select: "name",
      },
    ];
    body.selectedField = {
      name: 1,
      country: 1,
    };
    let list: any = await pagination(body, model);
    list.lists = list.lists.map((item: any) => {
      return {
        _id: item._id,
        pricingType: item.pricingType,
        status: item.status,
        createdAt: item.createdAt,
        name:
          item.pricingType == "state"
            ? item?.states?.map((state: any) => state?.name)?.join(", ")
            : item?.geo?.map((geo: any) => geo?.name).join(", "),
        country: item?.country?.name,
      };
    });
    return {
      success: true,
      data: list,
    };
  } catch (errorData: any) {
    return error(400, {
      success: false,
      message: errorData?.message || "",
    });
  }
};
export const services = async ({ query, error }: any) => {
  try {
    const { country } = query;

    const vehicleTypes = await vehicleTypeModel
      .find({ country, status: true })
      .select("name ")
      .sort({ priority: 1 })
      .lean();

    return {
      success: true,
      data: vehicleTypes,
      message: "Vehicle types fetched successfully",
    };
  } catch (e: any) {
    return error(500, {
      status: 500,
      message: e.message || "Internal Server Error",
    });
  }
};
