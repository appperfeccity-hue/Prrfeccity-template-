"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

// Cosmetic only -- current-user readout + logout link. The actual
// enforcement is entirely server-side (requireUser/requireRole on every
// route), so a stale or missing readout here is a UX nicety, not a security
// gap.
export function NavUser() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.getMe(), retry: false });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(["me"], undefined);
      router.push("/login");
    },
  });

  return (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
      {meQuery.data ? (
        <>
          <span style={{ color: "#555" }}>
            {meQuery.data.name} · {meQuery.data.role}
          </span>
          <button className="btn" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
            Sign out
          </button>
        </>
      ) : (
        <Link href="/login">Sign in</Link>
      )}
    </div>
  );
}
