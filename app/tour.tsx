import { router } from "expo-router";
import { WelcomeWizard } from "@/src/auth/WelcomeWizard";

/**
 * /tour — the first-launch wizard shown again, from page 1, by "Show welcome again" on Accounts. A replay: the "seen" flag and the
 * session are left as they are. Finishing or closing it returns to where it was opened from.
 */
export default function TourRoute() {
  return <WelcomeWizard replay onDone={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
