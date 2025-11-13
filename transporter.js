const nodemailer = require("nodemailer");
// Create transporter based on provider
function createTransporter(provider, creds) {
  // creds: { user, pass, host?, port?, secure? } - prefer env values
  if (provider === "gmail") {
    return nodemailer.createTransport({
      host: creds.host || "smtp.gmail.com",
      port: creds.port ? Number(creds.port) : 465,
      secure: typeof creds.secure !== "undefined" ? creds.secure : true,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });
  }
  // zoho
  if (provider === "zoho") {
    return nodemailer.createTransport({
      host: creds.host || "smtp.zoho.com",
      port: creds.port ? Number(creds.port) : 465,
      secure: typeof creds.secure !== "undefined" ? creds.secure : true,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });
  }
  throw new Error("Unsupported provider: " + provider);
}
module.exports = { createTransporter };