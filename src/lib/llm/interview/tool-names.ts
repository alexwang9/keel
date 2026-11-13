// Kept apart from tools.ts so client code that validates the history doesn't bundle the SDK.
export const UPDATE_SPEC = "update_spec";
export const FINISH_INTERVIEW = "finish_interview";
export const INTERVIEW_TOOL_NAMES = [UPDATE_SPEC, FINISH_INTERVIEW] as const;
