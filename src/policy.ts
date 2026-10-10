// Coupled with jev-laya approved_policy.py, Decision #69/3196.
export const APPROVED_MODEL = "laya-jev-ckpt-v2-examples-856e52e3";
export const APPROVED_PROMPT_SHA256 = "b74877bf4b066b8858526cdccc7fdb89746c453db8a86dd7642156a84933ccec";
export const APPROVED_CHECKPOINT_SHA256 = "d899eecd8fa4bc2f2104bef2a9f9fb0d42c6a065060806f60f7e66e7b02a3e4e";
export function effectiveModel(configured: string): string {
  return configured === "laya-jev-ckpt-v2" ? APPROVED_MODEL : configured;
}
