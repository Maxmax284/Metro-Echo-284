import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.07be8715ced142beb03b9019c21f3975",
  appName: "Vanta",
  webDir: "dist",
  server: {
    url: "https://07be8715-ced1-42be-b03b-9019c21f3975.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    LocalNotifications: { smallIcon: "ic_stat_icon" },
  },
};

export default config;
