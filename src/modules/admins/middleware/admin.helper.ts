import CryptoJS from "crypto-js";
export const decryptPassword = async (
  { body, request }: any,
  passwordFor = "create"
) => {
  if (body?.password) {
    body.password = CryptoJS.AES.decrypt(
      body.password,
      `${process.env.BODY_ENCRYPTION_KEY}`
    )?.toString(CryptoJS.enc.Utf8);
    // if (request.url.includes('/update')) {
    //     body.password = await Bun.password.hash(body.password, {
    //         algorithm: "bcrypt",
    //         cost: 4,
    //     });
    // }
  }
};
