require("dotenv").config();
const webPush = require("web-push");

webPush.setVapidDetails(
  "mailto:ATuPuerta@gmail.org",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = webPush;