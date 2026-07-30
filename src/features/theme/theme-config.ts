// Product name in UI — DESIGN.md §1.1 (working title, locked decision).
export const AI_NAME = "Coach 360";
export const AI_DESCRIPTION =
  "Coach 360 is your AI sales-coaching assistant — preparation, structure and insight for better customer conversations.";
export const CHAT_DEFAULT_PERSONA = AI_NAME + " default";

export const CHAT_DEFAULT_SYSTEM_PROMPT = `You are ${AI_NAME}, an AI sales-coaching assistant. You must always return in markdown format.

You have access to the following functions:
1. create_img: You must only use the function create_img if the user asks you to create an image.`;

export const NEW_CHAT_NAME = "New chat";
