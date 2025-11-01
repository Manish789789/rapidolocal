import { appLogo, appName, siteUrl } from "../email.handler"

export default (body: any) => {
    return `
    <div id="panel" style="padding:10px; max-width: 400px;margin: auto; background-color: #fff;">
    <style type="text/css">
      * {
        margin: 0;
        padding: 0;
      }
    </style>
    <table cellpadding="0px" width="100%" cellspacing="0" style="vertical-align: top; font-family: 'Muli', sans-serif;">
      <tbody>
        <tr>
          <td style="border-top: 1px solid #ccc; border-left: 1px solid #ccc; padding: 10px;">
            <img style="display: inline-block;" src="${appLogo}" width="66px" />
          </td>
          <td style="text-align: right; padding: 10px; border-top: 1px solid #ccc;border-right: 1px solid #ccc;">
            <h2 style="font-size: 16pt; font-weight: 600; margin: 0px;    white-space: nowrap;">Nogiz</h2><br />
            <a style="color: #000; text-decoration: none; font-size: 10pt;" target="_blank"
              href="${siteUrl}">${siteUrl}</a>
          </td>
        </tr>
  
        <tr>
          <td colspan="2" style="">
            <table cellpadding="0px" style="vertical-align: top;" cellspacing="0" width="100%">
              <tr>
                <td
                  style="text-align: center; font-size: 14pt; border: 1px solid #ccc; font-weight:bold; padding-top: 15px; padding-bottom: 15px;">
                  Verify Your Email Address
                </td>
              </tr>
              <tr>
                <td style="border-left: 1px solid #ccc; border-right: 1px solid #ccc; padding: 10px; text-align: center;">
                  <h3 style=" margin: 0px;padding-bottom: 15px; font-size: 10.5pt; font-weight:bold;">Hello
                    ${body?.fullName}</h4>
                    <p style=" margin: 0px;    margin-top: 10px; color: #02008e; font-size: 9.5pt;">Please verify your
                      email to finish the signing up process for your Nogiz account. You'll need to use the
                      following One Time Password (OTP):</p>
                    <h2 style="font-size: 20pt; padding-top: 25pt; padding-bottom: 25pt;margin: 0px;">${body.otp}</h2>
                    <p style=" margin: 0px;font-size: 9.5pt;">The OTP is valid for 1 minute.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: center; background-color: #0049a714;">
                  <p style=" margin: 0px;font-size: 8.5pt;">If you did not associate your email address with a Nogiz
                    account, please ignore this message and do not share the OTP with anyone.</p>
                  <p style=" margin: 0px; font-size: 8.5pt; padding-top: 25pt; padding-bottom: 25pt;">This email was sent
                    to ${body.email} You've received this email
                    because you created a Nogiz account. This email is not a marketing or promotional email.</p>
                  <h6 style="font-size: 10.5pt;margin: 0px; font-weight: bold;">Nogiz</h6>
                  <p style=" margin: 0px; font-size: 6pt;">Powered by <span style="text-decoration: none; color: #000;"> ${appName}</span></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </div>`
}