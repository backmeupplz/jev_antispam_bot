// Coupled with jev-laya approved_policy.py, Decision #69/3196 plus the #85
// prompt-only testimonial example pair (same ckpt-v2 and gates).
export const APPROVED_MODEL = "laya-jev-ckpt-v2-examples-85-83403c71";
export const APPROVED_PROMPT_SHA256 = "83403c71dcdb06854e38456abac6951e1073501491e1053f93d4d4cabb610757";
export const APPROVED_CHECKPOINT_SHA256 = "d899eecd8fa4bc2f2104bef2a9f9fb0d42c6a065060806f60f7e66e7b02a3e4e";
// Earlier configured identities of the same checkpoint resolve to the current prompt.
const ALIASES = new Set(["laya-jev-ckpt-v2", "laya-jev-ckpt-v2-examples-856e52e3"]);
export function effectiveModel(configured: string): string {
  return ALIASES.has(configured) ? APPROVED_MODEL : configured;
}
