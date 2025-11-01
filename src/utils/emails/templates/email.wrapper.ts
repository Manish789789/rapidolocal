import { appLogo, appName, appColor } from "../email.handler"

export default (body: any, children: any) => {
  return `
    <table style="width:100%;background-color:${appColor}05;border-spacing:0">
      <tbody>
        <tr>
          <td style="padding:0">
            <div style="max-width:500px;margin:30px auto;padding:54px 48px 48px;background-color:white;border-radius:16px">
              <table style="border-spacing:0;font-family:'Open Sans',Roboto,-apple-system,BlinkMacSystemFont,'Segoe UI',Oxygen,Ubuntu,Cantarell,'Helvetica Neue',sans-serif">
                <tbody>
                  <tr>
                    <td style="text-align:center;padding:0 30px">
                      <img src="${appLogo}" height="60" alt="Zupet Logo" >
                    </td>
                  </tr>
                  <tr>
                    <td>
                      ${children}
                    </td>
                  </tr>
                  <tr>
                    <td style="text-align:center;vertical-align:middle;background-color:#f6f6f6;padding-bottom:24px;padding:24px;">       
                  <p style=" margin: 0px;font-size: 8.5pt;">If you did not associate your email address with a ${appName}  account, please ignore this message.</p>
                  <p style=" margin: 0px; font-size: 8.5pt; padding-top: 25pt; padding-bottom: 25pt;">This email was sent
                    to ${body.email} You've received this email
                    because you created a ${appName} account. This email is not a marketing or promotional email.</p>
                  <h6 style="font-size: 10.5pt;margin: 0px; font-weight: bold;">${appName}</h6>
                  <p style=" margin: 0px; font-size: 6pt;">Powered by <span style="text-decoration: none; color: #000;"> Nogiz</span></p>
              
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>`
}