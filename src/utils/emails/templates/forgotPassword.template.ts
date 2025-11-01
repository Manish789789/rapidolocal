import { appLogo, appName, siteUrl, appColor } from "../email.handler"
import emailWrapper from "./email.wrapper"

export default (body: any) => {

  return emailWrapper(body, `
  <table style="font-size:18px;width:100%;border-spacing:0;padding-top:48px;padding-bottom:48px">
    <tbody>
      <tr>
        <td style="text-align:center;padding-bottom:40px;font-weight:700;font-size:30px">
          Forgot your password?
        </td>
      </tr>
      <tr>
        <td>Hi ${body?.fullName},</td>
      </tr>
      <tr>
        <td style="padding-top:32px;padding-right:10px">
          Please verify your email to finish the forgot password process for your ${appName} account. You'll need to use the following One Time Password (OTP) :
        </td>
      </tr>
        <tr>
          <td style="text-align:center;padding-top:48px">
              <h2 style="font-size: 20pt; padding-top: 25pt; padding-bottom: 25pt;margin: 0px;">${body.otp}</h2>
              <p style=" margin: 0px;font-size: 9.5pt;">The OTP is valid for 1 minute.</p>
          </td>
        </tr>                
        </tbody>
      </table>`)
}