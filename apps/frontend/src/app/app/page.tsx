import { OAuthTokenHandler } from "@/components/auth/OAuthTokenHandler";
import { Workspace } from "@/components/Workspace";

export default function AppPage() {
  return (
    <>
      <OAuthTokenHandler />
      <Workspace />
    </>
  );
}
