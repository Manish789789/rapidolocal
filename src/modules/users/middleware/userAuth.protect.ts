import usersAuthActivityModel from "../models/usersAuthActivity.model";

export const userAuthProtect = async (ctx: any) => {

  const { request, jwt, error } = ctx
  let token;
  const authorizationToken = request.headers.get('authorization')
  try {
    if (authorizationToken && authorizationToken.startsWith("Bearer")) {
      token = authorizationToken.split(" ")[1];
    }
    if (!token) {
      return error(401, {
        success: false,
        message: 'You need to be logged in to visit this route'
      })
    }
    const profile = await jwt.verify(token)
    if (!profile) {
      return error(401, {
        success: false,
        message: 'Invalid authorization token'
      })
    }
    let user: any = await usersAuthActivityModel.findOne({ token }).populate('user').lean();
    if (!user) {
      return error(401, { message: 'Invalid authorization token', success: false });
    }
    request.user = user.user;
    request.token = token;
  } catch (errorMsg: any) {
    return error(401, {
      success: false,
      message: errorMsg.message
    })
  }
};