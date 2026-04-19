export interface Session {
  created: number;
  authProvider: "vercel" | "github" | "guest";
  user: {
    id: string;
    username: string;
    email: string | undefined;
    avatar: string;
    name?: string;
  };
}

export interface SessionUserInfo {
  user: Session["user"] | undefined;
  authProvider?: "vercel" | "github" | "guest";
  hasGitHub?: boolean;
  hasGitHubAccount?: boolean;
  hasGitHubInstallations?: boolean;
}
