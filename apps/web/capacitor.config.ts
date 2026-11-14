import type { CapacitorConfig } from "@capacitor/cli";

/** Wraps the same web build as an iOS and an Android app. The appId is a placeholder until the company name is final. */
const config: CapacitorConfig = {
  appId: "in.kootumaligai.app",
  appName: "Kootu Maligai",
  webDir: "dist",
};
export default config;
