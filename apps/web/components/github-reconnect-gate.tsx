"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useGitHubConnectionStatus } from "@/hooks/use-github-connection-status";
import { useSession } from "@/hooks/use-session";
import { buildGitHubReconnectUrl } from "@/lib/github/connection-status";
import { GitHubReconnectDialog } from "./github-reconnect-dialog";

export function GitHubReconnectGate() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, hasGitHub, loading } = useSession();
  const { reconnectRequired, reason, isLoading } = useGitHubConnectionStatus({
    enabled: isAuthenticated && hasGitHub,
  });

  const reconnectUrl = useMemo(() => {
    const search = searchParams.toString();
    const next = search ? `${pathname}?${search}` : pathname;
    return buildGitHubReconnectUrl(next);
  }, [pathname, searchParams]);

  if (
    loading ||
    !isAuthenticated ||
    !hasGitHub ||
    isLoading ||
    !reconnectRequired
  ) {
    return null;
  }

  return (
    <GitHubReconnectDialog open reason={reason} reconnectUrl={reconnectUrl} />
  );
}
