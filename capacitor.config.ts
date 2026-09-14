import type { CapacitorConfig } from "@capacitor/cli";

// Metro Echo. The shell loads the published address, never a preview host —
// a preview URL is temporary and leaves an installed app pointing nowhere.
const config: CapacitorConfig = {
  appId: "app.lovable.07be8715ced142beb03b9019c21f3975",
  appName: "Metro Echo",
  webDir: "dist",
  server: {
    url: "https://metroecho.lovable.app",
    cleartext: false,
  },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { smallIcon: "ic_stat_icon" },
  },
};

export default config;
