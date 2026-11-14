// Replies from before the rename used ```studypilot-… blocks; read them the same as ```campuspilot-….
export const newTags = (text) => String(text ?? "").replace(/```(\s*)studypilot-/g, "```$1campuspilot-");
