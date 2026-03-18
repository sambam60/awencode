import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpcRequest, rpcNotify } from "@/lib/rpc-client";

export function useRpcQuery<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery<T>({
    queryKey: ["rpc", method, params],
    queryFn: () => rpcRequest<T>(method, params),
    ...options,
  });
}

export function useRpcMutation(method: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      rpcRequest(method, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rpc"] });
    },
  });
}

export function useRpcNotify(method: string) {
  return useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      rpcNotify(method, params),
  });
}
