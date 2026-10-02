import { Redirect } from "expo-router";

/** Safety net: the OAuth return link is normally consumed by the auth session, but if iOS opens it as a plain deep link, land on Accounts. */
export default function OAuthReturn() {
  return <Redirect href="/accounts" />;
}
