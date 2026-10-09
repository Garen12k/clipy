// Clipy sends LOCAL notifications only ("your export is ready"). The `expo-notifications` config plugin always adds the remote
// push entitlement (`aps-environment`; its withNotificationsIOS has no switch for it, and prebuild applies that plugin for any
// installed copy of the package, listed in app.json or not). With that entitlement EAS would switch the Push Notifications
// capability on for the app's identifier and the provisioning profile would have to be made again.
// This plugin takes the entitlement out again, so the app is signed exactly as before.
//
// ORDER MATTERS: a mod registered EARLIER runs LATER (@expo/config-plugins withMod: the newest mod runs first and hands on to
// the one before it). So this entry must stay ABOVE "expo-notifications" in app.json's `plugins` — then it runs after it.
// Proof: `npx expo config --type introspect` must show no `aps-environment` under `ios.entitlements`
// (pinned by src/__tests__/appConfig.test.ts for the order). Delete this file and its app.json entry the day remote push is wanted.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults["aps-environment"];
    return c;
  });
};
