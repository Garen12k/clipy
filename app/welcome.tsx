import { router } from "expo-router";
import { WelcomeScreen } from "@/src/auth/WelcomeScreen";

/** /welcome — the sign-in page opened from Accounts or Post (first launch draws the same screen from app/index.tsx). Leaving returns to the opener. */
export default function WelcomeRoute() {
  return <WelcomeScreen onDone={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
