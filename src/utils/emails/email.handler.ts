import signupVerificationTemplate from "./templates/signupVerification.template";
import loginWithOTPTemplate from "./templates/loginWithOTP.template";
import welcomeTemplate from "./templates/welcome.template";
import forgotPasswordTemplate from "./templates/forgotPassword.template";
import updateProfileTemplate from "./templates/updateProfile.template";
import { getSettings } from "@/plugins/settings/settings.plugin";
import { zeptoGateway } from "./gateways/zepto.gateway";
import { smtpGateway } from "./gateways/smtp.gateway";

export const appName = process.env.APP_NAME || 'Nogiz';
export const appColor = '#5d25ff';
export const appLogo = 'https://s3.ca-central-1.wasabisys.com/rapidoride/cropped-website-logo.png'
export const siteUrl = process.env.SITE_URL || 'https://nogiz.com';

export const sendEmail = async (emailDetails: any) => {
  try {

    const settings = getSettings();
    if (!settings?.emailGateway?.gateway) {
      return;
    }

    switch (settings.emailGateway.gateway) {
      case 'smtp':
        await smtpGateway({
          host: settings.emailGateway.host,
          port: settings.emailGateway.port,
          username: settings.emailGateway.username,
          password: settings.emailGateway.password,
          fromEmail: settings.emailGateway.fromEmail || `noreply@${process.env.APP_DOMAIN}`,
          fromName: settings.emailGateway.fromName || `${appName} Team`,
          toEmail: emailDetails.email,
          toName: emailDetails?.fullName || "",
          subject: emailDetails?.subject,
          html: emailDetails.html
        });
        break;
      case 'zepto':
        await zeptoGateway({
          mailToken: settings.emailGateway.mailToken,
          apiUrl: settings.emailGateway.apiUrl,
          fromEmail: settings.emailGateway.fromEmail || `noreply@${process.env.APP_DOMAIN}`,
          fromName: settings.emailGateway.fromName || `${appName} Team`,
          toEmail: emailDetails.email,
          toName: emailDetails?.fullName || "",
          subject: emailDetails?.subject,
          html: emailDetails.html
        });
        break;
      default:
        break;
    }
  } catch (e) {
  }
}


export const updateProfileVerificationNotification = (userD: any, otp: any) => {
  sendEmail({
    ...userD,
    subject: `${appName} | Profile Update Request`,
    html: updateProfileTemplate({
      fullName: userD?.fullName,
      email: userD?.email,
      otp: otp
    })
  })
}
export const loginOtpNotification = (userD: any, otp: any) => {

  sendEmail({
    ...userD,
    subject: `${appName} | OTP to Verify Email`,
    html: loginWithOTPTemplate({
      fullName: userD?.fullName,
      email: userD?.email,
      otp: otp
    })
  })
}

export const welcomeEmailNotification = (userD: any) => {

  sendEmail({
    ...userD,
    subject: `Welcome to ${appName}`,
    html: welcomeTemplate({
      fullName: userD?.fullName,
      email: userD?.email
    })
  })

}

export const signupVerificationNotification = (settings: any, userD: any, otp: any) => {

  sendEmail({
    ...userD,
    settings,
    subject: `Nogiz | OTP to Verify Email`,
    html: signupVerificationTemplate({
      fullName: userD?.fullName,
      email: userD?.email,
      otp: otp
    })
  })
}

export const forgotPasswordNotification = (userD: any, otp: any) => {

  sendEmail({
    ...userD,
    subject: 'Forgot password',
    html: forgotPasswordTemplate({
      fullName: userD?.fullName,
      email: userD?.email,
      otp: otp
    })
  })
}

export const sosCallNotification = (userD: any, orderDetails: any) => {
  sendEmail({
    ...userD,
    subject: 'Emergency Enabled For User',
    html: forgotPasswordTemplate({
      fullName: userD?.fullName,
      email: userD?.email,
      ...orderDetails
    })
  })

}